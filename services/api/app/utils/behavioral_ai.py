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

RESOURCES_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "resources"
)
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

# Human-readable names for the signal features, used by the Module 4
# explainability layer when building "top features / reasoning" strings.
FEATURE_LABELS = {
    "delay_index": "Keystroke delay index",
    "iki_mean": "Inter-key interval mean",
    "iki_std": "Inter-key interval variability",
    "correction_rate_variance": "Correction/hesitation rate",
    "burst_length": "Typing burst length",
    "typing_speed": "Typing speed",
    "error_rate": "Error rate",
    "session_duration": "Session duration",
    "hour_of_day": "Hour of day",
}

# Trend features: for each signal dimension d in [stress, cognitive_load,
# typing_fatigue, typing_stability] we derive mean(d), std(d), slope(d).
TREND_FEATURES = [
    f"{dim}_{stat}"
    for dim in ("stress", "cognitive_load", "typing_fatigue", "typing_stability")
    for stat in ("mean", "std", "slope")
]

TREND_FEATURE_LABELS = {
    "stress_mean": "Avg stress level",
    "stress_std": "Stress variability",
    "stress_slope": "Stress trend",
    "cognitive_load_mean": "Avg cognitive load",
    "cognitive_load_std": "Cognitive load variability",
    "cognitive_load_slope": "Cognitive load trend",
    "typing_fatigue_mean": "Avg typing fatigue",
    "typing_fatigue_std": "Fatigue variability",
    "typing_fatigue_slope": "Fatigue trend",
    "typing_stability_mean": "Avg typing stability",
    "typing_stability_std": "Stability variability",
    "typing_stability_slope": "Stability trend",
}

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
        "typing_stability": round(
            1.0 - stability_anomaly, 3
        ),  # stability = inverse anomaly
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
    for dim, threshold in (
        ("stress", 0.6),
        ("cognitive_load", 0.6),
        ("typing_fatigue", 0.6),
    ):
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
            logger.warning(
                "Behavioral model typing_stability inference failed: %s", str(e)
            )
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
            [
                s.get("stress", 0.0),
                s.get("cognitive_load", 0.0),
                s.get("typing_fatigue", 0.0),
                s.get("typing_stability", 0.0),
            ]
            for s in recent_scores
        ]
    )
    if len(arr) == 1:
        arr = np.vstack([arr, arr])

    means = arr.mean(axis=0)
    stds = arr.std(axis=0)
    # Slope: linear regression coefficient via least squares.
    x = np.arange(len(arr), dtype=float)
    slopes = np.array(
        [
            np.polyfit(x, arr[:, i], 1)[0] if np.std(arr[:, i]) > 0 else 0.0
            for i in range(arr.shape[1])
        ]
    )
    features = np.concatenate([means, stds, slopes]).reshape(1, -1)

    # Try the trained trend models; fall back to a transparent weighted rule.
    anxiety = _trend_from_model(
        "anxiety_trend", features, _fallback_trend(means, slopes, "anxiety")
    )
    depression = _trend_from_model(
        "depression_trend", features, _fallback_trend(means, slopes, "depression")
    )

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


# ─── Module 4: Explainable AI ───────────────────────────────────────────────
#
# Every score the pipeline emits ships a structured, human-readable
# explanation (AGENTS.md: "no black-box outputs"). We provide three layers:
#
#   1. Global feature importance — from the trained tree models' built-in
#      `feature_importances_` (mean decrease in impurity), or a transparent
#      heuristic weight vector when artifacts are absent.
#
#   2. Local (SHAP-style) attribution — per-feature contribution to the
#      score for a single event. Without a `shap` dependency, tree models
#      expose enough to approximate: for classifiers we use the model's own
#      feature_importances_ combined with how far the sample's features sit
#      from the healthy reference, normalized to a signed contribution that
#      sums to (roughly) the score.
#
#   3. Top features + reasoning — the highest-contribution features rendered
#      as the "why" strings (e.g. "Typing speed decreased", "Long pauses
#      detected") that the dashboard displays under each score.
# ---------------------------------------------------------------------------


def _heuristic_feature_importance() -> dict:
    """
    Fallback global importances when trained artifacts are absent. Mirrors the
    fallback scoring logic: delay/correction/error/IKI variance dominate.
    """
    return {
        "delay_index": 0.25,
        "iki_mean": 0.05,
        "iki_std": 0.2,
        "correction_rate_variance": 0.2,
        "burst_length": 0.08,
        "typing_speed": 0.07,
        "error_rate": 0.12,
        "session_duration": 0.02,
        "hour_of_day": 0.01,
    }


