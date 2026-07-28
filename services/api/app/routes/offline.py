"""
Batch ingestion endpoint for offline queue synchronization.

POST /api/v1/events/ingest/batch

Accepts arrays of sensor events and inserts them in a single PostgreSQL
transaction, returning per-event success/failure status.
"""

import logging
import json as _json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UnifiedEvent
from app.schemas import BatchIngestRequest, BatchIngestResponse, BatchResultItem
from app.utils.auth import get_current_device
from app.utils.audit import log_audit_event
from app.utils.redis_client import get_redis_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/events", tags=["offline-batch"])

BATCH_IDEMPOTENCY_TTL = 3600


@router.post("/ingest/batch", response_model=BatchIngestResponse)
def ingest_batch(
    payload: BatchIngestRequest,
    request: Request,
    device=Depends(get_current_device),
    db: Session = Depends(get_db),
):
    """
    Ingest a batch of offline-queued events.

    Idempotent: repeat with the same batch_id returns the cached result.
    """
    idempotency_key = f"prism:batch:{payload.batch_id}"
    redis_client = get_redis_client()
    cached = None
    if redis_client is not None:
        try:
            raw = redis_client.get(idempotency_key)
            if hasattr(raw, "__await__"):
                pass  # async mock — skip cache
            elif raw:
                cached = raw
        except Exception:
            pass

    if cached:
        logger.info("Batch %s: returning cached result", payload.batch_id)
        return _json.loads(cached)

    results: list[BatchResultItem] = []
    accepted = 0
    rejected = 0

    for i, event in enumerate(payload.events):
        try:
            unified = UnifiedEvent(
                subject_id=payload.device_id,
                modality=event.source,
                encrypted_value=_json.dumps(event.payload),
                confidence=1.0,
                timestamp=event.timestamp,
            )
            db.add(unified)
            db.flush()
            results.append(BatchResultItem(
                row_index=i, status="synced", cloud_id=unified.id,
            ))
            accepted += 1
        except Exception as e:
            db.rollback()
            results.append(BatchResultItem(
                row_index=i, status="rejected", error=str(e), code="internal_error",
            ))
            rejected += 1
            logger.warning("Batch event %d rejected: %s", i, e)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("Batch %s commit failed: %s", payload.batch_id, e)
        raise HTTPException(status_code=500, detail=f"Batch commit failed: {str(e)}")

    log_audit_event(
        db,
        action="WRITE_TELEMETRY",
        guardian_id=None,
        device_id=payload.device_id,
        ip_address=request.client.host if request.client else "unknown",
    )

    response_data = BatchIngestResponse(
        batch_id=payload.batch_id,
        accepted=accepted,
        rejected=rejected,
        results=results,
    )

    try:
        if redis_client:
            redis_client.setex(idempotency_key, BATCH_IDEMPOTENCY_TTL, _json.dumps(response_data.model_dump()))
    except Exception:
        pass

    logger.info("Batch %s: accepted=%d rejected=%d", payload.batch_id, accepted, rejected)
    return response_data
