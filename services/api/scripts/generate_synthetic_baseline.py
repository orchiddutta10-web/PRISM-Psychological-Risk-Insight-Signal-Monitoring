import argparse
import os
import random
import sys
from datetime import datetime, timedelta, timezone

# Add services/api to python path to import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from app import models
    from app.database import SessionLocal
except ImportError:
    SessionLocal = None
    models = None


def generate_normal_day_telemetry(subject_id, date, is_api=False):
    """
    Generates a normal daily baseline for location, typing, app usage, and physio.
    """
    events = []

    # 1. Mobility/Steps (location)
    # Higher during daytime (7 AM - 9 PM)
    steps = random.randint(7000, 12000)
    events.append(
        {
            "subject_id": subject_id,
            "modality": "location",
            "value": {"steps": steps, "is_synthetic": True},
            "confidence": 0.95,
            "timestamp": date.replace(hour=18, minute=0, second=0).isoformat(),
        }
    )

    # 2. Typing dynamics
    # Normal typing rhythm
    events.append(
        {
            "subject_id": subject_id,
            "modality": "typing",
            "value": {
                "delay_index": random.uniform(0.9, 1.1),
                "correction_rate_variance": random.uniform(0.05, 0.15),
                "is_synthetic": True,
            },
            "confidence": 0.90,
            "timestamp": date.replace(hour=14, minute=30, second=0).isoformat(),
        }
    )

    # 3. App Usage
    # Normal evening social/gaming, no late-night spikes
    events.append(
        {
            "subject_id": subject_id,
            "modality": "app_usage",
            "value": {
                "late_night_hours": random.uniform(0.1, 0.8),
                "baseline_hours": 1.0,
                "is_synthetic": True,
            },
            "confidence": 0.95,
            "timestamp": date.replace(hour=20, minute=15, second=0).isoformat(),
        }
    )

    # 4. Physio (PPG and GSR)
    # Normal heart rate plateau during sleep (e.g. 2 AM)
    events.append(
        {
            "subject_id": subject_id,
            "modality": "ppg",
            "value": {"heart_rate_bpm": random.uniform(55, 68), "is_synthetic": True},
            "confidence": 0.92,
            "timestamp": date.replace(hour=2, minute=30, second=0).isoformat(),
        }
    )
    # Normal GSR baseline during sleep
    events.append(
        {
            "subject_id": subject_id,
            "modality": "gsr",
            "value": {
                "gsr_microsiemens": random.uniform(1.0, 2.5),
                "is_synthetic": True,
            },
            "confidence": 0.90,
            "timestamp": date.replace(hour=3, minute=15, second=0).isoformat(),
        }
    )

    return events


def generate_perturbed_telemetry(subject_id, date, anomaly_type):
    """
    Generates telemetry containing a specific labeled anomaly.
    """
    events = []

    if anomaly_type == "late_night_spike":
        # Elevated late-night app usage (e.g. 3.2 hours at 2:00 AM)
        events.append(
            {
                "subject_id": subject_id,
                "modality": "app_usage",
                "value": {
                    "late_night_hours": 3.2,
                    "baseline_hours": 0.8,
                    "is_synthetic": True,
                    "anomaly_label": "late_night_spike",
                },
                "confidence": 0.98,
                "timestamp": date.replace(hour=2, minute=0, second=0).isoformat(),
            }
        )

    elif anomaly_type == "social_withdrawal":
        # Drop in steps (< 2000 steps)
        events.append(
            {
                "subject_id": subject_id,
                "modality": "location",
                "value": {
                    "steps": 1200,
                    "is_synthetic": True,
                    "anomaly_label": "social_withdrawal",
                },
                "confidence": 0.95,
                "timestamp": date.replace(hour=18, minute=0, second=0).isoformat(),
            }
        )
        # Typing cadence slowdown (high delay_index)
        events.append(
            {
                "subject_id": subject_id,
                "modality": "typing",
                "value": {
                    "delay_index": 1.45,
                    "correction_rate_variance": 0.35,
                    "is_synthetic": True,
                    "anomaly_label": "social_withdrawal",
                },
                "confidence": 0.90,
                "timestamp": date.replace(hour=14, minute=30, second=0).isoformat(),
            }
        )

    elif anomaly_type == "risky_app":
        # New risky app install burst
        events.append(
            {
                "subject_id": subject_id,
                "modality": "app_usage",
                "value": {
                    "late_night_hours": 0.5,
                    "baseline_hours": 1.0,
                    "new_installed_packages": ["com.anonymous.chat"],
                    "is_synthetic": True,
                    "anomaly_label": "risky_app",
                },
                "confidence": 0.99,
                "timestamp": date.replace(hour=16, minute=10, second=0).isoformat(),
            }
        )

    elif anomaly_type == "physio_stress":
        # Elevated GSR and Heart Rate
        events.append(
            {
                "subject_id": subject_id,
                "modality": "gsr",
                "value": {
                    "gsr_microsiemens": 8.4,
                    "is_synthetic": True,
                    "anomaly_label": "physio_stress",
                },
                "confidence": 0.95,
                "timestamp": date.replace(hour=15, minute=0, second=0).isoformat(),
            }
        )
        events.append(
            {
                "subject_id": subject_id,
                "modality": "ppg",
                "value": {
                    "heart_rate_bpm": 112.0,
                    "is_synthetic": True,
                    "anomaly_label": "physio_stress",
                },
                "confidence": 0.90,
                "timestamp": date.replace(hour=15, minute=5, second=0).isoformat(),
            }
        )

    return events


