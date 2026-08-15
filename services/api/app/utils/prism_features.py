"""
PRISM 57-feature pipeline.

Single source of truth for the ordered feature schema expected by:
  - prism_scaler.joblib          (StandardScaler, n_features_in_=57)
  - prism_classifier_model.joblib (RandomForestClassifier, n_features_in_=57, classes=[0,1,2])
  - prism_regressor_model.joblib  (RandomForestRegressor,  n_features_in_=57)

This module must NEVER call fit() on the scaler during inference.
The scaler is loaded already-trained; we only call scaler.transform().
"""

from __future__ import annotations

import json as _json
import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

import numpy as np
from sqlalchemy.orm import Session

from app import models
from app.utils.crypto import decrypt_field

logger = logging.getLogger(__name__)


# ── Schema constants ─────────────────────────────────────────────────────────


#: Ordered feature schema. The exact order is mandatory because the scaler was
#: fit on these columns in this order. Reordering or renaming a feature will
#: silently corrupt inference. Tests assert this constant stays stable.
FEATURE_NAMES: Tuple[str, ...] = (
    # ── 1..7  Daily snapshot ───────────────────────────────────────────────
    "Day_of_Week",
    "Sleep_Score",
    "Steps_Count",
    "Screen_Time_Hours",
    "Typing_Speed_WPM",
    "Pulse_Rate_BPM",
    "Unique_POIs",
    # App activity (8 features) — bucketed into the named apps in the order
    # documented in the artifacts. Unknown apps do not feed the model.
    "App_Activity_Chrome",
    "App_Activity_Figma",
    "App_Activity_Instagram",
    "App_Activity_Slack",
    "App_Activity_Spotify",
    "App_Activity_Terminal",
    "App_Activity_TikTok",
    "App_Activity_VS Code",  # note: literal "VS Code" with the space — matches the artifact
    "App_Activity_YouTube",
    # ── 17..18 Cyclical day-of-week encoding ──────────────────────────────
    "sin_Day_of_Week",
    "cos_Day_of_Week",
    # ── 19..24 Sleep_Score rolling stats ────────────────────────────────────
    "Sleep_Score_3d_mean",
    "Sleep_Score_7d_mean",
    "Sleep_Score_14d_mean",
    "Sleep_Score_7d_std",
    "Sleep_Score_14d_std",
    "Sleep_Score_dev_from_7d",
    # ── 25..30 Steps_Count rolling stats ────────────────────────────────────
    "Steps_Count_3d_mean",
    "Steps_Count_7d_mean",
    "Steps_Count_14d_mean",
    "Steps_Count_7d_std",
    "Steps_Count_14d_std",
    "Steps_Count_dev_from_7d",
    # ── 31..36 Screen_Time_Hours rolling stats ─────────────────────────────
    "Screen_Time_Hours_3d_mean",
    "Screen_Time_Hours_7d_mean",
    "Screen_Time_Hours_14d_mean",
    "Screen_Time_Hours_7d_std",
    "Screen_Time_Hours_14d_std",
    "Screen_Time_Hours_dev_from_7d",
    # ── 37..42 Typing_Speed_WPM rolling stats ──────────────────────────────
    "Typing_Speed_WPM_3d_mean",
    "Typing_Speed_WPM_7d_mean",
    "Typing_Speed_WPM_14d_mean",
    "Typing_Speed_WPM_7d_std",
    "Typing_Speed_WPM_14d_std",
    "Typing_Speed_WPM_dev_from_7d",
    # ── 43..48 Pulse_Rate_BPM rolling stats ────────────────────────────────
    "Pulse_Rate_BPM_3d_mean",
    "Pulse_Rate_BPM_7d_mean",
    "Pulse_Rate_BPM_14d_mean",
    "Pulse_Rate_BPM_7d_std",
    "Pulse_Rate_BPM_14d_std",
    "Pulse_Rate_BPM_dev_from_7d",
    # ── 49..54 Audio features (NaN-safe; optional) ────────────────────────
    "Audio_Stress_Score",
    "Vocal_Pitch_Variance",
    "Speech_Pause_Ratio",
    "RMS_Energy",
    "Spectral_Centroid",
    "MFCC_Mean",
    # ── 55..57 Facial features (NaN-safe; optional) ──────────────────────
    "Facial_Valence_Score",
    "Selfie_Smile_Pct",
    "Eye_Fatigue_Index",
)

