import asyncio
import logging
import uuid
import random
from datetime import datetime, timedelta, timezone

from app import models
from app.database import SessionLocal
from app.utils.risk_registry import seed_registry
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

logger = logging.getLogger(__name__)

SCENARIOS = {
    "1": "Healthy Teen",
    "2": "Sleep Deprivation",
    "3": "Cyberbullying",
    "4": "Academic Stress",
    "5": "Depression Risk",
    "6": "Emergency Escalation",
    "7": "Recovery Progress",
    "8": "Healthy Improvement",
}

# The active scenario
ACTIVE_SCENARIO = "1"

def set_active_scenario(scenario_id: str):
    global ACTIVE_SCENARIO
    if scenario_id in SCENARIOS:
        ACTIVE_SCENARIO = scenario_id
        logger.info(f"Demo scenario switched to {SCENARIOS[scenario_id]}")

def seed_demo_data_if_needed():
    db = SessionLocal()
    try:
        # Check if guardians exist
        guardian_count = db.query(models.Guardian).count()
        if guardian_count < 4:
            logger.info("Seeding realistic demo personas...")
            seed_registry(db)
            
            # Example Guardians
            guardians_data = [
                {"name": "Sarah Johnson", "email": "sarah@example.com"},
                {"name": "Rajesh Sharma", "email": "rajesh@example.com"},
                {"name": "Emily Carter", "email": "emily@example.com"},
                {"name": "Michael Chen", "email": "michael@example.com"},
                {"name": "Dev User", "email": "dev@example.com"} # Developer demo account
            ]
            
            guardians = []
            for g_data in guardians_data:
                g = db.query(models.Guardian).filter(models.Guardian.email == g_data["email"]).first()
                if not g:
                    g = models.Guardian(
                        id=str(uuid.uuid4()),
                        full_name=g_data["name"],
                        email=g_data["email"],
                        password_hash=pwd_context.hash("password"), # standard password for demo
                        role="guardian"
                    )
                    db.add(g)
                    db.flush()
                guardians.append(g)
            
            # Example Children mapping
            children_mapping = [
                {"g_index": 0, "name": "Sophia Williams", "age": 13, "device": "iPhone 15"},
                {"g_index": 1, "name": "Priya Sharma", "age": 16, "device": "Pixel 8 Pro"},
                {"g_index": 1, "name": "Aarav Sharma", "age": 15, "device": "Samsung S24"},
                {"g_index": 2, "name": "Ethan Brown", "age": 16, "device": "Apple Watch"},
                {"g_index": 3, "name": "Ananya Roy", "age": 14, "device": "OnePlus 12"},
                {"g_index": 4, "name": "Rahul Mehta", "age": 17, "device": "Tablet"},
            ]
            
            for c_data in children_mapping:
                g_id = guardians[c_data["g_index"]].id
                dev = db.query(models.ChildDevice).filter(models.ChildDevice.guardian_id == g_id, models.ChildDevice.name == c_data["name"]).first()
                if not dev:
                    platform = "ios" if "iPhone" in c_data["device"] or "Apple" in c_data["device"] else "android"
                    dev = models.ChildDevice(
                        id=str(uuid.uuid4()),
                        guardian_id=g_id,
                        name=c_data["name"],
                        platform=platform,
                        device_token=f"demo-device-{uuid.uuid4().hex[:8]}"
                    )
                    db.add(dev)
                    db.flush()
                
                # Consents
                for mod in ["location", "typing", "app_usage", "gsr", "voice", "companion_chat", "pulse"]:
                    grant = db.query(models.ConsentGrant).filter(models.ConsentGrant.subject_id == dev.id, models.ConsentGrant.modality == mod).first()
                    if not grant:
                        db.add(models.ConsentGrant(subject_id=dev.id, modality=mod, is_granted=True))
                
                # Device v2
                existing_v2 = db.query(models.Device).filter(models.Device.id == dev.id).first()
                if not existing_v2:
                    db.add(models.Device(id=dev.id, user_id=dev.id, name=dev.name, device_type=c_data["device"]))

                # Generate 30 days of behavior windows and telemetry for Analytics (Phase 8)
                now = datetime.now(timezone.utc)
                for i in range(30):
                    day = now - timedelta(days=29 - i)
                    active_mins = random.uniform(100, 300)
                    sleep_hours = random.uniform(6, 10)
                    
                    bw = models.BehaviorWindow(
                        subject_id=dev.id,
                        start_ts=day.replace(hour=0, minute=0, second=0, microsecond=0),
                        end_ts=day.replace(hour=23, minute=59, second=59, microsecond=0),
                        total_active_mins=active_mins,
                        sleep_hours_proxy=sleep_hours,
                    )
                    db.add(bw)
                    
                    # Generate some risk scores
                    score = db.query(models.RiskScore).filter(models.RiskScore.device_id == dev.id, models.RiskScore.timestamp >= day.replace(hour=0, minute=0, second=0, microsecond=0)).first()
                    if not score:
                        rs = models.RiskScore(
                            device_id=dev.id,
                            timestamp=day,
                            model_name="mobility",
                            score=random.uniform(0.1, 0.4),
                            threshold=0.5,
                            flagged=False
                        )
                        rs.contributing_factors = ["Normal sleep detected", "Consistent daily steps"]
                        db.add(rs)


            db.commit()
            logger.info("Demo data seeding complete.")
    finally:
        db.close()

async def simulate_live_data():
    """Phase 9 - Live Simulation background task"""
    logger.info("Starting PRISM Live Simulator (Demo Mode)...")
    while True:
        db = None
        try:
            db = SessionLocal()
            devices = db.query(models.ChildDevice).all()
            now = datetime.now(timezone.utc)
            
            for dev in devices:
                # Add random phone event
                db.add(models.PhoneEvent(
                    device_id=dev.id,
                    event_type=random.choice(["SCREEN_ON", "SCREEN_OFF", "APP_OPEN", "NOTIFICATION_RECEIVED"]),
                    timestamp=now
                ))
                
                # Sensor Reading
                db.add(models.SensorReading(
                    device_id=dev.id,
                    metric_type="bpm",
                    value=random.uniform(60, 90),
                    timestamp=now
                ))
                
                # Audio Feature
                db.add(models.AudioFeature(
                    device_id=dev.id,
                    speech_segments=random.uniform(2, 10),
                    silence_ratio=random.uniform(0.1, 0.5),
                    timestamp=now
                ))
                
                # Every 10 seconds (approx 2 iterations), maybe generate an alert based on scenario
                if random.random() < 0.2:
                    severity = "sage"
                    summary = "Normal activity."
                    
                    if ACTIVE_SCENARIO == "2": # Sleep Deprivation
                        severity = "critical"
                        summary = "Device usage detected during designated sleep hours."
                    elif ACTIVE_SCENARIO == "4": # Academic Stress
                        severity = "elevated"
                        summary = "Increased typing pressure and irregular app switching detected."
                        
                    alert = models.Alert(
                        device_id=dev.id,
                        severity_tier=severity,
                        plain_language_summary=summary,
                        timestamp=now
                    )
                    alert.contributing_factors = [f"Scenario: {SCENARIOS[ACTIVE_SCENARIO]}"]
                    db.add(alert)
                    
            db.commit()
        except Exception as e:
            logger.error(f"Error in live simulator: {e}")
        finally:
            if db is not None:
                db.close()
        
        # Wait before next tick
        await asyncio.sleep(5)

def start_simulation():
    seed_demo_data_if_needed()
    asyncio.create_task(simulate_live_data())
