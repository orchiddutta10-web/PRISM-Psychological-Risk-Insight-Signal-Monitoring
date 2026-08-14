"""
Phase 10 — PRISM Multimodal ML Engine
======================================
Two-model architecture:
  1. Isolation Forest — unsupervised anomaly detection per subject
  2. Rule-Based Fusion Engine — weighted multimodal signal fusion

Produces: PRISM Insight Score (0–100) with interpretation labels and
          human-readable contributing factors.

CRITICAL: This is a RESEARCH PROTOTYPE. It is NOT a diagnostic tool.
Scores indicate unusual multimodal behavioural patterns only.
Human review is required before any intervention.
Fusion weights are illustrative and require empirical validation.
"""

import json
import logging
import math
import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)

# =========================================================================
# Constants — prototype demonstration values, NOT clinically validated
# =========================================================================

# Fusion weights (sum = 1.0)
WEIGHT_PHONE = 0.35  # behavioural metadata (mobility, app, typing)
WEIGHT_VISION = 0.25  # CV-derived features (blink, posture, presence)
WEIGHT_PHYSIO = 0.20  # wearable vitals (BPM, GSR, movement)
WEIGHT_AUDIO = 0.10  # acoustic features (speech rate, silence)
WEIGHT_RISK_REG = 0.10  # risk-registry hits (installed apps, keywords)

# Isolation Forest hyperparameters (prototype)
IF_N_ESTIMATORS = 150
IF_CONTAMINATION = 0.10
IF_MAX_SAMPLES = "auto"
IF_RANDOM_STATE = 42

# Feature vector dimensions
FEATURE_DIM = 16

# Subject window: how many days of history for baseline fitting
BASELINE_WINDOW_DAYS = 14

# Minimum windows required before fitting a per-subject model
MIN_WINDOWS_FOR_FIT = 5

# Insight score interpretation tiers
INSIGHT_TIERS = [
    (0, 30, "Baseline", "Behavioural metrics aligned with established patterns."),
    (
        31,
        60,
        "Behavioural change observed",
        "One or more modalities show deviation from personal baseline.",
    ),
    (
        61,
        80,
        "Multiple unusual signals",
        "Several independent behavioural and physiological signals deviate concurrently.",
    ),
    (
        81,
        100,
        "High-priority pattern",
        "A pronounced, multi-modal behavioural shift has been detected.",
    ),
]

# Modality names for contributing factors
MODALITY_LABELS = {
    "phone": "Phone Behaviour",
    "vision": "Visual Engagement",
    "physio": "Physiological Signals",
    "audio": "Vocal Patterns",
    "risk_reg": "Safety Registry",
}


# =========================================================================
# Data structures
# =========================================================================


@dataclass
class ModalityScores:
    phone: float = 0.0
    vision: float = 0.0
    physio: float = 0.0
    audio: float = 0.0
    risk_reg: float = 0.0

    def to_dict(self) -> dict:
        return {
            "phone": self.phone,
            "vision": self.vision,
            "physio": self.physio,
            "audio": self.audio,
            "risk_reg": self.risk_reg,
        }


@dataclass
class InsightResult:
    subject_id: str
    insight_score: float  # 0–100
    tier_label: str  # one of the four labels above
    tier_summary: str  # human-readable one-liner
    anomaly_score: float  # raw Isolation Forest score 0–1
    modality_scores: ModalityScores
    fusion_score: float  # pre-scaling fusion output
    contributing_factors: list = field(default_factory=list)
    confidence: float = 1.0

    def to_dict(self) -> dict:
        return {
            "subject_id": self.subject_id,
            "insight_score": round(self.insight_score, 1),
            "tier_label": self.tier_label,
            "tier_summary": self.tier_summary,
            "anomaly_score": round(self.anomaly_score, 4),
            "modality_scores": {
                k: round(v, 4) for k, v in self.modality_scores.to_dict().items()
            },
            "fusion_score": round(self.fusion_score, 4),
            "contributing_factors": self.contributing_factors,
            "confidence": round(self.confidence, 3),
        }


# =========================================================================
# Feature vector builder — aggregates raw DB tables into a 16-dim vector
# =========================================================================


