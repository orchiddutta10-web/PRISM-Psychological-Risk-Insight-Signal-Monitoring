"""
Phase 12 — Drift Detection Engine

Monitors score, feature, and confidence drift across per-subject
behavioural models. Generates drift alerts when thresholds are exceeded.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# Drift thresholds (prototype-appropriate)
SCORE_DRIFT_AMBER = 0.20   # 20% shift → amber alert
SCORE_DRIFT_RED = 0.40     # 40% shift → red alert
CONFIDENCE_DROP = 0.30     # 30% confidence drop → investigate
FEATURE_DRIFT_FLAG = 0.25  # 25% shift in any modality → flag

WINDOW_7D = 7
WINDOW_30D = 30


@dataclass
class DriftReport:
    subject_id: str
    timestamp: str
    score_drift: dict = field(default_factory=dict)
    feature_drift: dict = field(default_factory=dict)
    confidence_drift: dict = field(default_factory=dict)
    recommendation: str = "no_action"
    overall_alert: str = "sage"  # sage | amber | red

    def to_dict(self) -> dict:
        return {
            "subject_id": self.subject_id,
            "timestamp": self.timestamp,
            "score_drift": self.score_drift,
            "feature_drift": self.feature_drift,
            "confidence_drift": self.confidence_drift,
            "recommendation": self.recommendation,
            "overall_alert": self.overall_alert,
        }


@dataclass
class DataQualityReport:
    subject_id: str
    total_windows: int
    data_completeness: float
    outlier_windows: list[int]
    quarantined: bool
    reason: str = ""

    def to_dict(self) -> dict:
        return {
            "subject_id": self.subject_id,
            "total_windows": self.total_windows,
            "data_completeness": round(self.data_completeness, 3),
            "outlier_windows": self.outlier_windows,
            "quarantined": self.quarantined,
            "reason": self.reason,
        }


class DriftMonitor:
    """Analyzes score, feature, and confidence drift for a subject."""

    @staticmethod
    def analyze(subject_id: str, db) -> DriftReport:
        """
        Full drift analysis for a subject.
        Queries risk_scores_v2 for historical score data.
        """
        from app import models as _m

        cutoff = datetime.now(timezone.utc) - timedelta(days=WINDOW_30D)
        scores = (
            db.query(_m.RiskScoreV2)
            .join(_m.BehaviorWindow, _m.RiskScoreV2.window_id == _m.BehaviorWindow.id)
            .filter(
                _m.BehaviorWindow.user_id == subject_id,
                _m.BehaviorWindow.start_ts >= cutoff,
            )
            .order_by(_m.BehaviorWindow.start_ts.asc())
            .all()
        )

        if len(scores) < 5:
            return DriftReport(
                subject_id=subject_id,
                timestamp=datetime.now(timezone.utc).isoformat(),
                recommendation="insufficient_data",
                overall_alert="sage",
            )

        score_values = np.array([s.score_value for s in scores])

        # Score drift
        score_drift = DriftMonitor._compute_score_drift(score_values)

        # Feature drift (from stored contributing factors)
        feature_drift = DriftMonitor._compute_feature_drift(scores)

        # Confidence drift (not stored in RiskScoreV2 — use score stability as proxy)
        confidence_drift = DriftMonitor._compute_confidence_drift(score_values)

        # Determine recommendation
        max_drift = max(
            score_drift.get("shift_pct", 0),
            confidence_drift.get("shift_pct", 0),
        )
        max_feat = feature_drift.get("shift_pct", 0) if isinstance(feature_drift, dict) else 0

        if score_drift.get("alert") == "red" or max_drift > SCORE_DRIFT_RED:
            alert = "red"
            rec = "retrain_required"
        elif score_drift.get("alert") == "amber" or max_drift > SCORE_DRIFT_AMBER:
            alert = "amber"
            rec = "retrain_recommended"
        elif max_feat > FEATURE_DRIFT_FLAG:
            alert = "amber"
            rec = "investigate_feature_drift"
        elif confidence_drift.get("alert") == "amber":
            alert = "amber"
            rec = "investigate_data_quality"
        else:
            alert = "sage"
            rec = "no_action"

        return DriftReport(
            subject_id=subject_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            score_drift=score_drift,
            feature_drift=feature_drift,
            confidence_drift=confidence_drift,
            recommendation=rec,
            overall_alert=alert,
        )

    @staticmethod
    def _compute_score_drift(scores: np.ndarray) -> dict:
        """Compare 7-day vs 30-day rolling mean of insight scores."""
        if len(scores) < WINDOW_7D:
            return {
                "rolling_7d_mean": None,
                "rolling_30d_mean": float(np.mean(scores)) if len(scores) > 0 else 0,
                "shift_pct": 0.0,
                "alert": "sage",
            }

        recent = np.mean(scores[-WINDOW_7D:])
        historical = np.mean(scores)
        baseline = max(abs(historical), 1.0)  # prevent div-by-zero
        shift = abs(recent - historical) / baseline

        if shift > SCORE_DRIFT_RED:
            alert = "red"
        elif shift > SCORE_DRIFT_AMBER:
            alert = "amber"
        else:
            alert = "sage"

        return {
            "rolling_7d_mean": round(float(recent), 2),
            "rolling_30d_mean": round(float(historical), 2),
            "shift_pct": round(float(shift) * 100, 1),
            "alert": alert,
        }

    @staticmethod
    def _compute_feature_drift(
        scores: list,
    ) -> dict:
        """Compare contributing factors frequency over time as a proxy for feature drift."""
        # Count factors in recent vs historical windows
        if len(scores) < WINDOW_7D:
            return {}

        recent_factors = set()
        historical_factors = set()

        for s in scores[-WINDOW_7D:]:
            for f in (s.contributing_factors or []):
                recent_factors.add(f)

        for s in scores[:-WINDOW_7D] if len(scores) > WINDOW_7D else scores:
            for f in (s.contributing_factors or []):
                historical_factors.add(f)

        if not historical_factors:
            return {}

        # New factors appearing in recent window
        new_factors = recent_factors - historical_factors
        dropped_factors = historical_factors - recent_factors

        return {
            "new_factors_count": len(new_factors),
            "dropped_factors_count": len(dropped_factors),
            "shift_pct": round(
                (len(new_factors) + len(dropped_factors))
                / max(len(historical_factors), 1)
                * 100,
                1,
            ),
        }

    @staticmethod
    def _compute_confidence_drift(scores: np.ndarray) -> dict:
        """Proxy confidence drift from score variance changes."""
        if len(scores) < WINDOW_7D * 2:
            return {"shift_pct": 0.0, "alert": "sage"}

        recent_var = float(np.var(scores[-WINDOW_7D:]))
        historical_var = float(np.var(scores[:-WINDOW_7D]))
        baseline = max(abs(historical_var), 0.01)
        shift = abs(recent_var - historical_var) / baseline

        if shift > CONFIDENCE_DROP:
            alert = "amber"
        else:
            alert = "sage"

        return {
            "recent_variance": round(recent_var, 2),
            "historical_variance": round(historical_var, 2),
            "shift_pct": round(float(min(shift, 10.0)) * 100, 1),
            "alert": alert,
        }

    @staticmethod
    def validate_training_data(subject_id: str, db) -> DataQualityReport:
        """
        Pre-retraining data quality check.
        Flags quarantined data and returns completeness.
        """
        from app import models as _m

        cutoff = datetime.now(timezone.utc) - timedelta(days=WINDOW_30D)
        windows = (
            db.query(_m.BehaviorWindow)
            .filter(
                _m.BehaviorWindow.user_id == subject_id,
                _m.BehaviorWindow.start_ts >= cutoff,
            )
            .all()
        )

        n_windows = len(windows)
        completeness = min(n_windows / WINDOW_30D, 1.0)

        outliers = []
        if n_windows >= 5:
            active_mins = np.array([w.total_active_mins for w in windows])
            mean_am = np.mean(active_mins)
            std_am = np.std(active_mins) if len(active_mins) > 1 else 1.0
            for i, am in enumerate(active_mins):
                if abs(am - mean_am) > 3.0 * std_am:  # 3-sigma outliers
                    outliers.append(i)

        quarantined = len(outliers) > n_windows * 0.2  # >20% outlier windows

        return DataQualityReport(
            subject_id=subject_id,
            total_windows=n_windows,
            data_completeness=round(completeness, 3),
            outlier_windows=outliers,
            quarantined=quarantined,
            reason=(
                f"{len(outliers)} outlier windows detected (>3σ from mean)"
                if quarantined
                else ""
            ),
        )
