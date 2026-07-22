import numpy as np

def extract_gsr_features(gsr_values: np.ndarray, tonic_values: np.ndarray = None, phasic_values: np.ndarray = None) -> dict:
    """
    Extracts time-domain features from skin conductance (GSR/EDA) time-series.
    """
    if len(gsr_values) == 0:
        return {}
        
    features = {
        "gsr_mean": float(np.mean(gsr_values)),
        "gsr_std": float(np.std(gsr_values)),
        "gsr_min": float(np.min(gsr_values)),
        "gsr_max": float(np.max(gsr_values)),
        "gsr_range": float(np.max(gsr_values) - np.min(gsr_values))
    }
    
    # If tonic/phasic subcomponents are available (e.g., from service/simulator)
    if tonic_values is not None and len(tonic_values) > 0:
        features["scl_mean"] = float(np.mean(tonic_values))
        features["scl_drift"] = float(tonic_values[-1] - tonic_values[0])
        
    if phasic_values is not None and len(phasic_values) > 0:
        features["scr_mean"] = float(np.mean(phasic_values))
        features["scr_max_peak"] = float(np.max(phasic_values))
        # Simple count of peaks above a threshold (typical SCR threshold is 0.05 uS)
        peaks = [v for v in phasic_values if v > 0.05]
        features["scr_active_ratio"] = len(peaks) / len(phasic_values)
        
    return features

def extract_hrv_features(ibi_ms_values: np.ndarray) -> dict:
    """
    Extracts Heart Rate Variability (HRV) metrics in the time-domain from a sequence of
    Inter-Beat Intervals (IBIs) in milliseconds.
    """
    if len(ibi_ms_values) < 2:
        return {
            "hr_mean": 0.0,
            "hrv_sdnn": 0.0,
            "hrv_rmssd": 0.0
        }
        
    # Calculate heart rates from intervals (ms to bpm)
    heart_rates = 60000.0 / ibi_ms_values
    
    # SDNN: Standard deviation of IBI intervals
    sdnn = np.std(ibi_ms_values)
    
    # RMSSD: Root mean square of successive differences
    diffs = np.diff(ibi_ms_values)
    rmssd = np.sqrt(np.mean(diffs ** 2))
    
    return {
        "hr_mean": float(np.mean(heart_rates)),
        "hr_std": float(np.std(heart_rates)),
        "hrv_sdnn": float(sdnn),
        "hrv_rmssd": float(rmssd),
        "ibi_min": float(np.min(ibi_ms_values)),
        "ibi_max": float(np.max(ibi_ms_values))
    }

def compile_model_features(gsr_features: dict, hrv_features: dict) -> dict:
    """Combines features into a single standardized dictionary key-value set."""
    features = {}
    
    # Map raw features to expected ML model feature vector keys
    features["mean_gsr"] = gsr_features.get("gsr_mean", 0.0)
    features["std_gsr"] = gsr_features.get("gsr_std", 0.0)
    features["mean_scl"] = gsr_features.get("scl_mean", 0.0)
    features["max_scr"] = gsr_features.get("scr_max_peak", 0.0)
    
    features["mean_hr"] = hrv_features.get("hr_mean", 70.0)
    features["sdnn"] = hrv_features.get("hrv_sdnn", 50.0)
    features["rmssd"] = hrv_features.get("hrv_rmssd", 40.0)
    
    return features