class FeatureVectorBuilder:
    """
    Queries the Phase 8 simplified schema tables for the most recent
    behaviour window and surrounding raw events, then builds a 16-dimensional
    feature vector across all five modalities.

    Feature layout:
      [0]  total_active_mins      (BehaviourWindow)
      [1]  sleep_hours_proxy      (BehaviourWindow)
      [2]  avg_bpm                (SensorReading)
      [3]  bpm_std                (SensorReading)
      [4]  avg_g_force            (SensorReading)
      [5]  g_force_std            (SensorReading)
      [6]  avg_blink_rate_bpm     (VisionFeature)
      [7]  blink_rate_std         (VisionFeature)
      [8]  slouch_ratio           (VisionFeature)
      [9]  avg_speech_segments    (AudioFeature)
      [10] speech_segments_std    (AudioFeature)
      [11] avg_silence_ratio      (AudioFeature)
      [12] silence_ratio_std      (AudioFeature)
      [13] screen_on_count        (PhoneEvent)
      [14] unique_app_count       (PhoneEvent)
      [15] night_activity_ratio   (PhoneEvent: proportion 00:00–06:00)
    """

    def __init__(self, db):
        self.db = db
        # Lazy imports to avoid circular deps at module level
        from app import models as _m

        self._m = _m

    def build(self, subject_id: str) -> Optional[np.ndarray]:
        """
        Build a single feature vector for the most recent available window.
        Returns None if no data exists at all.
        """
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(days=BASELINE_WINDOW_DAYS)

        vec = np.full(FEATURE_DIM, np.nan, dtype=np.float64)

        # ── Behaviour Window ────────────────────────────────────
        bw = (
            self.db.query(self._m.BehaviorWindow)
            .filter(
                self._m.BehaviorWindow.subject_id == subject_id,
                self._m.BehaviorWindow.start_ts >= window_start,
            )
            .order_by(self._m.BehaviorWindow.start_ts.desc())
            .first()
        )
        if bw:
            vec[0] = float(bw.total_active_mins)
            vec[1] = float(bw.sleep_hours_proxy)

        # ── Sensor Readings (BPM, G-Force) ──────────────────────
        readings = (
            self.db.query(self._m.SensorReading)
            .filter(
                self._m.SensorReading.device_id == subject_id,
                self._m.SensorReading.timestamp >= window_start,
            )
            .all()
        )
        bpm_vals = [r.value for r in readings if r.metric_type == "bpm"]
        gforce_vals = [r.value for r in readings if r.metric_type == "g_force"]

        if bpm_vals:
            vec[2] = float(np.mean(bpm_vals))
            vec[3] = float(np.std(bpm_vals)) if len(bpm_vals) > 1 else 0.0
        if gforce_vals:
            vec[4] = float(np.mean(gforce_vals))
            vec[5] = float(np.std(gforce_vals)) if len(gforce_vals) > 1 else 0.0

        # ── Vision Features ─────────────────────────────────────
        visions = (
            self.db.query(self._m.VisionFeature)
            .filter(
                self._m.VisionFeature.device_id == subject_id,
                self._m.VisionFeature.timestamp >= window_start,
            )
            .all()
        )
        if visions:
            blinks = [v.blink_rate_bpm for v in visions]
            slouches = [1.0 if v.is_slouching else 0.0 for v in visions]
            vec[6] = float(np.mean(blinks))
            vec[7] = float(np.std(blinks)) if len(blinks) > 1 else 0.0
            vec[8] = float(np.mean(slouches))

        # ── Audio Features ──────────────────────────────────────
        audios = (
            self.db.query(self._m.AudioFeature)
            .filter(
                self._m.AudioFeature.device_id == subject_id,
                self._m.AudioFeature.timestamp >= window_start,
            )
            .all()
        )
        if audios:
            segs = [a.speech_segments for a in audios]
            silences = [a.silence_ratio for a in audios]
            vec[9] = float(np.mean(segs))
            vec[10] = float(np.std(segs)) if len(segs) > 1 else 0.0
            vec[11] = float(np.mean(silences))
            vec[12] = float(np.std(silences)) if len(silences) > 1 else 0.0

        # ── Phone Events ────────────────────────────────────────
        phone_events = (
            self.db.query(self._m.PhoneEvent)
            .filter(
                self._m.PhoneEvent.device_id == subject_id,
                self._m.PhoneEvent.timestamp >= window_start,
            )
            .all()
        )
        if phone_events:
            screen_ons = [e for e in phone_events if e.event_type == "SCREEN_ON"]
            vec[13] = float(len(screen_ons))

            apps = set()
            night_count = 0
            for e in phone_events:
                if e.package_name:
                    apps.add(e.package_name)
                # Naive local-time hour check (UTC hour offset approximates)
                hour = e.timestamp.hour
                if 0 <= hour < 6:
                    night_count += 1
            vec[14] = float(len(apps))
            vec[15] = night_count / max(len(phone_events), 1)

        # If literally ALL features are NaN, return None
        if np.all(np.isnan(vec)):
            return None

        return vec

    def build_history(self, subject_id: str) -> Optional[np.ndarray]:
        """
        Build multiple feature vectors from historical windows for model fitting.
        Returns (n_windows, FEATURE_DIM) array or None.
        """
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=BASELINE_WINDOW_DAYS)

        windows = (
            self.db.query(self._m.BehaviorWindow)
            .filter(
                self._m.BehaviorWindow.subject_id == subject_id,
                self._m.BehaviorWindow.start_ts >= cutoff,
            )
            .order_by(self._m.BehaviorWindow.start_ts.asc())
            .all()
        )

        if len(windows) < MIN_WINDOWS_FOR_FIT:
            return None

        vectors = []
        for w in windows:
            # Build a vector anchored to each window's timeframe
            v = self._build_for_window(subject_id, w)
            if v is not None:
                vectors.append(v)

        if len(vectors) < MIN_WINDOWS_FOR_FIT:
            return None

        return np.array(vectors)

    def _build_for_window(self, subject_id: str, bw) -> Optional[np.ndarray]:
        """Build a feature vector anchored to a specific behaviour window."""
        w_start = bw.start_ts
        w_end = bw.end_ts

        vec = np.full(FEATURE_DIM, np.nan, dtype=np.float64)
        vec[0] = float(bw.total_active_mins)
        vec[1] = float(bw.sleep_hours_proxy)

        # Sensor readings within window
        readings = (
            self.db.query(self._m.SensorReading)
            .filter(
                self._m.SensorReading.device_id == subject_id,
                self._m.SensorReading.timestamp >= w_start,
                self._m.SensorReading.timestamp <= w_end,
            )
            .all()
        )
        bpm_vals = [r.value for r in readings if r.metric_type == "bpm"]
        gforce_vals = [r.value for r in readings if r.metric_type == "g_force"]
        if bpm_vals:
            vec[2] = float(np.mean(bpm_vals))
            vec[3] = float(np.std(bpm_vals)) if len(bpm_vals) > 1 else 0.0
        if gforce_vals:
            vec[4] = float(np.mean(gforce_vals))
            vec[5] = float(np.std(gforce_vals)) if len(gforce_vals) > 1 else 0.0

        visions = (
            self.db.query(self._m.VisionFeature)
            .filter(
                self._m.VisionFeature.device_id == subject_id,
                self._m.VisionFeature.timestamp >= w_start,
                self._m.VisionFeature.timestamp <= w_end,
            )
            .all()
        )
        if visions:
            blinks = [v.blink_rate_bpm for v in visions]
            slouches = [1.0 if v.is_slouching else 0.0 for v in visions]
            vec[6] = float(np.mean(blinks))
            vec[7] = float(np.std(blinks)) if len(blinks) > 1 else 0.0
            vec[8] = float(np.mean(slouches))

        audios = (
            self.db.query(self._m.AudioFeature)
            .filter(
                self._m.AudioFeature.device_id == subject_id,
                self._m.AudioFeature.timestamp >= w_start,
                self._m.AudioFeature.timestamp <= w_end,
            )
            .all()
        )
        if audios:
            segs = [a.speech_segments for a in audios]
            silences = [a.silence_ratio for a in audios]
            vec[9] = float(np.mean(segs))
            vec[10] = float(np.std(segs)) if len(segs) > 1 else 0.0
            vec[11] = float(np.mean(silences))
            vec[12] = float(np.std(silences)) if len(silences) > 1 else 0.0

        phone_events = (
            self.db.query(self._m.PhoneEvent)
            .filter(
                self._m.PhoneEvent.device_id == subject_id,
                self._m.PhoneEvent.timestamp >= w_start,
                self._m.PhoneEvent.timestamp <= w_end,
            )
            .all()
        )
        if phone_events:
            screen_ons = [e for e in phone_events if e.event_type == "SCREEN_ON"]
            vec[13] = float(len(screen_ons))
            apps = set()
            night_count = 0
            for e in phone_events:
                if e.package_name:
                    apps.add(e.package_name)
                if 0 <= e.timestamp.hour < 6:
                    night_count += 1
            vec[14] = float(len(apps))
            vec[15] = night_count / max(len(phone_events), 1)

        if np.all(np.isnan(vec)):
            return None
        return vec


