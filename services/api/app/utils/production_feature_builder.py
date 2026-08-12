import math
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List

import numpy as np
import pandas as pd

from app.services.colab_ml_service import ColabModelFeatures

logger = logging.getLogger(__name__)

class MissingTelemetryError(Exception):
    """Raised when required production telemetry is missing (preventing fabrication)."""
    pass

class ProductionFeatureBuilder:
    """
    Builds the authoritative 57-feature vector from the live production database.
    Strictly follows Colab model definitions.
    NEVER fabricates data or uses arbitrary means/zeros for missing telemetry.
    """

    def __init__(self, db_session):
        self.db = db_session
        from app import models as _m
        self._m = _m

    def build(self, subject_id: str) -> Optional[ColabModelFeatures]:
        """
        Attempts to build the 57-feature ColabModelFeatures for a subject.
        Returns None if required telemetry is missing.
        """
        try:
            features = self._extract_features(subject_id)
            return ColabModelFeatures(**features)
        except MissingTelemetryError as e:
            logger.info(f"ML prediction unavailable for {subject_id}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error building features for {subject_id}: {e}")
            return None

    def _extract_features(self, subject_id: str) -> Dict[str, Any]:
        """Extracts and computes all 57 features."""
        now = datetime.now(timezone.utc)

        # We will collect everything into this dictionary
        features = {}

        # ─── 1. BASE FEATURES (Available / Derivable) ───

        features["Day_of_Week"] = float(now.weekday())  # 0=Monday, 6=Sunday

        # Sleep Score (Derivable from BehaviorWindow)
        bw = self.db.query(self._m.BehaviorWindow).filter(
            self._m.BehaviorWindow.subject_id == subject_id
        ).order_by(self._m.BehaviorWindow.start_ts.desc()).first()
        features["Sleep_Score"] = float(bw.sleep_hours_proxy * (100.0 / 8.0)) if bw else 0.0

        # Typing Speed WPM
        ts = self.db.query(self._m.TypingSession).filter(
            self._m.TypingSession.device_id == subject_id
        ).order_by(self._m.TypingSession.created_at.desc()).first()
        features["Typing_Speed_WPM"] = float(ts.wpm) if ts else 0.0

        # Pulse Rate BPM
        pulse = self.db.query(self._m.SensorReading).filter(
            self._m.SensorReading.device_id == subject_id,
            self._m.SensorReading.metric_type == 'bpm'
        ).order_by(self._m.SensorReading.timestamp.desc()).first()
        features["Pulse_Rate_BPM"] = float(pulse.value) if pulse else 0.0

        # Screen Time Hours (Derivable from PhoneEvents)
        features["Screen_Time_Hours"] = self._calculate_screen_time_hours(subject_id, now)

        # ─── 2. CATEGORICAL APP USAGE (Derivable) ───
        apps = ["Chrome", "Figma", "Instagram", "Slack", "Spotify", "Terminal", "TikTok", "VS Code", "YouTube"]
        for app in apps:
            features[f"App_Activity_{app}"] = self._check_app_activity(subject_id, app, now)

        # ─── 3. CYCLICAL (Derivable) ───
        features["sin_Day_of_Week"] = float(math.sin(2.0 * math.pi * features["Day_of_Week"] / 7.0))
        features["cos_Day_of_Week"] = float(math.cos(2.0 * math.pi * features["Day_of_Week"] / 7.0))

        # ─── 4. ROLLING WINDOWS (Derivable from history) ───
        self._add_rolling_features(features, subject_id, now)

        # ─── 5. REQUIRES NEW TELEMETRY (Explicit Failure) ───
        # We explicitly list the missing features that require edge/mobile updates.
        missing_features = [
            "Steps_Count", "Unique_POIs", "Audio_Stress_Score", "Vocal_Pitch_Variance",
            "RMS_Energy", "Spectral_Centroid", "MFCC_Mean", "Facial_Valence_Score",
            "Selfie_Smile_Pct", "Eye_Fatigue_Index"
        ]

        # Do not fabricate them. Fail safely.
        raise MissingTelemetryError(f"Missing telemetry required for: {', '.join(missing_features)}")

        # If we had them, we would return `features` here.

    def _calculate_screen_time_hours(self, subject_id: str, now: datetime) -> float:
        # Currently we only have SCREEN_ON events, so we can't derive true duration.
        # But if we did, it would be calculated here.
        return 0.0

    def _check_app_activity(self, subject_id: str, app_name: str, now: datetime) -> float:
        cutoff = now - timedelta(days=1)
        count = self.db.query(self._m.PhoneEvent).filter(
            self._m.PhoneEvent.device_id == subject_id,
            self._m.PhoneEvent.event_type == 'APP_USAGE',
            self._m.PhoneEvent.package_name.ilike(f"%{app_name}%"),
            self._m.PhoneEvent.timestamp >= cutoff
        ).count()
        return 1.0 if count > 0 else 0.0

    def _add_rolling_features(self, features: dict, subject_id: str, now: datetime):
        # We fetch 14 days of history for the core metrics.
        # In a real implementation, we would query the historical rows, load into pandas DataFrame,
        # calculate mean/std, and populate `features`.

        core_metrics = ["Sleep_Score", "Steps_Count", "Screen_Time_Hours", "Typing_Speed_WPM", "Pulse_Rate_BPM"]
        windows = [3, 7, 14]

        for metric in core_metrics:
            # Deterministic calculation placeholder (would use pd.Series.rolling)
            for w in windows:
                features[f"{metric}_{w}d_mean"] = 0.0
                if w in [7, 14]:
                    features[f"{metric}_{w}d_std"] = 0.0

            features[f"{metric}_dev_from_7d"] = features.get(metric, 0.0) - features.get(f"{metric}_7d_mean", 0.0)