#: Snapshot metrics whose daily values come from raw events or baselines.
SNAPSHOT_METRICS: Tuple[str, ...] = (
    "Sleep_Score",
    "Steps_Count",
    "Screen_Time_Hours",
    "Typing_Speed_WPM",
    "Pulse_Rate_BPM",
)

#: App activity feature names — keep aligned with the schema. Any unknown
#: app name from ingestion is bucketed into "_other" and DOES NOT feed the
#: model (the 57 features enumerate these 8 explicitly).
APP_ACTIVITY_KEYS: Tuple[str, ...] = (
    "App_Activity_Chrome",
    "App_Activity_Figma",
    "App_Activity_Instagram",
    "App_Activity_Slack",
    "App_Activity_Spotify",
    "App_Activity_Terminal",
    "App_Activity_TikTok",
    "App_Activity_VS Code",
    "App_Activity_YouTube",
)

#: Mapping from the ingest `app` string to one of the 8 feature keys.
#: Conservative: only known names map; everything else falls into _other.
_APP_NAME_TO_KEY: Dict[str, str] = {
    "chrome": "App_Activity_Chrome",
    "google chrome": "App_Activity_Chrome",
    "figma": "App_Activity_Figma",
    "instagram": "App_Activity_Instagram",
    "slack": "App_Activity_Slack",
    "spotify": "App_Activity_Spotify",
    "terminal": "App_Activity_Terminal",
    "iterm2": "App_Activity_Terminal",
    "warp": "App_Activity_Terminal",
    "windows terminal": "App_Activity_Terminal",
    "tiktok": "App_Activity_TikTok",
    "vscode": "App_Activity_VS Code",
    "vs code": "App_Activity_VS Code",
    "code": "App_Activity_VS Code",
    "youtube": "App_Activity_YouTube",
}

#: Audio feature names — read from latest `voice` ingest if present.
AUDIO_FEATURE_KEYS: Tuple[str, ...] = (
    "Audio_Stress_Score",
    "Vocal_Pitch_Variance",
    "Speech_Pause_Ratio",
    "RMS_Energy",
    "Spectral_Centroid",
    "MFCC_Mean",
)

#: Facial feature names — read from latest `facial` ingest if present.
FACIAL_FEATURE_KEYS: Tuple[str, ...] = (
    "Facial_Valence_Score",
    "Selfie_Smile_Pct",
    "Eye_Fatigue_Index",
)

#: Number of features expected by every trained artifact.
EXPECTED_FEATURE_COUNT: int = 57

#: NaN sentinel — keeps the scaler's behavior well-defined when data is
#: missing rather than silently substituting zeros.
_NAN = float("nan")


# ── Result envelope ──────────────────────────────────────────────────────────


@dataclass(frozen=True)
class FeatureBuildResult:
    """Outcome of `build_feature_vector`."""

    values: np.ndarray
    feature_names: Tuple[str, ...]
    data_sufficiency: Dict[str, int] = field(default_factory=dict)
    feature_status: Dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.values.shape != (EXPECTED_FEATURE_COUNT,):
            raise PrismFeatureError(
                f"Feature vector shape {self.values.shape} != "
                f"({EXPECTED_FEATURE_COUNT},)"
            )
        if self.feature_names != FEATURE_NAMES:
            raise PrismFeatureError(
                "Feature name order diverged from FEATURE_NAMES — the schema "
                "lock has been broken. Compare prism_features.FEATURE_NAMES "
                "against the artifact training schema."
            )


class PrismFeatureError(RuntimeError):
    """Raised by the feature pipeline when the schema cannot be honored."""


# ── Public entry point ───────────────────────────────────────────────────────


