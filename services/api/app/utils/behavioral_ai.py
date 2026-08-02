"""
Behavioral AI Model — unobtrusive mental-wellbeing screening from typing.

This module implements the "Module 3" Behavioral AI pipeline:

  Signal-level models (per typing telemetry event):
    - RandomForest classifier → Stress Score
    - RandomForest classifier → Cognitive Load
    - RandomForest classifier → Typing Fatigue
    - IsolationForest anomaly detector → Typing Stability

  Trend model (rolling window over recent scores):
    - Gradient-boosted ensemble (sklearn HistGradientBoostingClassifier)
      → Possible Anxiety Trend, Possible Depression Trend
    - Weighted ensemble → Mental Risk Score + Confidence

Every output is EXPLAINABLE (AGENTS.md: no black-box outputs). Each score
ships human-readable "contributing factors" strings.

Screening, NOT diagnosis: per the paper framing, these outputs indicate the
system has detected behavioral patterns that may warrant attention — never a
diagnosis of a mental illness. The disclaimer is surfaced alongside every
score.

Model artifacts live in app/resources/behavioral_ai/ and are loaded lazily.
If the artifacts are missing (fresh clone, CI), the module falls back to the
same statistical/heuristic logic used by the rest of the risk engine so the
pipeline never crashes — matching the "graceful degradation" pattern of the
vision modules on the edge node.
"""
import json
import logging
import os
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

RESOURCES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "resources")
MODELS_DIR = os.path.join(RESOURCES_DIR, "behavioral_ai")

# Output dimensions (see module docstring). Order must match the training script.
SIGNAL_DIMENSIONS = ["stress", "cognitive_load", "typing_fatigue", "typing_stability"]
TREND_DIMENSIONS = ["anxiety_trend", "depression_trend"]

# Human-readable labels used in contributing factors.
DIMENSION_LABELS = {
    "stress": "Stress",
    "cognitive_load": "Cognitive load",
    "typing_fatigue": "Typing fatigue",
    "typing_stability": "Typing stability",
    "anxiety_trend": "Possible anxiety trend",
    "depression_trend": "Possible depression trend",
}

SCREENING_DISCLAIMER = (
    "This is a behavioral screening signal, not a diagnosis. It indicates the "
    "system has detected patterns that may warrant attention. Only a qualified "
    "clinician can assess a mental-health condition."
)

# Signal features the models consume, in fixed order (matches training script).
SIGNAL_FEATURES = [
    "delay_index",
    "iki_mean",
    "iki_std",
    "correction_rate_variance",
    "burst_length",
    "typing_speed",
    "error_rate",
    "session_duration",
    "hour_of_day",
]

# Names of models shipped with the repo (trained by scripts/train_behavioral_ai.py).
_MODEL_FILES = {
    "stress": "stress_rf.joblib",
    "cognitive_load": "cognitive_load_rf.joblib",
    "typing_fatigue": "typing_fatigue_rf.joblib",
    "typing_stability": "typing_stability_if.joblib",
    "anxiety_trend": "anxiety_trend_model.joblib",
    "depression_trend": "depression_trend_model.joblib",
    "mental_risk": "mental_risk_ensemble.joblib",
}


# ─── Feature extraction ─────────────────────────────────────────────────────


def _num(metadata: dict, key: str, default: float = 0.0) -> float:
    try:
        return float(metadata.get(key, default))
    except (TypeError, ValueError):
        return default


def extract_signal_features(metadata: dict) -> np.ndarray:
    """Builds the fixed-order feature vector for a single typing event."""
    return np.array(
        [
            _num(metadata, "delay_index", 1.0),
            _num(metadata, "iki_mean", 300.0),
            _num(metadata, "iki_std", 60.0),
            _num(metadata, "correction_rate_variance", 0.05),
            _num(metadata, "burst_length", 12.0),
            _num(metadata, "typing_speed", 40.0),
            _num(metadata, "error_rate", 0.05),
            _num(metadata, "session_duration", 120.0),
            _num(metadata, "hour_of_day", 14.0),
        ]
    ).reshape(1, -1)


# ─── Model loading (lazy, graceful degradation) ────────────────────────────


class _ModelRegistry:
    """Lazily loads trained .joblib artifacts; None when unavailable."""

    def __init__(self):
        self._cache: dict = {}

    def get(self, key: str):
        if key in self._cache:
            return self._cache[key]
        filename = _MODEL_FILES.get(key)
        if not filename:
            self._cache[key] = None
            return None
        path = os.path.join(MODELS_DIR, filename)
        if not os.path.exists(path):
            self._cache[key] = None
            return None
        try:
            import joblib

            model = joblib.load(path)
            self._cache[key] = model
            return model
        except Exception as e:
            logger.warning("Failed to load behavioral AI model %s: %s", key, str(e))
            self._cache[key] = None
            return None


_models = _ModelRegistry()