# =========================================================================
# Subject Isolation Forest — per-subject anomaly detection
# =========================================================================


class SubjectIsolationForest:
    """
    Manages a per-subject Isolation Forest model.
    Each subject gets their own model fitted on their personal baseline.
    """

    def __init__(self):
        self._model: Optional[IsolationForest] = None
        self._scaler: Optional[StandardScaler] = None
        self._fitted: bool = False
        self._n_fit_samples: int = 0

    @property
    def fitted(self) -> bool:
        return self._fitted

    def fit(self, X: np.ndarray) -> None:
        """
        Fit the Isolation Forest on the subject's historical feature vectors.
        X: (n_samples, FEATURE_DIM)
        """
        if X.shape[0] < MIN_WINDOWS_FOR_FIT:
            logger.warning(
                "Insufficient samples for IF fit: %d < %d",
                X.shape[0],
                MIN_WINDOWS_FOR_FIT,
            )
            return

        # Impute missing values with column means
        X_clean = self._impute_nans(X)

        self._scaler = StandardScaler()
        X_scaled = self._scaler.fit_transform(X_clean)

        self._model = IsolationForest(
            n_estimators=IF_N_ESTIMATORS,
            contamination=IF_CONTAMINATION,
            max_samples=IF_MAX_SAMPLES,
            random_state=IF_RANDOM_STATE,
        )
        self._model.fit(X_scaled)

        # Store training decision scores for later reference
        train_decisions = self._model.decision_function(X_scaled)
        self._train_decision_mean = float(np.mean(train_decisions))
        self._train_decision_std = (
            float(np.std(train_decisions)) if len(train_decisions) > 1 else 0.1
        )

        self._fitted = True
        self._n_fit_samples = X.shape[0]

        logger.info(
            "Isolation Forest fitted for subject: %d samples, %d features",
            self._n_fit_samples,
            FEATURE_DIM,
        )

    def score(self, x: np.ndarray) -> float:
        """
        Score a single feature vector.
        Returns anomaly score in [0, 1] where higher = more anomalous.

        Uses a sigmoid mapping on the z-scored decision function so that:
          - decision at +1σ above mean → ~0.27 (well within normal)
          - decision at mean          → ~0.50 (borderline)
          - decision at -1σ below mean → ~0.73 (anomalous)
        """
        if not self._fitted or self._model is None:
            return 0.0

        x_clean = self._impute_nans(x.reshape(1, -1))
        x_scaled = self._scaler.transform(x_clean)

        decision = self._model.decision_function(x_scaled)[0]

        # z-score relative to training distribution
        z = (decision - self._train_decision_mean) / max(self._train_decision_std, 1e-6)

        # sigmoid: 1 / (1 + e^(z * k)) — steeper k = sharper transition
        # anomalous → negative z → e^(neg) is small → denominator near 1 → score near 1
        # normal    → positive z → e^(pos) is large → denominator large → score near 0
        anomaly = 1.0 / (1.0 + np.exp(z * 3.0))
        return float(np.clip(anomaly, 0.0, 1.0))

    @staticmethod
    def _impute_nans(X: np.ndarray) -> np.ndarray:
        """Column-mean imputation for missing values."""
        X_out = X.copy()
        nan_mask = np.isnan(X_out)
        for c in range(X_out.shape[1]):
            col = X_out[:, c]
            if nan_mask[:, c].any():
                valid = col[~nan_mask[:, c]]
                fill_val = float(np.mean(valid)) if len(valid) > 0 else 0.0
                X_out[nan_mask[:, c], c] = fill_val
        return X_out


