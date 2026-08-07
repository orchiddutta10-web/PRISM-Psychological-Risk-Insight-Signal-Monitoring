import numpy as np
import pandas as pd
from typing import List, Dict, Any
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models import SensorReading, BehaviorWindow, PhoneEvent

class FeatureStore:
    """
    Simulated Feature Store for PRISM.
    In production, this interfaces with Redis/Feast and Apache Flink for real-time aggregations.
    """
    def __init__(self, db: Session):
        self.db = db

    def get_features_for_device(self, device_id: str, target_time: datetime = None) -> Dict[str, float]:
        """
        Calculates and retrieves the feature vector for a specific device at a given time.
        """
        if target_time is None:
            target_time = datetime.now(timezone.utc)
            
        # Get historical window (14 days)
        start_time = target_time - timedelta(days=14)
        
        # 1. Behavior Features
        windows = self.db.query(BehaviorWindow).filter(
            BehaviorWindow.subject_id == device_id,
            BehaviorWindow.start_ts >= start_time,
            BehaviorWindow.start_ts <= target_time
        ).all()
        
        active_mins = [w.total_active_mins for w in windows if w.total_active_mins]
        sleep_hours = [w.sleep_hours_proxy for w in windows if w.sleep_hours_proxy]
        
        avg_active = np.mean(active_mins) if active_mins else 0.0
        avg_sleep = np.mean(sleep_hours) if sleep_hours else 0.0
        
        sleep_variance = np.var(sleep_hours) if len(sleep_hours) > 1 else 0.0
        active_variance = np.var(active_mins) if len(active_mins) > 1 else 0.0
        
        # 2. Phone Usage Features (Entropy & Frequency)
        events = self.db.query(PhoneEvent).filter(
            PhoneEvent.device_id == device_id,
            PhoneEvent.timestamp >= target_time - timedelta(days=3)
        ).all()
        
        screen_on_count = sum(1 for e in events if e.event_type == "SCREEN_ON")
        unlock_frequency = screen_on_count / 3.0 # per day avg over 3 days
        
        # 3. Sensor Features
        readings = self.db.query(SensorReading).filter(
            SensorReading.device_id == device_id,
            SensorReading.timestamp >= target_time - timedelta(days=1)
        ).all()
        
        heart_rates = [r.value for r in readings if r.metric_type == "bpm"]
        avg_hr = np.mean(heart_rates) if heart_rates else 0.0
        hr_variance = np.var(heart_rates) if len(heart_rates) > 1 else 0.0
        
        # 4. Computed Z-Scores (Simulated baseline comparison)
        # In a real system, these compare current 24h against the 14-day rolling mean
        current_sleep = sleep_hours[-1] if sleep_hours else 0.0
        sleep_z_score = (current_sleep - avg_sleep) / (np.sqrt(sleep_variance) + 1e-5) if avg_sleep > 0 else 0.0

        return {
            "avg_active_mins_14d": float(avg_active),
            "avg_sleep_hours_14d": float(avg_sleep),
            "sleep_variance_14d": float(sleep_variance),
            "active_variance_14d": float(active_variance),
            "unlock_frequency_3d": float(unlock_frequency),
            "avg_hr_24h": float(avg_hr),
            "hr_variance_24h": float(hr_variance),
            "sleep_z_score_24h": float(sleep_z_score)
        }

    def generate_training_dataset(self, device_ids: List[str]) -> pd.DataFrame:
        """
        Extracts a batched dataset for ML training.
        """
        rows = []
        for did in device_ids:
            # Generate features for multiple days to build a time-series dataset
            now = datetime.now(timezone.utc)
            for i in range(14):
                target = now - timedelta(days=i)
                feats = self.get_features_for_device(did, target_time=target)
                feats["device_id"] = did
                feats["timestamp"] = target
                # Synthesize a mock label for training purposes
                feats["is_anomalous"] = 1 if abs(feats["sleep_z_score_24h"]) > 2.0 else 0
                rows.append(feats)
                
        return pd.DataFrame(rows)