def run_generator():
    parser = argparse.ArgumentParser(description="PRISM Baseline Telemetry Generator")
    parser.add_argument("--subject_id", required=True, help="Subject child device ID")
    parser.add_argument(
        "--days", type=int, default=14, help="Number of baseline days (14-30)"
    )
    parser.add_argument(
        "--perturb", action="store_true", help="Inject labeled anomalies in last days"
    )
    parser.add_argument(
        "--api", action="store_true", help="Push over API instead of direct DB seeding"
    )
    parser.add_argument(
        "--api_url",
        default="http://localhost:8000/api/v1/events/ingest/unified",
        help="Ingestion API endpoint",
    )
    parser.add_argument("--token", help="Bearer JWT Token (required if using --api)")

    args = parser.parse_args()

    # 1. Calculate time window
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=args.days)

    all_events = []

    for i in range(args.days):
        current_date = start_date + timedelta(days=i)

        # In perturb mode, inject anomalies on the final days
        if args.perturb and (args.days - i) <= 4:
            day_offset = args.days - i
            if day_offset == 4:
                day_events = generate_perturbed_telemetry(
                    args.subject_id, current_date, "late_night_spike"
                )
            elif day_offset == 3:
                day_events = generate_perturbed_telemetry(
                    args.subject_id, current_date, "social_withdrawal"
                )
            elif day_offset == 2:
                day_events = generate_perturbed_telemetry(
                    args.subject_id, current_date, "risky_app"
                )
            else:
                day_events = generate_perturbed_telemetry(
                    args.subject_id, current_date, "physio_stress"
                )
        else:
            day_events = generate_normal_day_telemetry(args.subject_id, current_date)

        all_events.extend(day_events)

    # Sort events by timestamp
    all_events.sort(key=lambda e: e["timestamp"])

    print(f"Generated {len(all_events)} telemetry events over {args.days} days.")

    if args.api:
        import requests

        if not args.token:
            print("Error: --token is required when using --api mode.")
            sys.exit(1)
        headers = {"Authorization": f"Bearer {args.token}"}
        success_count = 0
        for ev in all_events:
            try:
                res = requests.post(args.api_url, json=ev, headers=headers)
                if res.status_code == 200:
                    success_count += 1
                else:
                    print(
                        f"Failed to ingest event {ev['modality']}: Status {res.status_code} - {res.text}"
                    )
            except Exception as ex:
                print(f"API Connection error: {ex}")
        print(
            f"API Ingestion complete: {success_count}/{len(all_events)} events ingested."
        )

    else:
        if not SessionLocal:
            print(
                "Error: app.database and models not importable. Cannot run direct seeding."
            )
            sys.exit(1)

        db = SessionLocal()
        try:
            # Verify subject exists
            device = (
                db.query(models.ChildDevice)
                .filter(models.ChildDevice.id == args.subject_id)
                .first()
            )
            if not device:
                print(
                    f"Error: Child device with ID '{args.subject_id}' does not exist in DB."
                )
                sys.exit(1)

            inserted_count = 0
            for ev in all_events:
                db_event = models.UnifiedEvent(
                    subject_id=args.subject_id,
                    modality=ev["modality"],
                    timestamp=datetime.fromisoformat(ev["timestamp"]).replace(
                        tzinfo=None
                    ),
                    confidence=ev["confidence"],
                )
                db_event.value = ev["value"]
                db.add(db_event)
                inserted_count += 1

            db.commit()
            print(
                f"Direct DB seeding complete: {inserted_count} events added to unified_events."
            )

        except Exception as ex:
            db.rollback()
            print(f"DB transaction failed: {ex}")
            sys.exit(1)
        finally:
            db.close()


if __name__ == "__main__":
    run_generator()