# =========================================================================
# Modality Deviation Scorer
# =========================================================================


class ModalityDeviationScorer:
    """
    Computes per-modality deviation scores by comparing current feature
    values against the subject's historical distribution using z-score logic.
    """

    def __init__(self):
        self._baseline_means: Optional[np.ndarray] = None
        self._baseline_stds: Optional[np.ndarray] = None

    def fit(self, X: np.ndarray) -> None:
        """Compute baseline statistics from historical feature vectors."""
        X_clean = X.copy()
        for c in range(X_clean.shape[1]):
            col = X_clean[:, c]
            nan_mask = np.isnan(col)
            if nan_mask.any():
                valid_mean = (
                    float(np.mean(col[~nan_mask])) if (~nan_mask).any() else 0.0
                )
                X_clean[nan_mask, c] = valid_mean
        self._baseline_means = np.nanmean(X_clean, axis=0)
        self._baseline_stds = np.nanstd(X_clean, axis=0)
        self._baseline_stds[self._baseline_stds < 1e-6] = 1e-6  # prevent div-by-zero

    def score(self, x: np.ndarray) -> ModalityScores:
        """
        Compute per-modality deviation scores in [0, 1].
        Uses mean absolute z-score per modality group, capped at 1.0.
        """
        if self._baseline_means is None:
            return ModalityScores()

        cleaned = np.where(np.isnan(x), self._baseline_means, x)
        z_scores = np.abs((cleaned - self._baseline_means) / self._baseline_stds)
        z_scores = np.nan_to_num(z_scores, nan=0.0, posinf=0.0, neginf=0.0)

        # Feature index groups → modality
        phone_indices = [
            0,
            1,
            13,
            14,
            15,
        ]  # active_mins, sleep, screen_on, apps, night_ratio
        vision_indices = [6, 7, 8]  # blink avg/std, slouch
        physio_indices = [2, 3, 4, 5]  # bpm avg/std, gforce avg/std
        audio_indices = [9, 10, 11, 12]  # speech avg/std, silence avg/std

        def _mod_score(indices):
            vals = z_scores[indices]
            return float(np.clip(np.mean(vals) / 3.0, 0.0, 1.0))  # /3 to keep in range

        return ModalityScores(
            phone=_mod_score(phone_indices),
            vision=_mod_score(vision_indices),
            physio=_mod_score(physio_indices),
            audio=_mod_score(audio_indices),
            risk_reg=0.0,  # set separately from RiskRegistry hits
        )


