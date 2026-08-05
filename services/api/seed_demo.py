"""Seed demo data for dashboard verification."""
import sys, uuid
from datetime import datetime, timedelta, timezone

from app.database import SessionLocal, engine, Base
from app import models
from app.utils.risk_registry import seed_registry

Base.metadata.create_all(bind=engine)
db = SessionLocal()
seed_registry(db)

# Get dev user
user = db.query(models.Guardian).filter(models.Guardian.email == "dev@example.com").first()
if not user:
    user = models.Guardian(
        id=str(uuid.uuid4()),
        full_name="Dev User",
        email="dev@example.com",
        password_hash="x",
        role="guardian",
    )
    db.add(user)
    db.flush()
uid = str(user.id)
print(f"User: {uid[:8]}...")

# Create device if missing
dev = db.query(models.ChildDevice).filter(models.ChildDevice.guardian_id == uid).first()
if not dev:
    dev = models.ChildDevice(
        id=str(uuid.uuid4()),
        guardian_id=uid,
        name="Alex (Demo)",
        platform="android",
        device_token="demo-device-token-abc",
    )
    db.add(dev)
    db.flush()
did = str(dev.id)
print(f"Device: {did[:8]}...")

# Consent grants
for mod in ["location", "typing", "app_usage", "gsr", "voice", "companion_chat", "pulse"]:
    existing = db.query(models.ConsentGrant).filter(
        models.ConsentGrant.subject_id == did, models.ConsentGrant.modality == mod
    ).first()
    if not existing:
        db.add(models.ConsentGrant(subject_id=did, modality=mod, is_granted=True))

# Phase 8 device
existing_v2 = db.query(models.Device).filter(models.Device.id == did).first()
if not existing_v2:
    db.add(models.Device(id=did, user_id=did, name="Alex (Demo)", device_type="android_phone"))

# 14 days of behavior windows
now = datetime.now(timezone.utc)
for i in range(14):
    day = now - timedelta(days=13 - i)
    bw = models.BehaviorWindow(
        subject_id=did,
        start_ts=day.replace(hour=0, minute=0, second=0, microsecond=0),
        end_ts=day.replace(hour=23, minute=59, second=59, microsecond=0),
        total_active_mins=180.0,
        sleep_hours_proxy=8.0,
    )
    db.add(bw)

# SensorReadings
for i in range(30):
    db.add(models.SensorReading(device_id=did, metric_type="bpm", value=72.0, timestamp=now - timedelta(hours=i)))
    db.add(models.SensorReading(device_id=did, metric_type="g_force", value=1.02, timestamp=now - timedelta(hours=i)))

# VisionFeatures
for i in range(20):
    db.add(models.VisionFeature(device_id=did, blink_rate_bpm=15.0, is_slouching=False, timestamp=now - timedelta(hours=i)))

# AudioFeatures
for i in range(15):
    db.add(models.AudioFeature(device_id=did, speech_segments=8.0, silence_ratio=0.3, timestamp=now - timedelta(hours=i)))

# PhoneEvents
for i in range(25):
    db.add(models.PhoneEvent(device_id=did, event_type="SCREEN_ON", timestamp=now - timedelta(hours=i)))

# Sample alert
alert = models.Alert(device_id=did, severity_tier="sage", plain_language_summary="PRISM monitoring active. All 5 modalities reporting.")
alert.contributing_factors = ["Phone Behaviour: within baseline", "Physiological: normal resting", "Vision: consistent engagement"]
db.add(alert)

db.commit()

wd = db.query(models.BehaviorWindow).filter(models.BehaviorWindow.subject_id == did).count()
rd = db.query(models.SensorReading).filter(models.SensorReading.device_id == did).count()
print(f"Seeded: {wd} windows, {rd} readings, 1 alert")
db.close()
print("Done!")
