from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List, Optional

from app import models
from app.database import get_db
from app.utils import auth, audit
from app.utils.redis_client import get_redis_client
from app.utils.ml_engine import run_risk_engine

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
    current_device: models.ChildDevice = Depends(auth.get_current_device),
):
    """
    Ingest a single GSR or PPG reading from a PRISM Node wearable.
    Requires active consent for the 'gsr' modality.
    """
    consent = (
        db.query(models.ConsentGrant)
        .filter(
            models.ConsentGrant.subject_id == current_device.id,
            models.ConsentGrant.modality == "gsr",
        )
        .first()
    )
    if not consent:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Active consent for physio telemetry not granted.",
        )
    if consent.is_granted is not True:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Active consent for physio telemetry not granted.",
        )

    reading = models.PhysioReading(
        subject_id=current_device.id,
        sensor_type=payload.sensor_type,
        value=payload.value,
        variance=payload.variance,
        timestamp=payload.timestamp or datetime.now(timezone.utc),
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)

    # Write status to health cache to avoid database checks on health queries
    try:
        redis_conn = get_redis_client()
        await redis_conn.set(
            f"prism:health:{payload.sensor_type}", "synthetic", ex=3600
        )
    except Exception as e:
        import logging

        logging.getLogger(__name__).warning(
            "Failed to update physio health cache: %s", str(e)
        )

    device_id = str(current_device.id)
    audit.log_audit_event(
        db,
        action=f"PhysioReading ingested: {payload.sensor_type} val={payload.value:.3f}",
        device_id=device_id,
    )

    return {"status": "accepted", "reading_id": reading.id}


@router.get("/readings/{device_id}", response_model=List[PhysioReadingOut])
def get_physio_readings(
    device_id: str,
    sensor_type: Optional[str] = None,
    limit: int = 120,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """
    Return recent physio readings for a child device.
    Guardian auth required. Results capped at 120.
    """
    auth.verify_guardian_device_access(current_guardian, device_id, db)
    q = db.query(models.PhysioReading).filter(
        models.PhysioReading.subject_id == device_id
    )
    if sensor_type:
        q = q.filter(models.PhysioReading.sensor_type == sensor_type)
    return q.order_by(models.PhysioReading.timestamp.desc()).limit(limit).all()


@router.get("/sleep/{device_id}", response_model=List[SleepWindowOut])
def get_sleep_windows(
    device_id: str,
    limit: int = 30,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
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
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """
    Returns PRISM Node connection status:
    whether the device has sent physio or pulse data in the last 5 minutes.
    Checks both PhysioReading and PulseMultiFactorReading tables.
    """
    auth.verify_guardian_device_access(current_guardian, device_id, db)
    from datetime import timedelta

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)

    # Check legacy PhysioReading table
    latest_physio = (
        db.query(models.PhysioReading)
        .filter(
            models.PhysioReading.subject_id == device_id,
            models.PhysioReading.timestamp >= cutoff,
        )
        .order_by(models.PhysioReading.timestamp.desc())
        .first()
    )

    # Check new PulseMultiFactorReading table (ESP32 PRISM PULSE)
    latest_pulse = (
        db.query(models.PulseMultiFactorReading)
        .filter(
            models.PulseMultiFactorReading.subject_id == device_id,
            models.PulseMultiFactorReading.timestamp >= cutoff,
        )
        .order_by(models.PulseMultiFactorReading.timestamp.desc())
        .first()
    )

    # Return whichever is more recent
    candidates = []
    if latest_physio:
        candidates.append((latest_physio.timestamp, latest_physio.sensor_type))
    if latest_pulse:
        candidates.append((latest_pulse.timestamp, "pulse"))

    if candidates:
        candidates.sort(key=lambda c: c[0], reverse=True)
        ts, sensor = candidates[0]
        return {"connected": True, "last_seen": ts.isoformat(), "sensor": sensor}
    return {"connected": False, "last_seen": None, "sensor": None}


# ── PRISM PULSE (ESP32 Multi-Factor) ────────────────────────────────


class PulseIngest(BaseModel):
    ts_ms: float = Field(..., description="ESP32 millis() timestamp")
    pulse_raw: float = Field(..., description="Analog pulse sensor raw ADC value")
    bpm: float = Field(..., ge=0, le=250)
    g_force: float = Field(..., description="MPU6050 total acceleration in g")
    alert_status: str = Field(..., description="OK | WARNING-Xs | ISD_TRIGGERED")


class PulseReadingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    subject_id: str
    ts_ms: float
    pulse_raw: float
    bpm: float
    g_force: float
    alert_status: str
    timestamp: datetime


@router.post("/pulse/ingest", response_model=dict)
async def ingest_pulse(
    payload: PulseIngest,
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device),
):
    """
    Ingest a single multi-factor reading from the ESP32 PRISM PULSE node.
    Stores pulse raw value, BPM, g-force, and alert_status.
    Triggers risk engine when alert_status indicates a warning or trigger.
    """
    reading = models.PulseMultiFactorReading(
        subject_id=current_device.id,
        ts_ms=payload.ts_ms,
        pulse_raw=payload.pulse_raw,
        bpm=payload.bpm,
        g_force=payload.g_force,
        alert_status=payload.alert_status,
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)

    # Update health cache
    try:
        redis_conn = get_redis_client()
        await redis_conn.set("prism:health:pulse", "real", ex=3600)
    except Exception as e:
        import logging

        logging.getLogger(__name__).warning(
            "Failed to update pulse health cache: %s", str(e)
        )

    # If alert_status indicates a warning or trigger, run the risk engine
    if payload.alert_status != "OK":
        is_triggered = "TRIGGERED" in payload.alert_status
        metadata = {
            "ts_ms": payload.ts_ms,
            "pulse_raw": payload.pulse_raw,
            "bpm": payload.bpm,
            "g_force": payload.g_force,
            "alert_status": payload.alert_status,
            "isd_triggered": is_triggered,
        }
        device_id = str(current_device.id)
        await run_risk_engine(device_id, "pulse", metadata, db)

    audit.log_audit_event(
        db,
        action=f"Pulse reading ingested: BPM={payload.bpm:.0f} G={payload.g_force:.2f} status={payload.alert_status}",
        device_id=str(current_device.id),
    )

    return {"status": "accepted", "reading_id": reading.id}


@router.get("/pulse/readings/{device_id}", response_model=List[PulseReadingOut])
def get_pulse_readings(
    device_id: str,
    limit: int = 120,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Return recent PRISM PULSE multi-factor readings for a child device."""
    auth.verify_guardian_device_access(current_guardian, device_id, db)
    return (
        db.query(models.PulseMultiFactorReading)
        .filter(models.PulseMultiFactorReading.subject_id == device_id)
        .order_by(models.PulseMultiFactorReading.timestamp.desc())
        .limit(limit)
        .all()
    )