# =========================================================================
# Rule-Based Fusion Engine
# =========================================================================


class FusionEngine:
    """
    Combines modality deviation scores using weighted linear fusion.

    Risk Score = Phone×0.35 + Vision×0.25 + Physio×0.20 + Audio×0.10 + RiskReg×0.10

    THESE WEIGHTS ARE PROTOTYPE DEMONSTRATION VALUES ONLY.
    They are NOT clinically validated.
    They are intended solely for demonstrating multimodal signal fusion.
    """

    def __init__(self):
        self.weights = {
            "phone": WEIGHT_PHONE,
            "vision": WEIGHT_VISION,
            "physio": WEIGHT_PHYSIO,
            "audio": WEIGHT_AUDIO,
            "risk_reg": WEIGHT_RISK_REG,
        }

    def compute(self, scores: ModalityScores) -> float:
        """Compute weighted fusion score in [0, 1]."""
        fused = (
            scores.phone * self.weights["phone"]
            + scores.vision * self.weights["vision"]
            + scores.physio * self.weights["physio"]
            + scores.audio * self.weights["audio"]
            + scores.risk_reg * self.weights["risk_reg"]
        )
        return float(np.clip(fused, 0.0, 1.0))


# =========================================================================
# PRISM Insight Scorer — maps fusion output to 0–100 with interpretation
# =========================================================================


