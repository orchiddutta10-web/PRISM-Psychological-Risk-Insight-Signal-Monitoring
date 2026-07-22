from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app import models
import math

def calculate_circadian_regularity(db: Session, subject_id: str) -> float:
    """
    Computes a rolling 'circadian regularity index' (variance of sleep-window start time).
    A high index means HIGH regularity (low variance). 
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    # Ensure cutoff is timezone-naive to match DB if DB is naive
    cutoff = cutoff.replace(tzinfo=None)
    
    windows = db.query(models.SleepWindow).filter(
        models.SleepWindow.subject_id == subject_id,
        models.SleepWindow.estimated_start >= cutoff
    ).all()
    
    if len(windows) < 3:
        return 1.0 # Not enough data, assume regular
        
    start_hours = []
    for w in windows:
        # Convert start time to hours past noon to handle midnight crossover
        h = w.estimated_start.hour + w.estimated_start.minute / 60.0
        if h < 12:
            h += 24
        start_hours.append(h)
        
    n = len(start_hours)
    mean_h = sum(start_hours) / n
    variance = sum((x - mean_h) ** 2 for x in start_hours) / (n - 1)
    
    # Map variance to an index between 0 and 1, where 1 is highly regular
    # E.g., a variance of 0 hours -> 1.0. A variance of 4 hours -> lower
    regularity_index = max(0.0, 1.0 - (math.sqrt(variance) / 4.0))
    return regularity_index

def infer_sleep_windows(db: Session):
    """
    Phase 3: Rule-based circadian estimator.
    Scans recent events to infer sleep/wake windows based on:
    - Screen-off / no app usage
    - Accelerometer stillness (from location/movement payload)
    - Lack of typing
    - Low GSR / Resting HR
    """
    devices = db.query(models.ChildDevice).all()
    
    # We will look at the last 24 hours
    start_period = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)
    
    for device in devices:
        events = db.query(models.UnifiedEvent).filter(
            models.UnifiedEvent.subject_id == device.id,
            models.UnifiedEvent.timestamp >= start_period
        ).order_by(models.UnifiedEvent.timestamp.asc()).all()
        
        if not events:
            continue
            
        # Very crude rule-based estimator for the MVP:
        # Find the longest continuous gap (> 3 hours) with no active typing or app_usage,
        # bounded by low HR/GSR if available.
        
        last_active_time = start_period
        longest_gap_start = None
        longest_gap_end = None
        longest_gap_duration = timedelta(0)
        
        for ev in events:
            if ev.modality in ["typing", "app_usage", "location"]:
                # Device is active
                gap = ev.timestamp - last_active_time
                if gap > longest_gap_duration and gap > timedelta(hours=3):
                    longest_gap_duration = gap
                    longest_gap_start = last_active_time
                    longest_gap_end = ev.timestamp
                
                last_active_time = ev.timestamp
                
        # Check gap until now
        gap = datetime.now(timezone.utc).replace(tzinfo=None) - last_active_time
        if gap > longest_gap_duration and gap > timedelta(hours=3):
            longest_gap_duration = gap
            longest_gap_start = last_active_time
            longest_gap_end = datetime.now(timezone.utc).replace(tzinfo=None)
            
        if longest_gap_start and longest_gap_end:
            # Check if this window is already recorded to avoid duplicates.
            existing = db.query(models.SleepWindow).filter(
                models.SleepWindow.subject_id == device.id,
                models.SleepWindow.estimated_start >= longest_gap_start - timedelta(hours=2),
                models.SleepWindow.estimated_start <= longest_gap_start + timedelta(hours=2)
            ).first()
            
            if not existing:
                # Refine confidence by looking for resting HR plateau and low GSR variance during this gap
                sleep_events = db.query(models.UnifiedEvent).filter(
                    models.UnifiedEvent.subject_id == device.id,
                    models.UnifiedEvent.timestamp >= longest_gap_start,
                    models.UnifiedEvent.timestamp <= longest_gap_end,
                    models.UnifiedEvent.modality.in_(["ppg", "gsr"])
                ).all()

                hr_vals = [e.value.get("heart_rate_bpm") for e in sleep_events if e.modality == "ppg" and "heart_rate_bpm" in e.value]
                gsr_vals = [e.value.get("gsr_microsiemens") for e in sleep_events if e.modality == "gsr" and "gsr_microsiemens" in e.value]

                confidence = min(0.6, longest_gap_duration.total_seconds() / (8 * 3600))
                
                # Boost confidence if we see resting HR (< 75 bpm avg)
                if hr_vals:
                    avg_hr = sum(hr_vals) / len(hr_vals)
                    if avg_hr < 75:
                        confidence += 0.2
                
                # Boost confidence if we see low GSR variance
                if len(gsr_vals) > 1:
                    mean_gsr = sum(gsr_vals) / len(gsr_vals)
                    gsr_var = sum((x - mean_gsr) ** 2 for x in gsr_vals) / len(gsr_vals)
                    if gsr_var < 1.0:
                        confidence += 0.2

                confidence = min(1.0, confidence)

                window = models.SleepWindow(
                    subject_id=device.id,
                    estimated_start=longest_gap_start,
                    estimated_end=longest_gap_end,
                    confidence=confidence
                )
                db.add(window)
                db.commit()
                
                # Check circadian regularity to see if we should trigger an alert
                reg_index = calculate_circadian_regularity(db, device.id)
                if reg_index < 0.5:
                    alert = models.Alert(
                        device_id=device.id,
                        severity_tier="amber",
                        plain_language_summary="Irregular sleep schedule detected.",
                    )
                    alert.contributing_factors = [f"Circadian regularity index dropped to {int(reg_index*100)}%."]
                    db.add(alert)
                    db.commit()