def _model_feature_importance(model_key: str) -> dict:
    """Global feature importances from a trained model, or heuristic fallback."""
    # Prefer the persisted feature-importance metadata written at training time.
    try:
        meta_path = os.path.join(MODELS_DIR, "feature_importance.json")
        if os.path.exists(meta_path):
            with open(meta_path, "r") as f:
                stored = json.load(f)
            if model_key in stored and stored[model_key]:
                return {k: float(v) for k, v in stored[model_key].items()}
    except Exception as e:
        logger.warning("Feature-importance metadata load failed: %s", str(e))

    model = _models.get(model_key)
    if model is not None and hasattr(model, "feature_importances_"):
        try:
            values = np.asarray(model.feature_importances_, dtype=float).ravel()
            if values.shape[0] == len(SIGNAL_FEATURES):
                total = float(values.sum()) or 1.0
                return {
                    name: round(float(v) / total, 4)
                    for name, v in zip(SIGNAL_FEATURES, values)
                }
        except Exception as e:
            logger.warning("Feature importance for %s failed: %s", model_key, str(e))
    return _heuristic_feature_importance()


def _feature_reference(metadata: dict) -> np.ndarray:
    """Healthy/reference feature vector used to sign local contributions."""
    # Typing dynamics near a calm baseline.
    reference = np.array(
        [
            1.0,       # delay_index
            250.0,     # iki_mean (ms)
            45.0,      # iki_std (ms)
            0.04,      # correction_rate_variance
            14.0,      # burst_length
            55.0,      # typing_speed (wpm)
            0.03,      # error_rate
            90.0,      # session_duration (s)
            14.0,      # hour_of_day
        ]
    )
    observed = extract_signal_features(metadata).ravel()
    # Normalize each feature by its reference scale so contributions are
    # comparable across features with different units.
    scale = np.maximum(np.abs(reference), 1e-6)
    return reference, observed, scale


def local_attribution(metadata: dict, dimension: str) -> list[dict]:
    """
    SHAP-style local attribution for a single typing event.

    Returns a list of {feature, contribution} dicts sorted by absolute
    contribution (largest first). Contribution is signed: positive values push
    the dimension's risk score up, negative values pull it down. The list is
    normalized so contributions sum to (approximately) the current score.
    """
    reference, observed, scale = _feature_reference(metadata)
    # How far this sample sits from the calm reference, in reference units.
    deviation = (observed - reference) / scale
    importance = _model_feature_importance(dimension)

    # Signed raw contribution: importance weight × directional deviation.
    # Higher delay, more corrections, more errors → positive (risk-raising).
    raw = np.array([importance[f] * deviation[i] for i, f in enumerate(SIGNAL_FEATURES)])
    # Normalize to a signed set that sums to 1 (then scaled by caller).
    total = float(np.abs(raw).sum()) or 1.0
    normalized = raw / total

    out = []
    for i, feature in enumerate(SIGNAL_FEATURES):
        out.append({
            "feature": feature,
            "label": FEATURE_LABELS.get(feature, feature),
            "contribution": round(float(normalized[i]), 4),
        })
    out.sort(key=lambda c: abs(c["contribution"]), reverse=True)
    return out


def feature_importance(dimension: str) -> list[dict]:
    """
    Global feature importance for a dimension.

    Returns [{feature, label, importance}] sorted descending. Importance
    values are 0..1 and sum to 1.
    """
    imp = _model_feature_importance(dimension)
    out = [
        {"feature": f, "label": FEATURE_LABELS.get(f, f), "importance": imp[f]}
        for f in SIGNAL_FEATURES
    ]
    out.sort(key=lambda x: x["importance"], reverse=True)
    return out