class PrismInsightScorer:
    """
    Scales the fusion score to the 0–100 PRISM Insight Scale and assigns
    one of four interpretation labels.

    Interpretation:
      0–30   Baseline
      31–60  Behavioural change observed
      61–80  Multiple unusual signals
      81–100 High-priority pattern

    NEVER outputs diagnostic or clinical labels (healthy, depressed, suicidal, etc.).
    """

    @staticmethod
    def interpret(
        fusion_score: float,
        anomaly_score: float,
        modality_scores: ModalityScores,
    ) -> InsightResult:
        # Guard against NaN cascading from empty data
        if np.isnan(fusion_score) or np.isinf(fusion_score):
            fusion_score = 0.0
        if np.isnan(anomaly_score) or np.isinf(anomaly_score):
            anomaly_score = 0.0

        # Scale fusion to 0–100
        insight = fusion_score * 100.0

        # Find matching tier
        tier_label = INSIGHT_TIERS[0][2]
        tier_summary = INSIGHT_TIERS[0][3]
        for lo, hi, label, summary in INSIGHT_TIERS:
            if lo <= insight <= hi:
                tier_label = label
                tier_summary = summary
                break

        # Build contributing factors (never clinical/diagnostic)
        factors = PrismInsightScorer._build_factors(modality_scores)

        # Confidence degrades when data is sparse
        confidence = PrismInsightScorer._estimate_confidence(modality_scores)

        return InsightResult(
            subject_id="",
            insight_score=insight,
            tier_label=tier_label,
            tier_summary=tier_summary,
            anomaly_score=anomaly_score,
            modality_scores=modality_scores,
            fusion_score=fusion_score,
            contributing_factors=factors,
            confidence=confidence,
        )

    @staticmethod
    def _build_factors(scores: ModalityScores) -> list:
        """Generate human-readable contributing factors per modality."""
        factors = []
        thresholds = {
            "phone": 0.25,
            "vision": 0.25,
            "physio": 0.25,
            "audio": 0.25,
            "risk_reg": 0.01,
        }
        sd = scores.to_dict()

        for key, label in MODALITY_LABELS.items():
            val = sd.get(key, 0.0)
            if val > thresholds.get(key, 0.25):
                if key == "phone":
                    factors.append(
                        f"{label}: Screen time or activity patterns shifted relative to personal baseline."
                    )
                elif key == "vision":
                    factors.append(
                        f"{label}: Changes detected in blink rate, posture, or presence at screen."
                    )
                elif key == "physio":
                    factors.append(
                        f"{label}: Heart rate or movement variance differs from expected resting range."
                    )
                elif key == "audio":
                    factors.append(
                        f"{label}: Speech rate or silence patterns differ from typical vocal baseline."
                    )
                elif key == "risk_reg":
                    factors.append(
                        f"{label}: One or more safety-registry matches detected in app installs or browsing metadata."
                    )

        if not factors:
            factors.append("All modalities within expected personal baseline ranges.")
        return factors

    @staticmethod
    def _estimate_confidence(scores: ModalityScores) -> float:
        """Estimate confidence based on how many modalities have non-zero signal."""
        sd = scores.to_dict()
        active_modalities = sum(1 for v in sd.values() if v > 0.001)
        # More active modalities → higher confidence (within prototype limits)
        return min(1.0, 0.4 + active_modalities * 0.15)


# =========================================================================
# Orchestrator — ties everything together
# =========================================================================