def build_feature_vector(
    db: Session,
    device_id: str,
    *,
    as_of: Optional[datetime] = None,
) -> FeatureBuildResult:
    """
    Build the 57-feature vector for the given device, honoring the exact
    order in FEATURE_NAMES.

    Inputs are sourced from existing DB tables where possible:
      - Daily metrics  ← BaselineProfile (signal_type=sleep,steps,screen_time,typing,pulse)
                          and the latest RawSignalEvent rows
      - App activity   ← last 24h of RawSignalEvent(signal_type=app_usage)
      - Voice features  ← latest RawSignalEvent(signal_type=voice)
      - Facial features ← latest RawSignalEvent(signal_type=facial)

    Missing data is propagated as NaN and recorded in feature_status so the
    endpoint can return a `data_sufficiency` payload.
    """
    as_of = as_of or datetime.now(timezone.utc)

    # 1..7  Daily snapshot
    day_of_week = as_of.weekday()  # Monday = 0; consistent with Python conventions
    sleep_score = _latest_baseline_value(db, device_id, "sleep")
    steps_count = _latest_baseline_value(db, device_id, "steps")
    screen_time_hours = _latest_baseline_value(db, device_id, "screen_time")
    typing_speed_wpm = _latest_baseline_value(db, device_id, "typing")
    pulse_rate_bpm = _latest_baseline_value(db, device_id, "pulse")
    unique_pois = _latest_baseline_value(db, device_id, "locations_visited")

    # 8..15  App activity (8 features), bucketed from last 24h of app_usage events
    app_activity = {key: 0.0 for key in APP_ACTIVITY_KEYS}
    _accumulate_app_activity(db, device_id, app_activity)
    # The artifact schema treats the values as HOURS of usage.
    # Ingested app_usage events store "duration_minutes" → convert to hours.
    for key in app_activity:
        app_activity[key] = round(app_activity[key] / 60.0, 4)

    # 17..18  Cyclical day-of-week
    sin_dow, cos_dow = _cyclical_day_of_week(day_of_week)

    # 19..48  Rolling statistics (3d / 7d / 14d mean, 7d/14d std, dev_from_7d)
    rolling: Dict[str, float] = {}
    sufficiency: Dict[str, int] = {}
    # Map snapshot value per metric → used by *_dev_from_7d.
    snapshot_value: Dict[str, float] = {
        "Sleep_Score": sleep_score,
        "Steps_Count": steps_count,
        "Screen_Time_Hours": screen_time_hours,
        "Typing_Speed_WPM": typing_speed_wpm,
        "Pulse_Rate_BPM": pulse_rate_bpm,
    }
    for metric in SNAPSHOT_METRICS:
        recent = _recent_metric_values(db, device_id, metric, days=14, as_of=as_of)
        vals_3d = recent[-3:]
        vals_7d = recent[-7:]
        vals_14d = recent[-14:]
        m3 = _mean_or_nan(vals_3d)
        m7 = _mean_or_nan(vals_7d)
        m14 = _mean_or_nan(vals_14d)
        s7 = _nanstd(vals_7d)
        s14 = _nanstd(vals_14d)
        dev = _dev_from_mean(snapshot_value[metric], m7)
        rolling[f"{metric}_3d_mean"] = m3
        rolling[f"{metric}_7d_mean"] = m7
        rolling[f"{metric}_14d_mean"] = m14
        rolling[f"{metric}_7d_std"] = s7
        rolling[f"{metric}_14d_std"] = s14
        rolling[f"{metric}_dev_from_7d"] = dev
        sufficiency[f"rows_{metric}_14d"] = len(vals_14d)

    # 49..54  Audio — from latest voice event
    audio_features = _latest_event_features(
        db, device_id, signal_type="voice", keys=AUDIO_FEATURE_KEYS
    )

    # 55..57  Facial — from latest facial event
    facial_features = _latest_event_features(
        db, device_id, signal_type="facial", keys=FACIAL_FEATURE_KEYS
    )

    # Compose in the documented order. Every list entry is `(name, value)`.
    raw_values: List[Tuple[str, float]] = [
        ("Day_of_Week", float(day_of_week)),
        ("Sleep_Score", sleep_score),
        ("Steps_Count", steps_count),
        ("Screen_Time_Hours", screen_time_hours),
        ("Typing_Speed_WPM", typing_speed_wpm),
        ("Pulse_Rate_BPM", pulse_rate_bpm),
        ("Unique_POIs", unique_pois),
        ("App_Activity_Chrome", app_activity["App_Activity_Chrome"]),
        ("App_Activity_Figma", app_activity["App_Activity_Figma"]),
        ("App_Activity_Instagram", app_activity["App_Activity_Instagram"]),
        ("App_Activity_Slack", app_activity["App_Activity_Slack"]),
        ("App_Activity_Spotify", app_activity["App_Activity_Spotify"]),
        ("App_Activity_Terminal", app_activity["App_Activity_Terminal"]),
        ("App_Activity_TikTok", app_activity["App_Activity_TikTok"]),
        ("App_Activity_VS Code", app_activity["App_Activity_VS Code"]),
        ("App_Activity_YouTube", app_activity["App_Activity_YouTube"]),
        ("sin_Day_of_Week", sin_dow),
        ("cos_Day_of_Week", cos_dow),
        ("Sleep_Score_3d_mean", rolling["Sleep_Score_3d_mean"]),
        ("Sleep_Score_7d_mean", rolling["Sleep_Score_7d_mean"]),
        ("Sleep_Score_14d_mean", rolling["Sleep_Score_14d_mean"]),
        ("Sleep_Score_7d_std", rolling["Sleep_Score_7d_std"]),
        ("Sleep_Score_14d_std", rolling["Sleep_Score_14d_std"]),
        ("Sleep_Score_dev_from_7d", rolling["Sleep_Score_dev_from_7d"]),
        ("Steps_Count_3d_mean", rolling["Steps_Count_3d_mean"]),
        ("Steps_Count_7d_mean", rolling["Steps_Count_7d_mean"]),
        ("Steps_Count_14d_mean", rolling["Steps_Count_14d_mean"]),
        ("Steps_Count_7d_std", rolling["Steps_Count_7d_std"]),
        ("Steps_Count_14d_std", rolling["Steps_Count_14d_std"]),
        ("Steps_Count_dev_from_7d", rolling["Steps_Count_dev_from_7d"]),
        ("Screen_Time_Hours_3d_mean", rolling["Screen_Time_Hours_3d_mean"]),
        ("Screen_Time_Hours_7d_mean", rolling["Screen_Time_Hours_7d_mean"]),
        ("Screen_Time_Hours_14d_mean", rolling["Screen_Time_Hours_14d_mean"]),
        ("Screen_Time_Hours_7d_std", rolling["Screen_Time_Hours_7d_std"]),
        ("Screen_Time_Hours_14d_std", rolling["Screen_Time_Hours_14d_std"]),
        ("Screen_Time_Hours_dev_from_7d", rolling["Screen_Time_Hours_dev_from_7d"]),
        ("Typing_Speed_WPM_3d_mean", rolling["Typing_Speed_WPM_3d_mean"]),
        ("Typing_Speed_WPM_7d_mean", rolling["Typing_Speed_WPM_7d_mean"]),
        ("Typing_Speed_WPM_14d_mean", rolling["Typing_Speed_WPM_14d_mean"]),
        ("Typing_Speed_WPM_7d_std", rolling["Typing_Speed_WPM_7d_std"]),
        ("Typing_Speed_WPM_14d_std", rolling["Typing_Speed_WPM_14d_std"]),
        ("Typing_Speed_WPM_dev_from_7d", rolling["Typing_Speed_WPM_dev_from_7d"]),
        ("Pulse_Rate_BPM_3d_mean", rolling["Pulse_Rate_BPM_3d_mean"]),
        ("Pulse_Rate_BPM_7d_mean", rolling["Pulse_Rate_BPM_7d_mean"]),
        ("Pulse_Rate_BPM_14d_mean", rolling["Pulse_Rate_BPM_14d_mean"]),
        ("Pulse_Rate_BPM_7d_std", rolling["Pulse_Rate_BPM_7d_std"]),
        ("Pulse_Rate_BPM_14d_std", rolling["Pulse_Rate_BPM_14d_std"]),
        ("Pulse_Rate_BPM_dev_from_7d", rolling["Pulse_Rate_BPM_dev_from_7d"]),
        ("Audio_Stress_Score", audio_features.get("Audio_Stress_Score", _NAN)),
        ("Vocal_Pitch_Variance", audio_features.get("Vocal_Pitch_Variance", _NAN)),
        ("Speech_Pause_Ratio", audio_features.get("Speech_Pause_Ratio", _NAN)),
        ("RMS_Energy", audio_features.get("RMS_Energy", _NAN)),
        ("Spectral_Centroid", audio_features.get("Spectral_Centroid", _NAN)),
        ("MFCC_Mean", audio_features.get("MFCC_Mean", _NAN)),
        ("Facial_Valence_Score", facial_features.get("Facial_Valence_Score", _NAN)),
        ("Selfie_Smile_Pct", facial_features.get("Selfie_Smile_Pct", _NAN)),
        ("Eye_Fatigue_Index", facial_features.get("Eye_Fatigue_Index", _NAN)),
    ]

    feature_status: Dict[str, str] = {}
    feature_names_out: List[str] = []
    feature_values: List[float] = []

    for name, value in raw_values:
        feature_names_out.append(name)
        feature_values.append(value)
        feature_status[name] = "ok" if _is_present(value) else "missing"

    # Validate order BEFORE returning so callers can rely on the lock.
    if tuple(feature_names_out) != FEATURE_NAMES:
        raise PrismFeatureError(
            "Computed feature order diverged from FEATURE_NAMES — "
            "schema lock violated."
        )

    arr = np.asarray(feature_values, dtype=np.float64).reshape(EXPECTED_FEATURE_COUNT)
    return FeatureBuildResult(
        values=arr,
        feature_names=FEATURE_NAMES,
        data_sufficiency=sufficiency,
        feature_status=feature_status,
    )


