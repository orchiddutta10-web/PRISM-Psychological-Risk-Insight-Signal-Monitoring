"""
Feature Preprocessor — cleans, normalizes, and engineers features on the edge
before transmitting to the PRISM AI Server.
"""

import math
from typing import Dict, Any

class FeaturePreprocessor:
    """
    Handles data cleaning, normalization, missing value imputation,
    and basic feature engineering (e.g., HRV estimation) for the Risk Engine.
    """
    def __init__(self):
        self.session_id = "session_" + str(int(math.time.time())) if hasattr(math, "time") else "session_0"
        self._hr_history = []
        
    def process(self, raw_features: Dict[str, Any]) -> Dict[str, Any]:
        cleaned = self._clean_data(raw_features)
        normalized = self._normalize(cleaned)
        engineered = self._feature_engineering(normalized)
        return self._add_context(engineered)

    def _clean_data(self, features: Dict[str, Any]) -> Dict[str, Any]:
        """Missing value handling and outlier removal."""
        cleaned = features.copy()
        
        # Handle ESP32 pulse data
        pulse = cleaned.get("esp32_pulse", {})
        if pulse:
            # Impute missing BPM or clamp outliers
            bpm = pulse.get("bpm", 0)
            if not (30 <= bpm <= 250):
                pulse["bpm"] = 75.0  # reasonable default if noisy
                pulse["alert_status"] = "NOISE_REMOVED"
                
            # G-force outlier cleaning
            g_force = pulse.get("g_force", 1.0)
            if g_force > 16.0: # Unrealistic for normal behavior
                pulse["g_force"] = 1.0
                
            cleaned["esp32_pulse"] = pulse
            
        # Clean mobile telemetry
        mobile = cleaned.get("mobile_telemetry", {})
        if mobile:
            # Default missing battery to 50 if unknown
            if "battery_level" not in mobile:
                mobile["battery_level"] = 50
            cleaned["mobile_telemetry"] = mobile

        return cleaned

    def _normalize(self, features: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize features to expected ranges for the PyTorch Risk Engine."""
        # The backend risk engine typically expects normalized vectors, but since this
        # is an edge gateway, we'll provide standard scaled or normalized min-max fields
        # if needed. For now, we ensure types are floats where expected.
        pulse = features.get("esp32_pulse", {})
        if pulse and "bpm" in pulse:
            pulse["bpm"] = round(float(pulse["bpm"]), 2)
        return features

    def _feature_engineering(self, features: Dict[str, Any]) -> Dict[str, Any]:
        """Generate HRV / rolling aggregation features."""
        pulse = features.get("esp32_pulse", {})
        if pulse and "bpm" in pulse:
            bpm = pulse["bpm"]
            self._hr_history.append(bpm)
            if len(self._hr_history) > 30: # Rolling window
                self._hr_history.pop(0)
                
            # Simple pseudo-HRV estimation (SDNN-like variance on HR) if enough data
            if len(self._hr_history) > 5:
                mean_hr = sum(self._hr_history) / len(self._hr_history)
                variance = sum((x - mean_hr) ** 2 for x in self._hr_history) / len(self._hr_history)
                pulse["hr_variance"] = round(variance, 2)
                
            features["esp32_pulse"] = pulse
            
        return features
        
    def _add_context(self, features: Dict[str, Any]) -> Dict[str, Any]:
        """Sessionization and context generation."""
        import time
        features["session_id"] = f"sess_{int(time.time() // 3600)}" # 1-hour sessions
        features["context_tags"] = []
        
        # Determine context tags
        pulse = features.get("esp32_pulse", {})
        if pulse.get("bpm", 0) > 100:
            features["context_tags"].append("ELEVATED_HR")
            
        motion = features.get("motion", {})
        if not motion.get("is_idle", True):
            features["context_tags"].append("ACTIVE_MOTION")
            
        return features