class PrismMLEngine:
    """
    Top-level ML engine orchestrator for the Phase 10 prototype.

    Usage:
        engine = PrismMLEngine(SessionLocal)          # pass session factory
        engine.ensure_fitted(subject_id)             # once per subject
        result = engine.evaluate(subject_id)          # per scoring cycle
    """

    def __init__(self, db_session_factory):
        self._db_factory = db_session_factory
        self._fusion = FusionEngine()
        self._subjects: dict[str, SubjectIsolationForest] = {}
        self._deviation_scorers: dict[str, ModalityDeviationScorer] = {}
        self._classifier = None  # lazy-loaded notebook-derived RF classifier
        self._classifier_scaler = None

    def _get_db(self):
        return self._db_factory()

    # ── Public API ──────────────────────────────────────────────

    def ensure_fitted(self, subject_id: str) -> bool:
        """
        Fit (or re-fit) the subject's Isolation Forest model if enough
        historical data is available. Returns True if model is ready.
        """
        db = self._get_db()
        try:
            builder = FeatureVectorBuilder(db)
            X = builder.build_history(subject_id)
        finally:
            db.close()

        if X is None or X.shape[0] < MIN_WINDOWS_FOR_FIT:
            logger.info(
                "Subject %s: insufficient history for IF fit (%s samples)",
                subject_id,
                X.shape[0] if X is not None else 0,
            )
            return False

        if_model = SubjectIsolationForest()
        if_model.fit(X)

        dev_scorer = ModalityDeviationScorer()
        dev_scorer.fit(X)

        self._subjects[subject_id] = if_model
        self._deviation_scorers[subject_id] = dev_scorer
        return True

    def evaluate(self, subject_id: str) -> Optional[InsightResult]:
        """
        Run the full pipeline:
          1. Build current feature vector
          2. Run Isolation Forest → anomaly score
          3. Compute per-modality deviation scores
          4. Query risk-registry hits
          5. Run rule-based fusion engine
          6. Scale to PRISM Insight Score with interpretation
        """
        db = self._get_db()
        try:
            builder = FeatureVectorBuilder(db)
            x = builder.build(subject_id)
        finally:
            db.close()
        if x is None:
            logger.info("Subject %s: no feature data available for scoring", subject_id)
            return None

        # ── Isolation Forest anomaly score ──────────────────────
        if_model = self._subjects.get(subject_id)
        anomaly_score = if_model.score(x) if if_model and if_model.fitted else 0.0

        # ── Per-modality deviations ─────────────────────────────
        dev_scorer = self._deviation_scorers.get(subject_id)
        if dev_scorer:
            modality_scores = dev_scorer.score(x)
        else:
            modality_scores = ModalityScores()

        # ── Risk Registry ───────────────────────────────────────
        modality_scores.risk_reg = self._query_risk_registry_score(subject_id)

        # ── Fusion ──────────────────────────────────────────────
        fusion_score = self._fusion.compute(modality_scores)

        # ── Notebook-derived classifier boost (optional) ─────────
        # If the behavioural classifier is loaded, use its confidence
        # in sustained behavioural change (class 2) as a signal amplifier.
        # Gracefully degrades if model file is missing or feature dims mismatch.
        if anomaly_score > 0.15:  # only boost if IF detects some deviation
            fusion_score = self._classifier_boost(x, fusion_score)

        # ── Insight Interpretation ──────────────────────────────
        result = PrismInsightScorer.interpret(
            fusion_score=fusion_score,
            anomaly_score=anomaly_score,
            modality_scores=modality_scores,
        )
        result.subject_id = subject_id
        return result

    def evaluate_and_persist(self, subject_id: str) -> Optional[InsightResult]:
        """
        Evaluate and write RiskScoreV2 + optional AlertV2 to the database.
        """
        result = self.evaluate(subject_id)
        if result is None:
            return None

        from app import models as _m

        db = self._get_db()
        try:
            # Find the most recent BehaviorWindow to link
            bw = (
                db.query(_m.BehaviorWindow)
                .filter(_m.BehaviorWindow.subject_id == subject_id)
                .order_by(_m.BehaviorWindow.start_ts.desc())
                .first()
            )

            if bw:
                risk_score = _m.RiskScoreV2(
                    window_id=bw.id,
                    score_value=result.insight_score,
                    risk_level=(
                        "LOW"
                        if result.insight_score <= 30
                        else "MEDIUM" if result.insight_score <= 60 else "HIGH"
                    ),
                )
                risk_score.contributing_factors = result.contributing_factors
                db.add(risk_score)
                db.commit()
                db.refresh(risk_score)

                # Generate alert for MEDIUM or HIGH
                if result.insight_score > 30:
                    alert = _m.AlertV2(
                        subject_id=subject_id,
                        risk_score_id=risk_score.id,
                        summary=(
                            f"PRISM Insight Score: {result.insight_score:.0f}/100 — "
                            f"{result.tier_label}. {result.tier_summary}"
                        ),
                    )
                    db.add(alert)
                    db.commit()
        finally:
            db.close()

        return result

    # ── Helpers ─────────────────────────────────────────────────

    def _query_risk_registry_score(self, subject_id: str) -> float:
        """
        Query recent RiskRegistryHits for this subject.
        Returns a score in [0, 1] based on severity and recency.
        """
        from app import models as _m

        db = self._get_db()
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=BASELINE_WINDOW_DAYS)
            hits = (
                db.query(_m.RiskRegistryHit)
                .filter(
                    _m.RiskRegistryHit.subject_id == subject_id,
                    _m.RiskRegistryHit.timestamp >= cutoff,
                )
                .all()
            )
        finally:
            db.close()

        if not hits:
            return 0.0

        severity_weight = {"low": 0.2, "medium": 0.5, "high": 0.75, "critical": 1.0}
        total = 0.0
        for h in hits:
            total += severity_weight.get(h.severity, 0.2)

        return float(np.clip(total / max(len(hits) * 0.5, 1.0), 0.0, 1.0))

    # ── Notebook-derived classifier boost ───────────────────────

    def _load_classifier(self) -> None:
        """Lazy-load the notebook-derived RandomForestClassifier (if available)."""
        if self._classifier is not None:
            return
        try:
            import joblib

            model_path = os.path.join(_MODEL_DIR, "prism_behavioural_classifier.joblib")
            scaler_path = os.path.join(_MODEL_DIR, "prism_behavioural_scaler.joblib")
            if os.path.exists(model_path):
                self._classifier = joblib.load(model_path)
                if os.path.exists(scaler_path):
                    self._classifier_scaler = joblib.load(scaler_path)
                logger.info("Loaded behavioural classifier from disk")
        except Exception as e:
            logger.debug("Classifier not available: %s", e)
            self._classifier = None

    def _classifier_boost(self, feature_vector: np.ndarray, base_score: float) -> float:
        """
        Use the notebook-derived RandomForestClassifier to boost anomaly scores
        when sustained multi-modal behavioural change is detected.

        The classifier was trained on 79 engineered features (rolling windows,
        ratios, cyclical encoding). The FeatureVectorBuilder produces 16 raw
        features — dimension mismatch means the classifier boost is currently
        inactive. It activates when the full feature engineering pipeline is
        integrated (TimeSeriesFeatureEngineer → 79-dim → classifier).

        Gracefully returns base_score unchanged when feature dims mismatch.
        """
        self._load_classifier()
        if self._classifier is None:
            return base_score

        try:
            n_expected = self._classifier.n_features_in_
            n_actual = feature_vector.shape[0]
            if n_actual != n_expected:
                return base_score  # dim mismatch — FeatureVectorBuilder (16) vs classifier (79)

            if self._classifier_scaler is not None:
                x_scaled = self._classifier_scaler.transform(
                    feature_vector.reshape(1, -1)
                )
            else:
                x_scaled = feature_vector.reshape(1, -1)
            proba = self._classifier.predict_proba(x_scaled)
            # Only class 2 (Behavioural Change) contributes boost
            if proba.shape[1] >= 3:
                class2_prob = float(proba[0][2])
            else:
                class2_prob = 0.0
            boost = class2_prob * 0.30  # max 30-point boost
            return min(base_score + boost, 1.0)
        except Exception as e:
            logger.debug("Classifier boost failed: %s", e)
            return base_score


