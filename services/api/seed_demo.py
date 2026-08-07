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
user = (
    db.query(models.Guardian).filter(models.Guardian.email == "dev@example.com").first()
)
if not user:
    user = models.Guardian(
        id=str(uuid.uuid4()),
        full_name="Dev User",
        email="dev@example.com",
        password_hash="$2b$12$avwbMNOEdlcTMTq.N6k3hOnJRkp2dMGbZbqJXMVoxXBqUjqL30gY.",
        role="guardian",
    )
    db.add(user)
    db.flush()
elif user.password_hash == "x":
    user.password_hash = "$2b$12$avwbMNOEdlcTMTq.N6k3hOnJRkp2dMGbZbqJXMVoxXBqUjqL30gY."
    db.commit()
uid = str(user.id)
print(f"User: {uid[:8]}...")

# Create devices if missing
device_names = ["Alex (Demo)", "Priya (Demo)", "Aarav (Demo)"]
devices = []
for name in device_names:
    dev = (
        db.query(models.ChildDevice)
        .filter(models.ChildDevice.guardian_id == uid, models.ChildDevice.name == name)
        .first()
    )
    if not dev:
        dev = models.ChildDevice(
            id=str(uuid.uuid4()),
            guardian_id=uid,
            name=name,
            platform="android" if name != "Priya (Demo)" else "ios",
            device_token=f"demo-device-token-{name.lower().split()[0]}",
        )
        db.add(dev)
        db.flush()
    devices.append(dev)

for dev in devices:
    did = str(dev.id)
    print(f"Device {dev.name}: {did[:8]}...")

    # Consent grants
    for mod in [
        "location",
        "typing",
        "app_usage",
        "gsr",
        "voice",
        "companion_chat",
        "pulse",
    ]:
        existing = (
            db.query(models.ConsentGrant)
            .filter(
                models.ConsentGrant.subject_id == did,
                models.ConsentGrant.modality == mod,
            )
            .first()
        )
        if not existing:
            db.add(models.ConsentGrant(subject_id=did, modality=mod, is_granted=True))

    # Phase 8 device
    existing_v2 = db.query(models.Device).filter(models.Device.id == did).first()
    if not existing_v2:
        db.add(
            models.Device(
                id=did,
                user_id=did,
                name=dev.name,
                device_type=(
                    "android_phone" if dev.platform == "android" else "ios_phone"
                ),
            )
        )

    # 14 days of behavior windows
    now = datetime.now(timezone.utc)
    for i in range(14):
        day = now - timedelta(days=13 - i)
        # Randomize a bit based on device name length to make data look different
        activity_base = 180.0 + (len(dev.name) * 10)
        bw = models.BehaviorWindow(
            subject_id=did,
            start_ts=day.replace(hour=0, minute=0, second=0, microsecond=0),
            end_ts=day.replace(hour=23, minute=59, second=59, microsecond=0),
            total_active_mins=activity_base,
            sleep_hours_proxy=8.0,
        )
        db.add(bw)

    # SensorReadings
    for i in range(30):
        db.add(
            models.SensorReading(
                device_id=did,
                metric_type="bpm",
                value=72.0 + (i % 5),
                timestamp=now - timedelta(hours=i),
            )
        )
        db.add(
            models.SensorReading(
                device_id=did,
                metric_type="g_force",
                value=1.02,
                timestamp=now - timedelta(hours=i),
            )
        )

    # VisionFeatures
    for i in range(20):
        db.add(
            models.VisionFeature(
                device_id=did,
                blink_rate_bpm=15.0,
                is_slouching=(i % 3 == 0),
                timestamp=now - timedelta(hours=i),
            )
        )

    # AudioFeatures
    for i in range(15):
        db.add(
            models.AudioFeature(
                device_id=did,
                speech_segments=8.0,
                silence_ratio=0.3,
                timestamp=now - timedelta(hours=i),
            )
        )

    # PhoneEvents
    for i in range(25):
        db.add(
            models.PhoneEvent(
                device_id=did,
                event_type="SCREEN_ON",
                timestamp=now - timedelta(hours=i),
            )
        )

    # Sample alert
    alert = models.Alert(
        device_id=did,
        severity_tier="sage",
        plain_language_summary=f"PRISM monitoring active for {dev.name.split()[0]}. All 5 modalities reporting.",
    )
    alert.contributing_factors = [
        "Phone Behaviour: within baseline",
        "Physiological: normal resting",
        "Vision: consistent engagement",
    ]
    db.add(alert)

db.commit()

wd = db.query(models.BehaviorWindow).count()
rd = db.query(models.SensorReading).count()
print(f"Seeded total: {wd} windows, {rd} readings, {len(devices)} alerts")
db.close()
print("Done!")