# ── Internal helpers (single-source-of-truth policy) ───────────────────────


def _latest_baseline_value(db: Session, device_id: str, signal_type: str) -> float:
    """
    Pull the most recent BaselineProfile value for a signal_type. Returns
    `rolling_mean` if present; missing → NaN. Single-source-of-truth for
    the "current snapshot" of a metric.
    """
    baseline = (
        db.query(models.BaselineProfile)
        .filter(
            models.BaselineProfile.device_id == device_id,
            models.BaselineProfile.signal_type == signal_type,
        )
        .order_by(models.BaselineProfile.updated_at.desc())
        .first()
    )
    if baseline is None:
        return _NAN
    return float(baseline.rolling_mean) if baseline.rolling_mean is not None else _NAN


def _recent_metric_values(
    db: Session,
    device_id: str,
    signal_type: str,
    *,
    days: int,
    as_of: datetime,
) -> List[float]:
    """
    Return up to `days` of recent metric values for the device, oldest-first.
    Strategy:
      1. Try BaselineProfile history for the metric (each row carries a
         timestamp via `updated_at`, and the value lives in `rolling_mean`).
      2. If no baselines exist, fall back to per-day aggregates of
         RawSignalEvent.metadata_json for that signal_type.
    """
    cutoff = as_of - timedelta(days=days)
    rows = (
        db.query(models.BaselineProfile)
        .filter(
            models.BaselineProfile.device_id == device_id,
            models.BaselineProfile.signal_type == signal_type,
            models.BaselineProfile.updated_at >= cutoff,
        )
        .order_by(models.BaselineProfile.updated_at.asc())
        .all()
    )
    values: List[float] = []
    if rows:
        for row in rows:
            if row.rolling_mean is not None:
                values.append(float(row.rolling_mean))
    else:
        events = (
            db.query(models.RawSignalEvent)
            .filter(
                models.RawSignalEvent.device_id == device_id,
                models.RawSignalEvent.signal_type == signal_type,
                models.RawSignalEvent.timestamp >= cutoff,
            )
            .order_by(models.RawSignalEvent.timestamp.asc())
            .all()
        )
        per_day: Dict[str, List[float]] = {}
        for ev in events:
            try:
                meta = _json.loads(decrypt_field(ev.encrypted_metadata))
            except Exception:
                continue
            if not isinstance(meta, dict):
                continue
            v = meta.get("value", meta.get(signal_type))
            if isinstance(v, (int, float)) and not _is_nan(v):
                day = ev.timestamp.date().isoformat()
                per_day.setdefault(day, []).append(float(v))
        for day in sorted(per_day):
            values.append(sum(per_day[day]) / len(per_day[day]))
    return values