# =========================================================================
# Convenience: model persistence helpers
# =========================================================================

_MODEL_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "resources"
)


def save_subject_model(subject_id: str, engine: PrismMLEngine) -> bool:
    """Persist per-subject model to disk (joblib) for reuse across restarts."""
    if subject_id not in engine._subjects:
        return False
    try:
        import joblib

        os.makedirs(_MODEL_DIR, exist_ok=True)
        path = os.path.join(_MODEL_DIR, f"if_model_{subject_id}.joblib")
        joblib.dump(engine._subjects[subject_id], path)
        logger.info("Saved IF model for subject %s → %s", subject_id, path)
        return True
    except Exception as e:
        logger.error("Failed to save model for %s: %s", subject_id, e)
        return False


def load_subject_model(subject_id: str) -> Optional[SubjectIsolationForest]:
    """Load a previously persisted per-subject model."""
    try:
        import joblib

        path = os.path.join(_MODEL_DIR, f"if_model_{subject_id}.joblib")
        if not os.path.exists(path):
            return None
        model = joblib.load(path)
        logger.info("Loaded IF model for subject %s", subject_id)
        return model
    except Exception as e:
        logger.warning("Failed to load model for %s: %s", subject_id, e)
        return None


# =========================================================================
# Demo / debugging entry-point
# =========================================================================


def demo_pipeline(db, subject_id: str) -> dict:
    """
    Run the full pipeline and return a printable dict.
    Useful for integration tests and manual verification.
    """
    engine = PrismMLEngine(lambda: db)
    fitted = engine.ensure_fitted(subject_id)
    if not fitted:
        return {"status": "not_fitted", "reason": "insufficient_history"}

    result = engine.evaluate(subject_id)
    if result is None:
        return {"status": "no_data", "reason": "no_feature_vector"}

    return {"status": "ok", **result.to_dict()}
