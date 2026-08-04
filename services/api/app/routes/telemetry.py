import json
import threading
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    status,
    WebSocket,
    WebSocketDisconnect,
)
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List

from app import models, schemas
from app.database import get_db, SessionLocal
from app.utils import auth, audit
from app.utils.redis_client import get_redis_client
from app.utils.worker import run_baseline_aggregation, purge_raw_events
from app.utils.circadian_estimator import infer_sleep_windows
from app.utils.ml_engine import run_risk_engine
from app.utils.risk_registry import check_event_for_risks

router = APIRouter(prefix="/api/v1/events", tags=["telemetry"])

# Guards the background worker job so only one runs at a time.
_worker_lock = threading.Lock()

CHAT_MAX_LENGTH = 500


def _sanitize_chat_text(text: str) -> str:
    """Strip control characters and cap length for stored chat text."""
    cleaned = "".join(ch for ch in text if ch >= " " or ch in "\t\n\r")
    return cleaned[:CHAT_MAX_LENGTH]


@router.post("/ingest", response_model=schemas.TelemetryResponse)
async def ingest_telemetry(
    payload: schemas.TelemetryIngest,
    request: Request,
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device),
):
    """
    Ingest behavioral telemetry events.
    Verifies that the authenticated device matches the payload device ID,
    checks if consent has been granted for the specific signal type,
    stores the metadata encrypted at rest, and publishes the event to Redis.
    """
    if payload.device_id != current_device.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authenticated device ID does not match telemetry payload device ID.",
        )

    # Verify active consent exists for this device and signal type
    consent = (
        db.query(models.ConsentRecord)
        .filter(
            models.ConsentRecord.device_id == current_device.id,
            models.ConsentRecord.signal_type == payload.signal_type,
        )
        .first()
    )

    if not consent or consent.revoked_at is not None:
        audit.log_audit_event(
            db,
            action=f"Telemetry ingestion REJECTED: Consent missing or revoked for signal type '{payload.signal_type}'",
            device_id=str(current_device.id),
            guardian_id=str(current_device.guardian_id),
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Telemetry ingestion rejected: Active consent is not granted for '{payload.signal_type}' metadata.",
        )

    # Save raw signal event
    event = models.RawSignalEvent(
        device_id=current_device.id,
        signal_type=payload.signal_type,
        timestamp=payload.timestamp,
    )
    # This automatically serializes and encrypts features at rest
    event.metadata_json = json.dumps(payload.metadata)

    db.add(event)
    db.commit()
    db.refresh(event)

    # Write status to health cache to avoid N+1 queries on status polls
    try:
        is_synth = payload.metadata.get("is_synthetic", False)
        status_str = "synthetic" if is_synth else "real"
        redis_conn = get_redis_client()
        await redis_conn.set(f"prism:health:{payload.signal_type}", status_str, ex=3600)
    except Exception as e:
        import logging

        logging.getLogger(__name__).warning("Failed to update health cache: %s", str(e))

    # Log successful ingestion
    audit.log_audit_event(
        db,
        action=f"Telemetry ingested successfully: {payload.signal_type} (Event ID: {event.id})",
        device_id=str(current_device.id),
        guardian_id=str(current_device.guardian_id),
        ip_address=request.client.host if request.client else None,
    )

    # Run the risk scoring and alert generation engine
    await run_risk_engine(current_device.id, payload.signal_type, payload.metadata, db)

    # Publish to Redis channel for real-time WebSocket updates
    try:
        redis_conn = get_redis_client()
        event_data = {
            "event_id": event.id,
            "device_id": current_device.id,
            "device_name": current_device.name,
            "signal_type": payload.signal_type,
            "timestamp": event.timestamp.isoformat(),
            "metadata": payload.metadata,
        }
        await redis_conn.publish(
            f"guardian_events:{current_device.guardian_id}", json.dumps(event_data)
        )
    except Exception as e:
        import logging

        logging.getLogger(__name__).warning(
            "Redis telemetry broadcast failed: %s", str(e)
        )
    return {"status": "accepted", "event_id": event.id}


