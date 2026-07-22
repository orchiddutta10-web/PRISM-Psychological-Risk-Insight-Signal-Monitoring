"""
behavioral_schema.py — Privacy-first data schema for passive smartphone
behavioral metrics.  No raw keystrokes, no raw GPS, no app names ever
leave the device.  Only de-identified, aggregated feature vectors are
transmitted to the SentinelMind backend.

Feature Group Layout
────────────────────
  1.  Keystroke dynamics  (8 features)   — typing rhythm, fatigue markers
  2.  App activity        (10 features)  — category usage, screen time
  3.  GPS telemetry       (7 features)   — mobility, isolation markers
  4.  Biometric (from HW) (7 features)   — HR, GSR, HRV (existing)

Each "log" pushed by the phone represents a fixed time window
(default = 5 minutes).  The server accumulates windows and forms
daily tensors for the deep-learning model.
"""

from __future__ import annotations

import time
import numpy as np
from typing import Optional
from dataclasses import dataclass, field, asdict

# ═══════════════════════════════════════════════════════════════════
# Feature dimension constants
# ═══════════════════════════════════════════════════════════════════

KEYSTROKE_FEATURES = [
    "flight_time_mean_ms",         # avg time between key-down → next key-down
    "flight_time_std_ms",
    "dwell_time_mean_ms",          # avg time key is held
    "dwell_time_std_ms",
    "backspace_rate",              # backspace / total presses
    "typing_speed_cps",            # characters per second (during active typing)
    "pause_frequency",             # pauses > 2 s  per minute
    "total_keystrokes",            # raw count in window
]
N_KEYSTROKE = len(KEYSTROKE_FEATURES)        # 8

APP_FEATURES = [
    "usage_social_min",
    "usage_productivity_min",
    "usage_game_min",
    "usage_health_min",
    "usage_communication_min",
    "usage_entertainment_min",
    "screen_on_min",
    "late_night_min",               # minutes after 23:00
    "app_switch_count",
    "longest_session_min",
]
N_APP = len(APP_FEATURES)                    # 10

GPS_FEATURES = [
    "total_distance_km",
    "location_variance",             # variance of lat/lng (normalised)
    "mobility_radius_km",            # radius of gyration
    "n_unique_places",              # inferred via DBSCAN clustering
    "home_time_ratio",              # time at primary cluster
    "entropy_transitions",          # Shannon entropy of place transitions
    "avg_flight_length_m",
]
N_GPS = len(GPS_FEATURES)                    # 7

BIOMETRIC_FEATURES = [
    "mean_hr",
    "std_gsr",
    "mean_scl",
    "max_scr",
    "mean_hr",
    "sdnn",
    "rmssd",
]
N_BIOMETRIC = len(BIOMETRIC_FEATURES)        # 7

FUSION_DIM = N_KEYSTROKE + N_APP + N_GPS + N_BIOMETRIC  # 32

# ═══════════════════════════════════════════════════════════════════
# Data classes
# ═══════════════════════════════════════════════════════════════════

@dataclass
class KeystrokeWindow:
    flight_time_mean_ms: float = 0.0
    flight_time_std_ms: float = 0.0
    dwell_time_mean_ms: float = 0.0
    dwell_time_std_ms: float = 0.0
    backspace_rate: float = 0.0
    typing_speed_cps: float = 0.0
    pause_frequency: float = 0.0
    total_keystrokes: int = 0

    def to_array(self) -> np.ndarray:
        return np.array([
            self.flight_time_mean_ms, self.flight_time_std_ms,
            self.dwell_time_mean_ms, self.dwell_time_std_ms,
            self.backspace_rate, self.typing_speed_cps,
            self.pause_frequency, float(self.total_keystrokes),
        ], dtype=np.float32)

    @classmethod
    def empty(cls) -> KeystrokeWindow:
        return cls()


@dataclass
class AppActivityWindow:
    usage_social_min: float = 0.0
    usage_productivity_min: float = 0.0
    usage_game_min: float = 0.0
    usage_health_min: float = 0.0
    usage_communication_min: float = 0.0
    usage_entertainment_min: float = 0.0
    screen_on_min: float = 0.0
    late_night_min: float = 0.0
    app_switch_count: int = 0
    longest_session_min: float = 0.0

    def to_array(self) -> np.ndarray:
        return np.array([
            self.usage_social_min, self.usage_productivity_min,
            self.usage_game_min, self.usage_health_min,
            self.usage_communication_min, self.usage_entertainment_min,
            self.screen_on_min, self.late_night_min,
            float(self.app_switch_count), self.longest_session_min,
        ], dtype=np.float32)

    @classmethod
    def empty(cls) -> AppActivityWindow:
        return cls()


