from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List, Optional

from app import models
from app.database import get_db
from app.utils import auth, audit

router = APIRouter(prefix="/api/v1/physio", tags=["prism-node"])

class PhysioReadingIn(BaseModel):
    sensor_type: str  # 'gsr' or 'ppg'
    value: float
    variance: float = 0.0
    timestamp: Optional[datetime] = None

class SleepWindowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    subject_id: str
    estimated_start: datetime
    estimated_end: datetime
    confidence: float

class PhysioReadingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    subject_id: str
    sensor_type: str
    value: float
    variance: float
    timestamp: datetime

@router.post("/ingest", response_model=dict)
async def ingest_physio(
    payload: PhysioReadingIn,
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device)
):
    """
    Ingest a single GSR or PPG reading from a PRISM Node wearable.
    Requires active consent for the 'gsr' modality.
    """
    consent = db.query(models.ConsentGrant).filter(
        models.ConsentGrant.subject_id == current_device.id,
        models.ConsentGrant.modality == "gsr"
    ).first()
    if not consent or not consent.is_granted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Active consent for physio telemetry not granted."
        )

    reading = models.PhysioReading(
        subject_id=current_device.id,
        sensor_type=payload.sensor_type,
        value=payload.value,
        variance=payload.variance,
        timestamp=payload.timestamp or datetime.now(timezone.utc)
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)

    # Write status to health cache to avoid database checks on health queries
    try:
        redis_conn = get_redis_client()
        await redis_conn.set(f"prism:health:{payload.sensor_type}", "synthetic", ex=3600)
    except Exception:
        pass

    audit.log_audit_event(
        db,
        action=f"PhysioReading ingested: {payload.sensor_type} val={payload.value:.3f}",
        device_id=current_device.id
    )

    return {"status": "accepted", "reading_id": reading.id}

@router.get("/readings/{device_id}", response_model=List[PhysioReadingOut])
def get_physio_readings(
    device_id: str,
    sensor_type: Optional[str] = None,
    limit: int = 120,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user)
):
    """
    Return recent physio readings for a child device.
    Guardian auth required. Results capped at 120.
    """
    auth.verify_guardian_device_access(current_guardian, device_id, db)
    q = db.query(models.PhysioReading).filter(models.PhysioReading.subject_id == device_id)
    if sensor_type:
        q = q.filter(models.PhysioReading.sensor_type == sensor_type)
    return q.order_by(models.PhysioReading.timestamp.desc()).limit(limit).all()

@router.get("/sleep/{device_id}", response_model=List[SleepWindowOut])
def get_sleep_windows(
    device_id: str,
    limit: int = 30,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user)
):
    """
    Return inferred sleep windows for a child device (Phase 4 circadian estimator output).
    """
    auth.verify_guardian_device_access(current_guardian, device_id, db)
    return (
        db.query(models.SleepWindow)
        .filter(models.SleepWindow.subject_id == device_id)
        .order_by(models.SleepWindow.estimated_start.desc())
        .limit(limit)
        .all()
    )

@router.get("/status/{device_id}")
def get_node_status(
    device_id: str,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user)
):
    """
    Returns PRISM Node connection status:
    whether the device has sent physio data in the last 5 minutes.
    """
    auth.verify_guardian_device_access(current_guardian, device_id, db)
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
    latest = (
        db.query(models.PhysioReading)
        .filter(
            models.PhysioReading.subject_id == device_id,
            models.PhysioReading.timestamp >= cutoff
        )
        .order_by(models.PhysioReading.timestamp.desc())
        .first()
    )
    if latest:
        return {"connected": True, "last_seen": latest.timestamp.isoformat(), "sensor": latest.sensor_type}
    return {"connected": False, "last_seen": None, "sensor": None}