@router.post("/ingest/unified", response_model=schemas.TelemetryResponse)
async def ingest_unified(
    payload: schemas.UnifiedEventIngest,
    request: Request,
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device),
):
    """
    Phase 1 Unified Ingestion path for both behavioral and physiological data.
    """
    if payload.subject_id != current_device.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authenticated device ID does not match telemetry payload subject ID.",
        )

    # Simplified consent check for Phase 1 demo
    consent = (
        db.query(models.ConsentGrant)
        .filter(
            models.ConsentGrant.subject_id == current_device.id,
            models.ConsentGrant.modality == payload.modality,
        )
        .first()
    )

    # Fallback to old consent model if new one isn't populated for legacy behavior signals
    # (a ConsentGrant row with is_granted=False is a revoked grant and must NOT
    # satisfy the check — match the pattern used by voice/physio/pulse).
    if not consent or consent.is_granted is not True:
        old_consent = (
            db.query(models.ConsentRecord)
            .filter(
                models.ConsentRecord.device_id == current_device.id,
                models.ConsentRecord.signal_type == payload.modality,
            )
            .first()
        )
        if not old_consent or old_consent.revoked_at is not None:
            # Consent is required for ALL modalities (including gsr/ppg).
            raise HTTPException(
                status_code=403, detail="Active consent not granted."
            )

    event = models.UnifiedEvent(
        subject_id=current_device.id,
        modality=payload.modality,
        timestamp=payload.timestamp,
        confidence=payload.confidence,
    )
    event.value = payload.value

    db.add(event)
    db.commit()
    db.refresh(event)

    # Write status to health cache to avoid N+1 queries on status polls
    try:
        is_synth = payload.value.get("is_synthetic", False)
        status_str = "synthetic" if is_synth else "real"
        redis_conn = get_redis_client()
        await redis_conn.set(f"prism:health:{payload.modality}", status_str, ex=3600)
    except Exception as e:
        import logging

        logging.getLogger(__name__).warning(
            "Failed to update unified health cache: %s", str(e)
        )

    # Check for risks in new apps / metadata
    check_event_for_risks(db, str(current_device.id), payload.modality, payload.value)

    return {"status": "accepted", "event_id": event.id}


@router.get("/health", response_model=schemas.IngestionHealthResponse)
def legacy_health():
    """Redirect to the internal health endpoint."""
    return {
        "status": "moved",
        "active_modalities": {
            "gsr": "inactive",
            "ppg": "inactive",
            "pulse": "inactive",
            "location": "inactive",
            "typing": "inactive",
            "app_usage": "inactive",
        },
    }


# Creating a sub-router for internal endpoints to match the requested path
internal_router = APIRouter(prefix="/api/internal", tags=["internal"])


@internal_router.get(
    "/ingestion/health", response_model=schemas.IngestionHealthResponse
)
async def ingestion_health(db: Session = Depends(get_db)):
    """
    Reports whether real or synthetic data is currently flowing per modality.
    Uses Redis distributed caching to completely eliminate N+1 DB lookup query bottlenecks.
    """
    modalities = ["gsr", "ppg", "pulse", "location", "typing", "app_usage"]
    status_map = {}

    redis_conn = get_redis_client()
    for mod in modalities:
        try:
            cached = await redis_conn.get(f"prism:health:{mod}")
            if cached and isinstance(cached, (str, bytes)):
                status_map[mod] = (
                    cached if isinstance(cached, str) else cached.decode("utf-8")
                )
                continue
        except Exception as e:
            import logging

            logging.getLogger(__name__).warning(
                "Failed to read health cache for %s: %s", mod, str(e)
            )

        # Fallback database scan if cache is empty
        latest_event = (
            db.query(models.UnifiedEvent)
            .filter(models.UnifiedEvent.modality == mod)
            .order_by(models.UnifiedEvent.timestamp.desc())
            .first()
        )

        if latest_event:
            val_dict = latest_event.value
            is_synth = val_dict.get("is_synthetic", False)
            status_str = "synthetic" if is_synth else "real"
            status_map[mod] = status_str
            try:
                await redis_conn.set(f"prism:health:{mod}", status_str, ex=60)
            except Exception as e:
                import logging

                logging.getLogger(__name__).warning(
                    "Failed to write-back health cache for %s: %s", mod, str(e)
                )
        else:
            latest_raw = (
                db.query(models.RawSignalEvent)
                .filter(models.RawSignalEvent.signal_type == mod)
                .order_by(models.RawSignalEvent.timestamp.desc())
                .first()
            )
            if latest_raw:
                try:
                    val_dict = json.loads(latest_raw.metadata_json)
                except (json.JSONDecodeError, TypeError) as e:
                    import logging

                    logging.getLogger(__name__).warning(
                        "Failed to parse metadata_json for raw event: %s", str(e)
                    )
                    val_dict = {}
                is_synth = val_dict.get("is_synthetic", False)
                status_str = "synthetic" if is_synth else "real"
                status_map[mod] = status_str
                try:
                    await redis_conn.set(f"prism:health:{mod}", status_str, ex=60)
                except Exception as e:
                    import logging

                    logging.getLogger(__name__).warning(
                        "Failed to write-back health cache for %s: %s", mod, str(e)
                    )
            else:
                status_map[mod] = "inactive"

    return {"status": "healthy", "active_modalities": status_map}


