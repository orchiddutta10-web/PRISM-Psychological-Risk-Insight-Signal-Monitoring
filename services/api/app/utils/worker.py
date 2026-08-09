from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app import models
import json


def run_baseline_aggregation(db: Session):
    """
    Computes baseline profiles (rolling mean/variance) for all active devices and signal types.
    Only computes over the last 30 days of raw events.
    """
    devices = db.query(models.ChildDevice).all()
    signal_types = ["location", "typing", "app_usage"]

    for device in devices:
        for sig_type in signal_types:
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=30)
            events = (
                db.query(models.RawSignalEvent)
                .filter(
                    models.RawSignalEvent.device_id == device.id,
                    models.RawSignalEvent.signal_type == sig_type,
                    models.RawSignalEvent.timestamp >= cutoff_date,
                )
                .all()
            )

            if not events:
                continue

            values = []
            for event in events:
                try:
                    meta = json.loads(event.metadata_json)
                    # Extract any numeric values present in the metadata
                    for k, v in meta.items():
                        if isinstance(v, (int, float)):
                            values.append(float(v))
                except (json.JSONDecodeError, TypeError, ValueError) as e:
                    import logging

                    logging.warning(
                        f"Failed to parse metadata for event {event.id}: {e}"
                    )
                    continue

            if not values:
                continue

            n = len(values)
            mean = sum(values) / n
            variance = 0.0
            if n > 1:
                variance = sum((x - mean) ** 2 for x in values) / (n - 1)

            profile = (
                db.query(models.BaselineProfile)
                .filter(
                    models.BaselineProfile.device_id == device.id,
                    models.BaselineProfile.signal_type == sig_type,
                )
                .first()
            )

            if not profile:
                profile = models.BaselineProfile(
                    device_id=device.id, signal_type=sig_type
                )
                db.add(profile)

            profile.rolling_mean = mean
            profile.rolling_variance = variance
            profile.updated_at = datetime.now(timezone.utc)

    db.commit()


def purge_raw_events(db: Session, days: int = 30) -> int:
    """
    Deletes raw signal events older than the specified number of days (default 30).
    """
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
    deleted_count = (
        db.query(models.RawSignalEvent)
        .filter(models.RawSignalEvent.timestamp < cutoff_date)
        .delete()
    )
    db.commit()
    return deleted_count
