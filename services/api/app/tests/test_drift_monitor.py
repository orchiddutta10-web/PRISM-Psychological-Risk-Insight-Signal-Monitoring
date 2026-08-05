"""
Phase 12 — Drift Monitor Tests
"""

from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from app import models
from app.utils.drift_monitor import (
    SCORE_DRIFT_AMBER,
    SCORE_DRIFT_RED,
    DataQualityReport,
    DriftMonitor,
    DriftReport,
)
from app.tests.conftest import TestingSessionLocal


# ── Helpers ──────────────────────────────────────────────────────────────


def _seed_scores(subject_id: str, n: int = 30, stable: bool = True):
    """Seed RiskScoreV2 rows for drift testing."""
    db = TestingSessionLocal()
    now = datetime.now(timezone.utc)

    # Create user + device if not exist
    user = db.query(models.User).filter(models.User.id == subject_id).first()
    if not user:
        user = models.User(id=subject_id, email=f"{subject_id}@test.com", hashed_password="x", role="guardian")
        db.add(user)

    device = db.query(models.Device).filter(models.Device.id == subject_id).first()
    if not device:
        device = models.Device(id=subject_id, user_id=subject_id, name="Test", device_type="android_phone")
        db.add(device)

    db.commit()

    for i in range(n):
        day = now - timedelta(days=n - i)
        bw = models.BehaviorWindow(
            subject_id=subject_id,
            start_ts=day.replace(hour=0, minute=0, second=0),
            end_ts=day.replace(hour=23, minute=59, second=59),
            total_active_mins=180.0,
            sleep_hours_proxy=8.0,
        )
        db.add(bw)
        db.flush()

        if stable:
            score = 30.0 + np.random.default_rng(42).normal(0, 5)
        else:
            # Drift: first 20 days at 30, last 10 days at 70
            score = 70.0 if i >= n - 10 else 30.0
            score += np.random.default_rng(42).normal(0, 3)

        risk = models.RiskScoreV2(
            window_id=bw.id,
            score_value=float(np.clip(score, 0, 100)),
            risk_level="Baseline" if score < 31 else "Medium",
        )
        risk.contributing_factors = ["factor_a"] if stable else (["factor_b"] if score > 50 else ["factor_a"])
        db.add(risk)

    db.commit()
    db.close()


# ════════════════════════════════════════════════════════════════════════


class TestDriftMonitor:
    def test_analyze_stable_returns_sage(self):
        subj = "drift-stable"
        _seed_scores(subj, n=30, stable=True)
        db = TestingSessionLocal()
        report = DriftMonitor.analyze(subj, db)
        db.close()
        assert report.overall_alert == "sage"
        assert report.recommendation == "no_action"

    def test_analyze_shifted_returns_red(self):
        subj = "drift-shifted"
        _seed_scores(subj, n=30, stable=False)
        db = TestingSessionLocal()
        report = DriftMonitor.analyze(subj, db)
        db.close()
        # With a 40-point shift, should trigger red
        assert report.overall_alert == "red"
        assert report.recommendation == "retrain_required"

    def test_analyze_insufficient_data(self):
        subj = "drift-sparse"
        _seed_scores(subj, n=2, stable=True)
        db = TestingSessionLocal()
        report = DriftMonitor.analyze(subj, db)
        db.close()
        assert report.recommendation == "insufficient_data"

    def test_score_drift_computation(self):
        # Stable scores: all around 30
        scores = np.array([30.0] * 20)
        result = DriftMonitor._compute_score_drift(scores)
        assert result["alert"] == "sage"
        assert result["shift_pct"] < 10

        # Drifted: first 20 at 30, last 7 at 70
        scores = np.array([30.0] * 20 + [70.0] * 7)
        result = DriftMonitor._compute_score_drift(scores)
        assert result["shift_pct"] > SCORE_DRIFT_RED * 100

    def test_feature_drift_with_new_factors(self):
        from app import models as _m
        # Simulate scores with factor change
        class MockScore:
            def __init__(self, factors):
                self.contributing_factors = factors
            contributing_factors = []

        scores = [MockScore(["factor_a"]) for _ in range(15)] + \
                 [MockScore(["factor_b", "factor_c"]) for _ in range(5)]
        result = DriftMonitor._compute_feature_drift(scores)
        assert result["new_factors_count"] > 0
        assert result["shift_pct"] > 0

    def test_validate_training_data_normal(self):
        subj = "dq-normal"
        _seed_scores(subj, n=14, stable=True)
        db = TestingSessionLocal()
        report = DriftMonitor.validate_training_data(subj, db)
        db.close()
        assert report.quarantined is False
        assert report.data_completeness > 0

    def test_to_dict(self):
        report = DriftReport(
            subject_id="test",
            timestamp="2026-07-28T00:00:00Z",
            score_drift={"shift_pct": 45.2, "alert": "red"},
            feature_drift={"shift_pct": 12.0},
            confidence_drift={"shift_pct": 5.0},
            recommendation="retrain_required",
            overall_alert="red",
        )
        d = report.to_dict()
        assert d["subject_id"] == "test"
        assert d["overall_alert"] == "red"
        assert d["score_drift"]["shift_pct"] == 45.2


class TestDataQualityReport:
    def test_to_dict(self):
        r = DataQualityReport(
            subject_id="test",
            total_windows=14,
            data_completeness=1.0,
            outlier_windows=[],
            quarantined=False,
        )
        d = r.to_dict()
        assert d["quarantined"] is False
        assert d["total_windows"] == 14