@router.post("/worker/run", status_code=status.HTTP_200_OK)
def trigger_worker_jobs(
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(
        auth.RoleChecker(["ops", "guardian-admin"])
    ),
):
    """
    Manually trigger baseline-aggregation and event-purging.
    Runs in a background thread so the request returns immediately; only one
    worker run executes at a time.

    Restricted to ops/guardian-admin: this operates on ALL devices
    system-wide (baseline aggregation + raw-event purge), so a plain guardian
    must not be able to trigger it.
    """
    if not _worker_lock.acquire(blocking=False):
        return {"status": "already_running", "events_purged": 0}

    audit.log_audit_event(
        db,
        action="Worker run triggered (background): baseline aggregation + sleep estimation + purge started.",
        guardian_id=str(current_guardian.id),
    )

    def _run_job():
        try:
            job_db = SessionLocal()
            try:
                run_baseline_aggregation(job_db)
                infer_sleep_windows(job_db)
                purge_raw_events(job_db, days=30)
                job_db.commit()
            finally:
                job_db.close()
        except Exception:
            import logging

            logging.getLogger(__name__).exception("Background worker job failed")
        finally:
            _worker_lock.release()

    threading.Thread(target=_run_job, daemon=True).start()

    return {"status": "accepted", "events_purged": 0}


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for guardians to receive live updates and chat with Aria.
    Connection URL: ws://localhost:8000/api/v1/events/ws?token=<jwt_token>
    The JWT is validated BEFORE the socket is accepted; invalid tokens are
    rejected with close code 1008.

    Authorization: the token subject must exist in the database and own the
    channels it subscribes to. A device token is bound to the device's owning
    guardian, so it can only subscribe to that device's alerts (and its
    guardian's alert feed) — never to another family's channels.
    """
    token = websocket.query_params.get("token")

    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        from jose import jwt
        from app.config import settings

        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
        sub_id = payload.get("sub")
        token_type = payload.get("type")
        if not sub_id or token_type not in ["guardian", "device"]:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        # Authorization: the subject must be a real account, and device tokens
        # must be bound to the device's owning guardian. This prevents a client
        # from subscribing to another family's channels by guessing a UUID.
        # Resolve the DB session through FastAPI's dependency-override map when
        # present (the test suite overrides get_db with an in-memory DB so the
        # WS handler sees the same data as the request handlers), falling back
        # to the production SessionLocal.
        from app.database import get_db
        from app.main import app as _app

        db_override = _app.dependency_overrides.get(get_db)
        db_gen = db_override() if db_override else get_db()
        try:
            db = next(db_gen)
            if token_type == "guardian":
                guardian = (
                    db.query(models.Guardian)
                    .filter(models.Guardian.id == sub_id)
                    .first()
                )
                if not guardian:
                    await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                    return
                guardian_id = guardian.id
            else:
                device = (
                    db.query(models.ChildDevice)
                    .filter(models.ChildDevice.id == sub_id)
                    .first()
                )
                if not device:
                    await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                    return
                guardian_id = str(device.guardian_id)
        finally:
            try:
                next(db_gen, None)
            except StopIteration:
                pass
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()

    redis_conn = get_redis_client()
    pubsub = redis_conn.pubsub()

    channels = []
    if token_type == "guardian":
        channels.extend([f"guardian_events:{sub_id}", f"guardian_alerts:{sub_id}"])
    else:
        # A device is bound to its owning guardian's alert feed so the child's
        # own alerts reach the right family — never another guardian's channels.
        channels.extend(
            [f"device_alerts:{sub_id}", f"guardian_alerts:{guardian_id}"]
        )

    await pubsub.subscribe(*channels)

    async def client_listener():
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    parsed = json.loads(data)
                    text = parsed.get("text")
                    if text and token_type == "guardian":
                        text = _sanitize_chat_text(text)
                        db = SessionLocal()
                        try:
                            # 1. Save guardian message
                            msg = models.ChatMessage(
                                guardian_id=sub_id, sender="guardian", aria_utterance=text
                            )
                            db.add(msg)
                            db.commit()
                            db.refresh(msg)

                            payload = {
                                "id": msg.id,
                                "guardian_id": sub_id,
                                "sender": "guardian",
                                "text": msg.aria_utterance,
                                "timestamp": msg.timestamp.isoformat(),
                                "type": "chat_message",
                            }
                            await redis_conn.publish(
                                f"guardian_events:{sub_id}", json.dumps(payload)
                            )

                            # 2. Trigger mock Aria response after 1 second
                            import asyncio

                            await asyncio.sleep(1.0)

                            aria_text = "I've logged that. I am constantly monitoring the baseline thresholds to keep your child supported."
                            if "plan" in text.lower() or "price" in text.lower():
                                aria_text = "The Family Safety Plan gives you full access to live risk reports, bedtime anomaly alerts, and weekly behavioral digests."
                            elif "sleep" in text.lower() or "bedtime" in text.lower():
                                aria_text = "I've saved their normal bedtime as part of the baseline. Any late-night phone usage out of the ordinary will be safely flagged."

                            aria_msg = models.ChatMessage(
                                guardian_id=sub_id, sender="aria", aria_utterance=aria_text
                            )
                            db.add(aria_msg)
                            db.commit()
                            db.refresh(aria_msg)

                            aria_payload = {
                                "id": aria_msg.id,
                                "guardian_id": sub_id,
                                "sender": "aria",
                                "text": aria_msg.aria_utterance,
                                "timestamp": aria_msg.timestamp.isoformat(),
                                "type": "chat_message",
                            }
                            await redis_conn.publish(
                                f"guardian_events:{sub_id}", json.dumps(aria_payload)
                            )
                        finally:
                            # Always release the session, even on exception, to
                            # avoid leaking SQLAlchemy connections on a long-lived
                            # WebSocket connection.
                            db.close()
                except Exception as e:
                    import logging

                    logging.getLogger(__name__).warning(
                        "Error handling websocket chat message: %s", str(e)
                    )
        except WebSocketDisconnect:
            pass

    import asyncio

    listener_task = asyncio.create_task(client_listener())

    try:
        while True:
            message = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=1.0
            )
            if message:
                msg_data = message.get("data")
                if msg_data:
                    await websocket.send_text(msg_data)
    except WebSocketDisconnect:
        pass
    finally:
        listener_task.cancel()
        await pubsub.unsubscribe(*channels)


@router.get("/alerts/{device_id}", response_model=List[schemas.AlertResponse])
def get_alerts(
    device_id: str,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Retrieve all alerts generated for a child device."""
    auth.verify_guardian_device_access(current_guardian, device_id, db)
    return (
        db.query(models.Alert)
        .filter(models.Alert.device_id == device_id)
        .order_by(models.Alert.timestamp.desc())
        .all()
    )