# ─── Fallback heuristics (no artifacts / cold start) ───────────────────────


def _fallback_signal_scores(metadata: dict) -> dict:
    """
    Deterministic statistical fallback used when trained artifacts are absent.
    Mirrors the typing_rhythm z-score logic already in the risk engine so a
    fresh install still gets guarded behavior.
    """
    delay_index = _num(metadata, "delay_index", 1.0)
    correction_var = _num(metadata, "correction_rate_variance", 0.0)
    iki_std = _num(metadata, "iki_std", 0.0)
    error_rate = _num(metadata, "error_rate", 0.0)

    stress = min(1.0, max(0.0, (delay_index - 1.0) * 2.0 + correction_var * 4.0))
    cognitive_load = min(1.0, max(0.0, (delay_index - 1.0) * 1.5 + error_rate * 3.0))
    typing_fatigue = min(
        1.0, max(0.0, (iki_std / 200.0) + max(0.0, error_rate - 0.05) * 5.0)
    )
    stability_anomaly = min(1.0, max(0.0, (iki_std / 300.0)))

    return {
        "stress": round(stress, 3),
        "cognitive_load": round(cognitive_load, 3),
        "typing_fatigue": round(typing_fatigue, 3),
        "typing_stability": round(1.0 - stability_anomaly, 3),  # stability = inverse anomaly
    }


# ─── Public API ────────────────────────────────────────────────────────────


def evaluate_signal(metadata: dict) -> dict:
    """
    Runs all four signal-level models on one typing event.

    Returns {dimension: {score, flagged, threshold, factors}} where scores are
    0..1 (higher = more attention-worthy) and factors are human-readable.
    """
    features = extract_signal_features(metadata)
    fallback = _fallback_signal_scores(metadata)
    results = {}

    # Classifier dimensions: predict_proba[:, 1] → risk probability.
    for dim, threshold in (("stress", 0.6), ("cognitive_load", 0.6), ("typing_fatigue", 0.6)):
        model = _models.get(dim)
        if model is not None:
            try:
                prob = float(model.predict_proba(features)[0][1])
                score = round(max(0.0, min(1.0, prob)), 3)
            except Exception as e:
                logger.warning("Behavioral model %s inference failed: %s", dim, str(e))
                score = fallback[dim]
        else:
            score = fallback[dim]

        flagged = score >= threshold
        label = DIMENSION_LABELS[dim]
        factors = []
        if flagged:
            driver = _primary_driver(metadata, dim)
            factors.append(
                f"{label} signal elevated ({score:.0%}) — {driver}. "
                "Behavioral screening only, not a diagnosis."
            )
        results[dim] = {
            "score": score,
            "flagged": flagged,
            "threshold": threshold,
            "factors": factors,
        }

    # IsolationForest dimension: stability = inverse anomaly score, normalized.
    model = _models.get("typing_stability")
    if model is not None:
        try:
            # score_samples: higher = more "normal". The training script bakes
            # the healthy-distribution median into model.median_score_; we map
            # raw == median → risk 0.5, and raw << median (abnormal) → risk 1.
            raw = float(model.score_samples(features)[0])
            median = float(getattr(model, "median_score_", -0.46))
            risk = 1.0 / (1.0 + np.exp(-((median - raw) * 4.0)))
            risk = round(max(0.0, min(1.0, risk)), 3)
        except Exception as e:
            logger.warning("Behavioral model typing_stability inference failed: %s", str(e))
            risk = 1.0 - fallback["typing_stability"]
    else:
        risk = 1.0 - fallback["typing_stability"]

    stability_score = round(1.0 - risk, 3)  # higher = more stable
    flagged = risk >= 0.6
    factors = []
    if flagged:
        factors.append(
            f"Typing stability dropped to {stability_score:.0%} — inter-key timing "
            "variability is elevated. Behavioral screening only, not a diagnosis."
        )
    results["typing_stability"] = {
        "score": stability_score,
        "flagged": flagged,
        "threshold": 0.6,
        "factors": factors,
    }

    return results