@dataclass
class GPSTelemetryWindow:
    total_distance_km: float = 0.0
    location_variance: float = 0.0
    mobility_radius_km: float = 0.0
    n_unique_places: int = 1
    home_time_ratio: float = 1.0
    entropy_transitions: float = 0.0
    avg_flight_length_m: float = 0.0

    def to_array(self) -> np.ndarray:
        return np.array([
            self.total_distance_km, self.location_variance,
            self.mobility_radius_km, float(self.n_unique_places),
            self.home_time_ratio, self.entropy_transitions,
            self.avg_flight_length_m,
        ], dtype=np.float32)

    @classmethod
    def empty(cls) -> GPSTelemetryWindow:
        return cls()


@dataclass
class PhoneLogPayload:
    """
    Top-level payload pushed from the smartphone every aggregation
    window (default: 5 min).  The `device_id` is the only identifier.
    All temporal features are computed on-device.
    """
    device_id: str = ""
    window_start_unix: float = 0.0
    window_end_unix: float = 0.0
    timezone_offset_hours: int = 0       # for correct late-night detection
    keystroke: KeystrokeWindow = field(default_factory=KeystrokeWindow)
    app: AppActivityWindow = field(default_factory=AppActivityWindow)
    gps: GPSTelemetryWindow = field(default_factory=GPSTelemetryWindow)

    def to_feature_vector(self) -> np.ndarray:
        return np.concatenate([
            self.keystroke.to_array(),
            self.app.to_array(),
            self.gps.to_array(),
        ]).astype(np.float32)             # (25,)


@dataclass
class FusedDailyTensor:
    """
    24-hour tensor assembled server-side from individual windows.
    Shape per modality: (time_steps=288, features).
    At 5-min resolution: 24 h × 12 windows/h = 288 steps.
    """
    keystroke: np.ndarray = field(default_factory=lambda: np.zeros((288, N_KEYSTROKE), dtype=np.float32))
    app: np.ndarray = field(default_factory=lambda: np.zeros((288, N_APP), dtype=np.float32))
    gps: np.ndarray = field(default_factory=lambda: np.zeros((288, N_GPS), dtype=np.float32))
    biometric: np.ndarray = field(default_factory=lambda: np.zeros((288, N_BIOMETRIC), dtype=np.float32))
    label: Optional[int] = None
    device_id: str = ""

    @property
    def stacked(self) -> np.ndarray:
        """Full fusion tensor: (288, 32)."""
        return np.concatenate([self.keystroke, self.app, self.gps, self.biometric], axis=-1)


# ═══════════════════════════════════════════════════════════════════
# Normalisation statistics  (would be fitted on a held-out training set)
# ═══════════════════════════════════════════════════════════════════

NORM_PARAMS = {
    # key: (mean, std)
    "flight_time_mean_ms":     (180.0, 120.0),
    "flight_time_std_ms":      (80.0,  60.0),
    "dwell_time_mean_ms":      (90.0,  50.0),
    "dwell_time_std_ms":       (40.0,  30.0),
    "backspace_rate":          (0.05,  0.06),
    "typing_speed_cps":        (5.0,   2.5),
    "pause_frequency":         (0.5,   0.8),
    "total_keystrokes":        (60.0,  80.0),

    "usage_social_min":        (5.0,   10.0),
    "usage_productivity_min":  (10.0,  15.0),
    "usage_game_min":          (3.0,   8.0),
    "usage_health_min":        (1.0,   3.0),
    "usage_communication_min": (4.0,   6.0),
    "usage_entertainment_min": (8.0,   12.0),
    "screen_on_min":           (15.0,  12.0),
    "late_night_min":          (1.0,   5.0),
    "app_switch_count":        (15.0,  20.0),
    "longest_session_min":     (8.0,   12.0),

    "total_distance_km":       (1.0,   3.0),
    "location_variance":       (0.3,   0.4),
    "mobility_radius_km":      (0.5,   1.5),
    "n_unique_places":         (3.0,   3.0),
    "home_time_ratio":         (0.6,   0.3),
    "entropy_transitions":     (1.2,   0.8),
    "avg_flight_length_m":     (200.0, 500.0),

    "mean_hr":                 (75.0,  15.0),
    "mean_gsr":                (4.0,   3.5),
    "mean_scl":                (3.8,   3.0),
    "max_scr":                 (0.3,   0.6),
    "sdnn":                    (45.0,  20.0),
    "rmssd":                   (35.0,  20.0),
}


def normalise_feature(name: str, value: float) -> float:
    mean, std = NORM_PARAMS.get(name, (0.0, 1.0))
    return (value - mean) / max(std, 1e-8)


def normalise_vector(features: np.ndarray,
                     names: list[str]) -> np.ndarray:
    out = np.empty_like(features)
    for i, name in enumerate(names):
        out[i] = normalise_feature(name, features[i])
    return out


# ═══════════════════════════════════════════════════════════════════
# Label encoding
# ═══════════════════════════════════════════════════════════════════

CLASSES = ["REST", "STRESSED", "EXCITED", "DEPRESSIVE_ISOLATION", "ANXIOUS_PACING"]
N_CLASSES = len(CLASSES)

CLASS_TO_IDX = {c: i for i, c in enumerate(CLASSES)}
IDX_TO_CLASS = {i: c for i, c in enumerate(CLASSES)}
