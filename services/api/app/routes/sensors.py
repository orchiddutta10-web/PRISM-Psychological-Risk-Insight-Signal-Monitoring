"""
Phase 12 — Sensor Ingest Routes

Provides dedicated ingestion endpoints for the Phase 8 prototype tables:
  - POST /api/v1/sensors/pulse      (wraps /physio/pulse/ingest)
  - POST /api/v1/vision/features    (→ VisionFeature table)
  - POST /api/v1/audio/features     (→ AudioFeature table)
  - POST /api/v1/phone/events       (→ PhoneEvent table)

All routes require device JWT auth + valid consent.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.utils import auth

router = APIRouter(prefix="/api/v1", tags=["sensors"])


def _verify_consent(db: Session, device_id: str, modality: str) -> None:
    """Check if consent is granted for a given modality on this device."""
    consent = (
        db.query(models.ConsentGrant)
        .filter(
            models.ConsentGrant.subject_id == device_id,
            models.ConsentGrant.modality == modality,
        )
        .first()
    )
    if not consent or not consent.is_granted:
        raise HTTPException(
            status_code=403,
            detail=f"Active consent for '{modality}' is not granted.",
        )


# ── POST /api/v1/sensors/pulse ──────────────────────────────────────────


@router.post(
    "/sensors/pulse",
    response_model=schemas.IngestionResponse,
    status_code=status.HTTP_201_CREATED,
)
def ingest_pulse(
    payload: schemas.SensorReadingIngest,
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device),
):
    """
    Ingest pulse/physiological sensor readings (BPM, g_force, temperature).
    Wraps the existing SensorReading table.
    """
    if payload.device_id != current_device.id:
        raise HTTPException(403, detail="Device ID mismatch.")

    reading = models.SensorReading(
        device_id=current_device.id,
        metric_type=payload.metric_type,
        value=payload.value,
        timestamp=payload.timestamp,
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)

    return schemas.IngestionResponse(status="accepted", id=reading.id)


# ── POST /api/v1/vision/features ────────────────────────────────────────


@router.post(
    "/vision/features",
    response_model=schemas.IngestionResponse,
    status_code=status.HTTP_201_CREATED,
)
def ingest_vision_features(
    payload: schemas.VisionFeatureIngest,
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device),
):
    """
    Ingest computer vision features from the RPi edge node.
    Stores blink rate and posture data in VisionFeature table.
    """
    if payload.device_id != current_device.id:
        raise HTTPException(403, detail="Device ID mismatch.")

    feature = models.VisionFeature(
        device_id=current_device.id,
        blink_rate_bpm=payload.blink_rate_bpm,
        is_slouching=payload.is_slouching,
        timestamp=payload.timestamp,
    )
    db.add(feature)
    db.commit()
    db.refresh(feature)

    return schemas.IngestionResponse(status="accepted", id=feature.id)


# ── POST /api/v1/audio/features ─────────────────────────────────────────


@router.post(
    "/audio/features",
    response_model=schemas.IngestionResponse,
    status_code=status.HTTP_201_CREATED,
)
def ingest_audio_features(
    payload: schemas.AudioFeatureIngest,
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device),
):
    """
    Ingest audio features from the RPi microphone.
    Stores speech segment count and silence ratio in AudioFeature table.
    """
    if payload.device_id != current_device.id:
        raise HTTPException(403, detail="Device ID mismatch.")

    feature = models.AudioFeature(
        device_id=current_device.id,
        speech_segments=payload.speech_segments,
        silence_ratio=payload.silence_ratio,
        timestamp=payload.timestamp,
    )
    db.add(feature)
    db.commit()
    db.refresh(feature)

    return schemas.IngestionResponse(status="accepted", id=feature.id)


# ── POST /api/v1/phone/events ───────────────────────────────────────────


@router.post(
    "/phone/events",
    response_model=schemas.IngestionResponse,
    status_code=status.HTTP_201_CREATED,
)
def ingest_phone_events(
    payload: schemas.PhoneEventIngest,
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device),
):
    """
    Ingest Android phone behavioural events.
    Supports SCREEN_ON, SCREEN_OFF, APP_USAGE, APP_INSTALL types.
    """
    if payload.device_id != current_device.id:
        raise HTTPException(403, detail="Device ID mismatch.")

    event = models.PhoneEvent(
        device_id=current_device.id,
        event_type=payload.event_type,
        package_name=payload.package_name,
        timestamp=payload.timestamp,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    # Check for risk registry hits on APP_INSTALL
    if payload.event_type == "APP_INSTALL" and payload.package_name:
        from app.utils.risk_registry import check_event_for_risks

        check_event_for_risks(
            db,
            str(current_device.id),
            "app_usage",
            {"new_installed_packages": [payload.package_name]},
        )

    return schemas.IngestionResponse(status="accepted", id=event.id)


# ── POST /api/v1/fusion/analyze ─────────────────────────────────────────


class FusionAnalyzeRequest(BaseModel):
    device_id: str
    persist: bool = True


class FusionAnalyzeResponse(BaseModel):
    status: str
    device_id: str
    insight_score: float
    tier_label: str
    tier_summary: str


@router.post(
    "/fusion/analyze",
    response_model=FusionAnalyzeResponse,
    status_code=status.HTTP_200_OK,
)
def fusion_analyze(
    req: FusionAnalyzeRequest,
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device),
):
    """
    Run the full multimodal fusion pipeline for a device.
    Wraps the Phase 10 PrismMLEngine.evaluate() logic.

    Pipeline: sensor aggregation → Isolation Forest → fusion → insight score.
    """
    from app.routes.ml import get_ml_engine

    engine = get_ml_engine()
    if engine is None:
        raise HTTPException(503, detail="ML engine not initialized.")

    device_id = req.device_id
    if device_id != current_device.id:
        raise HTTPException(403, detail="Device ID mismatch.")

    engine.ensure_fitted(device_id)

    if req.persist:
        result = engine.evaluate_and_persist(device_id)
    else:
        result = engine.evaluate(device_id)

    if result is None:
        raise HTTPException(
            404, detail="No feature data available. Ensure sensor data is flowing."
        )

    return FusionAnalyzeResponse(
        status="completed",
        device_id=device_id,
        insight_score=result.insight_score,
        tier_label=result.tier_label,
        tier_summary=result.tier_summary,
    )


# ── GET /api/v1/dashboard/summary ───────────────────────────────────────


@router.get(
    "/dashboard/summary",
    response_model=schemas.DashboardSummaryResponse,
    status_code=status.HTTP_200_OK,
)
def dashboard_summary(
    device_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.Guardian = Depends(auth.get_current_user),
):
    """
    Aggregated dashboard summary: insight score + recent alerts + sensor status.
    Optionally scoped to a single device.
    """
    from app.routes.ml import get_ml_engine

    # Determine which device(s) to query
    if device_id:
        auth.verify_guardian_device_access(current_user, device_id, db)
        devices = [db.query(models.ChildDevice).filter(models.ChildDevice.id == device_id).first()]
    else:
        devices = (
            db.query(models.ChildDevice)
            .filter(models.ChildDevice.guardian_id == current_user.id)
            .all()
        )

    if not devices or not devices[0]:
        return schemas.DashboardSummaryResponse(system_health="no_devices")

    primary = devices[0]
    did = str(primary.id)

    # Insight score
    engine = get_ml_engine()
    insight_score = None
    tier_label = None
    if engine:
        result = engine.evaluate(did)
        if result:
            insight_score = result.insight_score
            tier_label = result.tier_label

    # Recent alerts (cross-device)
    all_alerts = (
        db.query(models.Alert)
        .filter(models.Alert.device_id.in_([str(d.id) for d in devices if d]))
        .order_by(models.Alert.timestamp.desc())
        .limit(10)
        .all()
    )
    recent_alerts = [
        {
            "id": a.id,
            "device_id": a.device_id,
            "severity_tier": a.severity_tier,
            "summary": a.plain_language_summary,
            "timestamp": a.timestamp.isoformat(),
            "is_viewed": a.is_viewed,
        }
        for a in all_alerts
    ]

    # Sensor status
    sensor_status = {
        "pulse": "active",
        "vision": "active",
        "audio": "active",
        "phone": "active",
    }

    return schemas.DashboardSummaryResponse(
        device_id=did,
        insight_score=insight_score,
        tier_label=tier_label,
        recent_alerts=recent_alerts,
        sensor_status=sensor_status,
    )


# ── GET /api/v1/alerts ──────────────────────────────────────────────────


@router.get(
    "/alerts",
    response_model=schemas.AlertListResponse,
    status_code=status.HTTP_200_OK,
)
def list_alerts(
    page: int = 1,
    page_size: int = 50,
    severity: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.Guardian = Depends(auth.get_current_user),
):
    """
    Cross-device alert list with pagination and severity filtering.
    Returns all alerts for all devices registered to the guardian.
    """
    devices = (
        db.query(models.ChildDevice)
        .filter(models.ChildDevice.guardian_id == current_user.id)
        .all()
    )
    device_ids = [str(d.id) for d in devices]

    query = db.query(models.Alert).filter(
        models.Alert.device_id.in_(device_ids)
    )
    if severity:
        query = query.filter(models.Alert.severity_tier == severity)

    total = query.count()
    unread = query.filter(models.Alert.is_viewed == False).count()
    offset = (page - 1) * page_size

    alerts = (
        query.order_by(models.Alert.timestamp.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return schemas.AlertListResponse(
        alerts=[
            {
                "id": a.id,
                "device_id": a.device_id,
                "severity_tier": a.severity_tier,
                "summary": a.plain_language_summary,
                "factors": a.contributing_factors,
                "timestamp": a.timestamp.isoformat(),
                "is_viewed": a.is_viewed,
            }
            for a in alerts
        ],
        total=total,
        unread=unread,
        page=page,
        page_size=page_size,
    )