def _accumulate_app_activity(
    db: Session,
    device_id: str,
    bucket: Dict[str, float],
) -> None:
    """Sum app usage durations from the last 24h of app_usage events."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    events = (
        db.query(models.RawSignalEvent)
        .filter(
            models.RawSignalEvent.device_id == device_id,
            models.RawSignalEvent.signal_type == "app_usage",
            models.RawSignalEvent.timestamp >= cutoff,
        )
        .all()
    )
    for ev in events:
        try:
            meta = _json.loads(decrypt_field(ev.encrypted_metadata))
        except Exception:
            continue
        if not isinstance(meta, dict):
            continue
        app_name = str(meta.get("app", "")).strip().lower()
        duration = float(meta.get("duration_minutes", 0.0) or 0.0)
        key = _APP_NAME_TO_KEY.get(app_name)
        if key and key in bucket:
            bucket[key] += duration


def _latest_event_features(
    db: Session,
    device_id: str,
    *,
    signal_type: str,
    keys: Tuple[str, ...],
) -> Dict[str, float]:
    """
    Read the most recent event of a given signal_type and return any of the
    requested keys present in its metadata. Missing keys are absent from the
    returned dict, so callers can default to NaN.
    """
    event = (
        db.query(models.RawSignalEvent)
        .filter(
            models.RawSignalEvent.device_id == device_id,
            models.RawSignalEvent.signal_type == signal_type,
        )
        .order_by(models.RawSignalEvent.timestamp.desc())
        .first()
    )
    if event is None:
        return {}
    try:
        meta = _json.loads(decrypt_field(event.encrypted_metadata))
    except Exception:
        return {}
    if not isinstance(meta, dict):
        return {}
    out: Dict[str, float] = {}
    for key in keys:
        if key in meta:
            v = meta[key]
            if isinstance(v, (int, float)) and not _is_nan(v):
                out[key] = float(v)
    return out


def _mean_or_nan(values: List[float]) -> float:
    """NaN-safe arithmetic mean. Returns NaN when fewer than 3 values are
    available — that threshold is the same for every metric and lives here."""
    finite = [v for v in values if not _is_nan(v)]
    if len(finite) < 3:
        return _NAN
    return float(np.mean(finite))


def _nanstd(values: List[float]) -> float:
    """NaN-safe population standard deviation."""
    finite = [v for v in values if not _is_nan(v)]
    if len(finite) < 3:
        return _NAN
    return float(np.std(finite, ddof=0))


def _dev_from_mean(current: float, mean: float) -> float:
    """current − mean, both NaN-safe."""
    if _is_nan(current) or _is_nan(mean):
        return _NAN
    return float(current - mean)


def _cyclical_day_of_week(day_of_week: int) -> Tuple[float, float]:
    """Standard 7-period cyclical encoding. day_of_week ∈ [0, 6] (Mon=0)."""
    angle = 2.0 * math.pi * (day_of_week / 7.0)
    return math.sin(angle), math.cos(angle)


def _is_present(value: float) -> bool:
    """NaN-aware presence check. None and ±∞ are also treated as missing."""
    if value is None:
        return False
    try:
        f = float(value)
    except (TypeError, ValueError):
        return False
    return not (math.isnan(f) or math.isinf(f))


def _is_nan(value: float) -> bool:
    try:
        return math.isnan(float(value))
    except (TypeError, ValueError):
        return False