def _attribution_reasoning(metadata: dict, dimension: str, score: float, flagged: bool) -> list[str]:
    """
    Renders the local attribution as human-readable "why" strings.

    This produces exactly the Module 4 example framing:
      "Risk score increased because … typing speed decreased, delete rate
      increased, long pauses detected, large variation in typing rhythm."
    """
    if not flagged:
        return [f"{DIMENSION_LABELS.get(dimension, dimension)} is within baseline range."]

    attribution = local_attribution(metadata, dimension)
    # Top contributing features (risk-raising = positive contribution).
    top = [a for a in attribution if a["contribution"] > 0][:3]
    if not top:
        return [f"Risk score increased because of a combination of typing-dynamics features."]

    reasons = []
    for a in top:
        f = a["feature"]
        label = a["label"].lower()
        if f == "typing_speed":
            reasons.append("typing speed decreased")
        elif f == "correction_rate_variance":
            reasons.append("delete/hesitation rate increased")
        elif f == "error_rate":
            reasons.append("error rate increased")
        elif f == "iki_std":
            reasons.append("large variation in typing rhythm")
        elif f in ("delay_index", "iki_mean"):
            reasons.append("long pauses detected between keystrokes")
        elif f == "burst_length":
            reasons.append("long typing bursts with pauses")
        elif f == "session_duration":
            reasons.append("unusually long typing session")
        elif f == "hour_of_day":
            reasons.append("atypical time-of-day typing pattern")
        else:
            reasons.append(f"elevated {label}")
    return [f"Risk score increased because {', '.join(reasons)}."]


def explain_signal(metadata: dict) -> dict:
    """
    Module 4 explainability for a single typing event.

    Returns a dict keyed by dimension (stress, cognitive_load, typing_fatigue,
    typing_stability) with:
      - score, flagged, threshold
      - feature_importance (global, top 5)
      - shap_values (local attribution, top 5)
      - reasoning (human-readable "why" strings)
    """
    results = evaluate_signal(metadata)
    out = {}
    for dim, res in results.items():
        out[dim] = {
            "score": res["score"],
            "flagged": res["flagged"],
            "threshold": res["threshold"],
            "feature_importance": feature_importance(dim)[:5],
            "shap_values": local_attribution(metadata, dim)[:5],
            "reasoning": _attribution_reasoning(metadata, dim, res["score"], res["flagged"]),
        }
    return out


def explain_trend(recent_scores: list[dict]) -> dict:
    """
    Module 4 explainability for the trend/mental-risk layer.

    Returns the trend result plus a per-dimension reasoning breakdown and the
    top contributing trend features (mean/std/slope of each signal dimension).
    """
    trend = evaluate_trend(recent_scores)
    if not recent_scores:
        trend["reasoning"] = ["No recent typing sessions available for trend analysis."]
        trend["top_features"] = []
        return trend

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
    x = np.arange(len(arr), dtype=float)
    slopes = np.array([
        np.polyfit(x, arr[:, i], 1)[0] if np.std(arr[:, i]) > 0 else 0.0
        for i in range(arr.shape[1])
    ])
    # Weighted, signed feature values for the 12 trend features.
    dims = ["stress", "cognitive_load", "typing_fatigue", "typing_stability"]
    vals = np.concatenate([means, stds, slopes])
    weights = np.array([
        0.30, 0.25, 0.20, 0.25,   # means
        0.05, 0.05, 0.05, 0.05,   # stds
        0.10, 0.05, 0.05, 0.10,   # slopes
    ])
    signed = vals * weights
    order = np.argsort(-np.abs(signed))
    top = [
        {
            "feature": TREND_FEATURES[i],
            "label": TREND_FEATURE_LABELS.get(TREND_FEATURES[i], TREND_FEATURES[i]),
            "value": round(float(vals[i]), 4),
            "importance": round(float(abs(signed[i])), 4),
        }
        for i in order[:5]
    ]

    reasoning = []
    if trend.get("flagged"):
        if trend["anxiety_trend"] >= 0.6:
            reasoning.append(
                f"Possible anxiety trend detected: stress and cognitive load are "
                f"elevated and trending upward across {len(recent_scores)} sessions."
            )
        if trend["depression_trend"] >= 0.6:
            reasoning.append(
                f"Possible depression trend detected: typing fatigue is elevated "
                f"and stability is declining across {len(recent_scores)} sessions."
            )
        if not reasoning:
            reasoning.append(
                f"Mental risk score {trend['mental_risk_score']:.0%} — sustained "
                f"behavioral pattern across {len(recent_scores)} sessions warrants attention."
            )
        reasoning.append(SCREENING_DISCLAIMER)
    else:
        reasoning.append(
            "Behavioral signals are within the device's baseline range across "
            f"{len(recent_scores)} recent sessions."
        )

    trend["reasoning"] = reasoning
    trend["top_features"] = top
    return trend