@router.get("/scores/{device_id}", response_model=List[schemas.RiskScoreResponse])
def get_scores(
    device_id: str,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Retrieve historical model risk scores for a child device."""
    auth.verify_guardian_device_access(current_guardian, device_id, db)
    return (
        db.query(models.RiskScore)
        .filter(models.RiskScore.device_id == device_id)
        .order_by(models.RiskScore.timestamp.desc())
        .all()
    )


@router.get("/baselines/{device_id}")
def get_baselines(
    device_id: str,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Retrieve rolling baseline means and variances for overlay charts."""
    auth.verify_guardian_device_access(current_guardian, device_id, db)
    baselines = (
        db.query(models.BaselineProfile)
        .filter(models.BaselineProfile.device_id == device_id)
        .all()
    )
    return {
        b.signal_type: {"mean": b.rolling_mean, "variance": b.rolling_variance}
        for b in baselines
    }


from pydantic import BaseModel


class DemoTriggerRequest(BaseModel):
    device_id: str
    scenario: str


@router.post("/demo-trigger")
async def trigger_demo_scenario(
    req: DemoTriggerRequest,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Trigger a guided demo scenario (A, B, or C) from the dashboard for stakeholder replay."""
    auth.verify_guardian_device_access(current_guardian, req.device_id, db)

    # Demo scenarios inject synthetic risk scores + alerts into the child's
    # REAL alert stream (and fire real guardian WebSocket notifications), so
    # they must never run in production.
    from app.config import settings

    if settings.ENV.lower() == "production":
        raise HTTPException(
            status_code=403, detail="Demo scenarios are disabled in production."
        )

    if req.scenario == "A":
        # Late-night usage spike
        await run_risk_engine(req.device_id, "location", {"steps": 1500}, db)
        await run_risk_engine(
            req.device_id,
            "app_usage",
            {"late_night_hours": 3.5, "baseline_hours": 1.0},
            db,
        )
    elif req.scenario == "B":
        # Social withdrawal & fatigue
        await run_risk_engine(req.device_id, "location", {"steps": 2000}, db)
        await run_risk_engine(req.device_id, "typing", {"delay_index": 1.4}, db)
    elif req.scenario == "C":
        # New app risk
        await run_risk_engine(
            req.device_id,
            "app_usage",
            {
                "late_night_hours": 3.0,
                "baseline_hours": 1.0,
                "new_installed_packages": ["com.anonymous.chat"],
            },
            db,
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid scenario name")

    return {"status": "triggered", "scenario": req.scenario}


@router.post("/alerts/viewed/{alert_id}")
def mark_alert_viewed(
    alert_id: str,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Mark a well-being alert as viewed/acknowledged by the guardian."""
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    auth.verify_guardian_device_access(current_guardian, str(alert.device_id), db)
    alert.is_viewed = True  # type: ignore[assignment]
    db.commit()
    return {"status": "updated", "alert_id": alert_id}


@router.post("/baselines/seed")
def seed_baselines(
    req: schemas.BaselineSeedRequest,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Saves guardian-reported seed values for a child's baseline profile."""
    auth.verify_guardian_device_access(current_guardian, req.device_id, db)

    try:
        dob_dt = datetime.strptime(req.date_of_birth, "%Y-%m-%d").replace(
            tzinfo=timezone.utc
        )
        age_years = (datetime.now(timezone.utc) - dob_dt).days / 365.25
    except Exception:
        raise HTTPException(
            status_code=400, detail="Invalid date of birth format. Use YYYY-MM-DD"
        )

    try:
        h, m = map(int, req.usual_bedtime.split(":"))
        bedtime_hours = h + m / 60.0
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid bedtime format. Use HH:MM")

    # Clean existing guardian_reported baselines for this device
    db.query(models.BaselineProfile).filter(
        models.BaselineProfile.device_id == req.device_id,
        models.BaselineProfile.source == "guardian_reported",
    ).delete()

    # 1. Insert Demographics
    dem_prof = models.BaselineProfile(
        device_id=req.device_id,
        signal_type="demographics",
        rolling_mean=age_years,
        rolling_variance=0.0,
        source="guardian_reported",
    )
    dem_prof.metadata_json = json.dumps(
        {"relationship": req.relationship, "date_of_birth": req.date_of_birth}
    )
    db.add(dem_prof)

    # 2. Insert Screen Time
    screen_prof = models.BaselineProfile(
        device_id=req.device_id,
        signal_type="app_usage",
        rolling_mean=req.daily_screen_time_mins / 60.0,
        rolling_variance=0.0,
        source="guardian_reported",
    )
    db.add(screen_prof)

    # 3. Insert Bedtime
    bed_prof = models.BaselineProfile(
        device_id=req.device_id,
        signal_type="location",
        rolling_mean=bedtime_hours,
        rolling_variance=0.0,
        source="guardian_reported",
    )
    bed_prof.metadata_json = json.dumps({"bedtime_str": req.usual_bedtime})
    db.add(bed_prof)

    # 4. Insert Selected Concerns
    conc_prof = models.BaselineProfile(
        device_id=req.device_id,
        signal_type="concerns",
        rolling_mean=float(len(req.concerns)),
        rolling_variance=0.0,
        source="guardian_reported",
    )
    conc_prof.metadata_json = json.dumps({"selected_concerns": req.concerns})
    db.add(conc_prof)

    db.commit()

    audit.log_audit_event(
        db,
        action=f"Guardian-reported baseline seed saved for device {req.device_id}",
        guardian_id=str(current_guardian.id),
        device_id=req.device_id,
    )

    return {"status": "seeded", "device_id": req.device_id}


@router.get("/chat/history", response_model=List[schemas.ChatMessageResponse])
def get_chat_history(
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Retrieve chat conversation logs with Aria."""
    history = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.guardian_id == current_guardian.id)
        .order_by(models.ChatMessage.timestamp.asc())
        .all()
    )

    if not history:
        welcome = models.ChatMessage(
            guardian_id=current_guardian.id,
            sender="aria",
            aria_utterance=f"Hi {current_guardian.full_name}! This is Aria — welcome. I'm calling you now to finish setting up your plan. It'll take about 8–10 minutes.",
        )
        db.add(welcome)
        db.commit()
        db.refresh(welcome)
        history = [welcome]

    return history