def evaluate_trend(recent_scores: list[dict]) -> dict:
    """
    Runs the trend model over a rolling window of recent signal scores.

    recent_scores: list of {stress, cognitive_load, typing_fatigue,
    typing_stability} dicts (newest last). Returns anxiety/depression trend
    scores, an overall Mental Risk Score, and confidence.
    """
    if not recent_scores:
        return {
            "anxiety_trend": 0.0,
            "depression_trend": 0.0,
            "mental_risk_score": 0.0,
            "confidence": 0.0,
            "flagged": False,
            "factors": [],
        }

    # Feature vector: mean + std + slope over the window for each dimension.
    arr = np.array(
        [
            [s.get("stress", 0.0), s.get("cognitive_load", 0.0),
             s.get("typing_fatigue", 0.0), s.get("typing_stability", 0.0)]
            for s in recent_scores
        ]
    )
    if len(arr) == 1:
        arr = np.vstack([arr, arr])

    means = arr.mean(axis=0)
    stds = arr.std(axis=0)
    # Slope: linear regression coefficient via least squares.
    x = np.arange(len(arr), dtype=float)
    slopes = np.array([
        np.polyfit(x, arr[:, i], 1)[0] if np.std(arr[:, i]) > 0 else 0.0
        for i in range(arr.shape[1])
    ])
    features = np.concatenate([means, stds, slopes]).reshape(1, -1)

    # Try the trained trend models; fall back to a transparent weighted rule.
    anxiety = _trend_from_model("anxiety_trend", features, _fallback_trend(means, slopes, "anxiety"))
    depression = _trend_from_model("depression_trend", features, _fallback_trend(means, slopes, "depression"))

    # Mental Risk Score: weighted ensemble (matches training script weights).
    # means = [stress, cognitive_load, fatigue, stability]; use instability.
    weights = np.array([0.30, 0.25, 0.20, 0.25])
    instability = 1.0 - means[3]
    composite = float(np.dot(means[:3], weights[:3]) + weights[3] * instability)
    risk_model = _models.get("mental_risk")
    if risk_model is not None:
        try:
            prob = float(risk_model.predict_proba(features)[0][1])
            # Blend learned ensemble with the interpretable weighted rule.
            mental_risk = round(0.7 * prob + 0.3 * composite, 3)
        except Exception as e:
            logger.warning("Mental risk model inference failed: %s", str(e))
            mental_risk = round(composite, 3)
    else:
        mental_risk = round(composite, 3)

    confidence = round(min(0.95, 0.5 + 0.1 * len(recent_scores)), 3)
    flagged = mental_risk >= 0.6

    factors = []
    if flagged:
        # Rank the four signal dimensions by their risk contribution.
        order = ["stress", "cognitive_load", "typing_fatigue", "typing_stability"]
        contrib = {
            "stress": means[0],
            "cognitive_load": means[1],
            "typing_fatigue": means[2],
            "typing_stability": 1.0 - means[3],
        }
        top = sorted(order, key=lambda k: contrib[k], reverse=True)[:2]
        labels = []
        for k in top:
            labels.append(
                f"reduced {DIMENSION_LABELS[k].lower()}"
                if k == "typing_stability"
                else f"elevated {DIMENSION_LABELS[k].lower()}"
            )
        factors.append(
            f"Behavioral pattern consistent across {len(recent_scores)} recent typing "
            f"sessions: {', '.join(labels)}. "
            f"Mental risk score {mental_risk:.0%} (confidence {confidence:.0%})."
        )
        factors.append(SCREENING_DISCLAIMER)

    return {
        "anxiety_trend": round(anxiety, 3),
        "depression_trend": round(depression, 3),
        "mental_risk_score": mental_risk,
        "confidence": confidence,
        "flagged": flagged,
        "factors": factors,
    }


def _trend_from_model(model_key: str, features: np.ndarray, fallback: float) -> float:
    model = _models.get(model_key)
    if model is not None:
        try:
            return float(model.predict_proba(features)[0][1])
        except Exception as e:
            logger.warning("Trend model %s inference failed: %s", model_key, str(e))
    return fallback


def _fallback_trend(means: np.ndarray, slopes: np.ndarray, kind: str) -> float:
    """
    Transparent rule used when trend artifacts are absent.
    anxiety: rising stress/cognitive load slope.
    depression: sustained fatigue + falling stability, slower cadence.
    """
    if kind == "anxiety":
        val = 0.5 * means[0] + 0.3 * means[1] + 0.2 * max(0.0, slopes[0])
    else:
        val = 0.5 * means[2] + 0.3 * (1.0 - means[3]) + 0.2 * max(0.0, -slopes[3])
    return max(0.0, min(1.0, val))


def _primary_driver(metadata: dict, dim: str) -> str:
    """Picks a human-readable driver for a flagged dimension."""
    delay_index = _num(metadata, "delay_index", 1.0)
    iki_std = _num(metadata, "iki_std", 0.0)
    correction_var = _num(metadata, "correction_rate_variance", 0.0)
    error_rate = _num(metadata, "error_rate", 0.0)
    burst_length = _num(metadata, "burst_length", 0.0)

    if dim == "stress" and correction_var > 0.1:
        return "elevated correction/hesitation rate while typing"
    if dim == "cognitive_load" and error_rate > 0.1:
        return "rising error rate alongside slower inter-key timing"
    if dim == "typing_fatigue" and iki_std > 120:
        return "highly variable inter-key intervals (irregular cadence)"
    if delay_index > 1.2:
        return "slower keystroke cadence than the device baseline"
    if burst_length > 30:
        return "long typing bursts with pauses suggesting fatigue"
    return "deviation in typing dynamics vs. personal baseline"
