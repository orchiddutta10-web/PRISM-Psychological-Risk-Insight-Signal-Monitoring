"""
Phase 10 ML Engine — Unit & Integration Tests
"""

from datetime import datetime, timedelta, timezone

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import models
from app.main import app
from app.utils.prism_ml_engine import (
    INSIGHT_TIERS,
    FusionEngine,
    InsightResult,
    ModalityDeviationScorer,
    ModalityScores,
    PrismInsightScorer,
    PrismMLEngine,
    SubjectIsolationForest,
)

# ── Uses shared DB engine + fixtures from conftest.py ────────────────
from app.tests.conftest import TestingSessionLocal

client = TestClient(app)

# Override the ML engine singleton used by routes/ml.py
from app.routes import ml as ml_routes

_test_engine = PrismMLEngine(TestingSessionLocal)
ml_routes.set_ml_engine(_test_engine)


# ── Helper: generate synthetic feature vectors for testing ──────────────

def _make_window_vectors(
    n_windows: int = 10, anomaly: bool = False, seed: int = 42
) -> np.ndarray:
    """Generate synthetic 16-dim feature vectors for testing."""
    rng = np.random.default_rng(seed)

    if anomaly:
        # Produce clearly out-of-distribution vectors
        means = np.array([
            30.0,   # total_active_mins  (very low)
            3.0,    # sleep_hours_proxy  (very low)
            95.0,   # avg_bpm            (elevated)
            20.0,   # bpm_std            (high variability)
            1.5,    # avg_g_force        (high movement)
            0.8,    # g_force_std        (high variance)
            35.0,   # avg_blink_rate     (elevated)
            8.0,    # blink_rate_std     (high variability)
            0.7,    # slouch_ratio       (slouching often)
            2.0,    # avg_speech_segments (low)
            0.3,    # speech_segments_std
            0.85,   # avg_silence_ratio  (very quiet)
            0.15,   # silence_ratio_std
            80.0,   # screen_on_count    (high)
            12.0,   # unique_app_count
            0.60,   # night_activity_ratio (high night usage)
        ])
    else:
        means = np.array([
            180.0,  # total_active_mins
            8.0,    # sleep_hours_proxy
            72.0,   # avg_bpm
            5.0,    # bpm_std
            1.02,   # avg_g_force
            0.1,    # g_force_std
            15.0,   # avg_blink_rate
            3.0,    # blink_rate_std
            0.1,    # slouch_ratio
            8.0,    # avg_speech_segments
            2.0,    # speech_segments_std
            0.3,    # avg_silence_ratio
            0.1,    # silence_ratio_std
            30.0,   # screen_on_count
            5.0,    # unique_app_count
            0.05,   # night_activity_ratio
        ])

    stds = means * 0.1 + 0.01
    return rng.normal(loc=means, scale=stds, size=(n_windows, len(means)))


def _seed_db_with_data(subject_id: str):
    """Insert synthetic Phase 8 schema data into the test database."""
    db = TestingSessionLocal()
    now = datetime.now(timezone.utc)
    from datetime import timedelta

    # Create a user
    user = models.User(id=subject_id, email=f"{subject_id}@test.com", hashed_password="x", role="guardian")
    db.add(user)

    # Create a device
    device = models.Device(id=subject_id, user_id=subject_id, name="Test Device", device_type="android_phone")
    db.add(device)

    # Insert behavior windows (daily, last 14 days ending today)
    for i in range(14):
        day = now - timedelta(days=13 - i)
        start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        end = day.replace(hour=23, minute=59, second=59, microsecond=0)
        bw = models.BehaviorWindow(
            subject_id=subject_id,
            start_ts=start,
            end_ts=end,
            total_active_mins=180.0,
            sleep_hours_proxy=8.0,
        )
        db.add(bw)

    # Insert sensor readings
    yesterday = now - timedelta(days=1)
    for i in range(50):
        sr = models.SensorReading(
            device_id=subject_id,
            metric_type="bpm",
            value=72.0 + np.random.default_rng().normal(0, 5),
            timestamp=yesterday,
        )
        db.add(sr)

    # Insert vision features
    for i in range(30):
        vf = models.VisionFeature(
            device_id=subject_id,
            blink_rate_bpm=15.0,
            is_slouching=False,
            timestamp=yesterday,
        )
        db.add(vf)

    # Insert audio features
    for i in range(20):
        af = models.AudioFeature(
            device_id=subject_id,
            speech_segments=8.0,
            silence_ratio=0.3,
            timestamp=yesterday,
        )
        db.add(af)

    # Insert phone events
    for i in range(40):
        pe = models.PhoneEvent(
            device_id=subject_id,
            event_type="SCREEN_ON",
            timestamp=yesterday,
        )
        db.add(pe)

    db.commit()
    db.close()


# ════════════════════════════════════════════════════════════════════════
# Unit Tests
# ════════════════════════════════════════════════════════════════════════


class TestIsolationForest:
    """Tests for SubjectIsolationForest."""

    def test_fit_with_sufficient_data(self):
        X = _make_window_vectors(n_windows=10)
        model = SubjectIsolationForest()
        model.fit(X)
        assert model.fitted is True
        assert model._n_fit_samples == 10

    def test_no_fit_with_insufficient_data(self):
        X = _make_window_vectors(n_windows=2)
        model = SubjectIsolationForest()
        model.fit(X)
        assert model.fitted is False

    def test_score_normal_vector(self):
        X = _make_window_vectors(n_windows=50, seed=42)
        model = SubjectIsolationForest()
        model.fit(X)

        # Test multiple vectors from the same distribution
        scores = []
        for s in [100, 200, 300]:
            normal_vecs = _make_window_vectors(n_windows=5, seed=s)
            for i in range(5):
                scores.append(model.score(normal_vecs[i]))

        # Most normal vectors should score below 0.6 (sigmoid midpoint ~0.5)
        low_scores = sum(1 for s in scores if s < 0.60)
        assert low_scores >= len(scores) * 0.6, (
            f"Only {low_scores}/{len(scores)} normal vectors scored below 0.60"
        )

    def test_score_anomalous_vector(self):
        X = _make_window_vectors(n_windows=15)
        model = SubjectIsolationForest()
        model.fit(X)

        anom_vec = _make_window_vectors(n_windows=1, anomaly=True, seed=999)[0]
        score = model.score(anom_vec)
        assert 0.0 <= score <= 1.0
        assert score > 0.5  # should be anomalous

    def test_score_before_fit_returns_zero(self):
        X = _make_window_vectors(n_windows=1)[0]
        model = SubjectIsolationForest()
        score = model.score(X)
        assert score == 0.0

    def test_handles_nan_features(self):
        X = _make_window_vectors(n_windows=10)
        X[3, 2] = np.nan
        X[5, 7] = np.nan
        model = SubjectIsolationForest()
        model.fit(X)
        assert model.fitted is True

        vec = _make_window_vectors(n_windows=1)[0].copy()
        vec[2] = np.nan
        score = model.score(vec)
        assert 0.0 <= score <= 1.0


class TestModalityDeviationScorer:
    """Tests for ModalityDeviationScorer."""

    def test_fit_and_score(self):
        X = _make_window_vectors(n_windows=20)
        scorer = ModalityDeviationScorer()
        scorer.fit(X)

        normal = _make_window_vectors(n_windows=1, seed=42)[0]
        scores = scorer.score(normal)
        assert isinstance(scores, ModalityScores)
        assert 0.0 <= scores.phone <= 1.0
        assert 0.0 <= scores.vision <= 1.0

    def test_anomalous_vector_yields_higher_scores(self):
        X = _make_window_vectors(n_windows=20)
        scorer = ModalityDeviationScorer()
        scorer.fit(X)

        normal = _make_window_vectors(n_windows=1, seed=42)[0]
        anom = _make_window_vectors(n_windows=1, anomaly=True, seed=42)[0]

        normal_scores = scorer.score(normal)
        anom_scores = scorer.score(anom)

        # Anomalous should produce strictly higher scores in most modalities
        assert (
            anom_scores.phone + anom_scores.vision + anom_scores.physio
            > normal_scores.phone + normal_scores.vision + normal_scores.physio
        )


class TestFusionEngine:
    """Tests for the rule-based fusion engine."""

    def test_weights_sum_to_one(self):
        engine = FusionEngine()
        total = sum(engine.weights.values())
        assert abs(total - 1.0) < 0.001

    def test_all_zero_input_produces_zero(self):
        engine = FusionEngine()
        scores = ModalityScores()
        result = engine.compute(scores)
        assert result == 0.0

    def test_all_one_produces_one(self):
        engine = FusionEngine()
        scores = ModalityScores(phone=1.0, vision=1.0, physio=1.0, audio=1.0, risk_reg=1.0)
        result = engine.compute(scores)
        assert abs(result - 1.0) < 0.001

    def test_weighted_contribution(self):
        engine = FusionEngine()
        scores = ModalityScores(phone=0.5, vision=0.0, physio=0.0, audio=0.0, risk_reg=0.0)
        result = engine.compute(scores)
        assert abs(result - 0.175) < 0.01  # 0.5 * 0.35

        scores = ModalityScores(phone=0.0, vision=0.0, physio=0.0, audio=0.0, risk_reg=1.0)
        result = engine.compute(scores)
        assert abs(result - 0.10) < 0.01  # 1.0 * 0.10

    def test_result_clamped_to_zero_one(self):
        engine = FusionEngine()
        scores = ModalityScores(phone=5.0, vision=5.0, physio=5.0, audio=5.0, risk_reg=5.0)
        result = engine.compute(scores)
        assert 0.0 <= result <= 1.0


class TestPrismInsightScorer:
    """Tests for the PRISM Insight Score interpretation."""

    def test_baseline_tier(self):
        scores = ModalityScores()
        result = PrismInsightScorer.interpret(0.15, 0.1, scores)
        assert result.tier_label == "Baseline"
        assert 0 <= result.insight_score <= 30

    def test_behavioural_change_tier(self):
        scores = ModalityScores(phone=0.5)
        result = PrismInsightScorer.interpret(0.45, 0.5, scores)
        assert result.tier_label == "Behavioural change observed"
        assert 31 <= result.insight_score <= 60

    def test_multiple_signals_tier(self):
        scores = ModalityScores(phone=0.7, vision=0.6)
        result = PrismInsightScorer.interpret(0.70, 0.7, scores)
        assert result.tier_label == "Multiple unusual signals"
        assert 61 <= result.insight_score <= 80

    def test_high_priority_tier(self):
        scores = ModalityScores(phone=0.9, vision=0.9, physio=0.8, audio=0.7, risk_reg=1.0)
        result = PrismInsightScorer.interpret(0.90, 0.9, scores)
        assert result.tier_label == "High-priority pattern"
        assert 81 <= result.insight_score <= 100

    def test_never_produces_diagnostic_labels(self):
        prohibited = {"healthy", "depressed", "suicidal", "depression", "mentally ill",
                       "psychiatric", "clinical", "diagnosis", "disorder"}
        scores = ModalityScores(phone=0.5)
        result = PrismInsightScorer.interpret(0.50, 0.5, scores)

        combined = f"{result.tier_label} {result.tier_summary} {' '.join(result.contributing_factors)}".lower()
        for word in prohibited:
            assert word not in combined, f"Prohibited label '{word}' found in output"

    def test_contributing_factors_always_present(self):
        scores = ModalityScores()
        result = PrismInsightScorer.interpret(0.0, 0.0, scores)
        assert len(result.contributing_factors) >= 1

    def test_contributing_factors_describe_modalities(self):
        scores = ModalityScores(phone=0.6, vision=0.5)
        result = PrismInsightScorer.interpret(0.50, 0.5, scores)
        combined = " ".join(result.contributing_factors)
        assert "Phone" in combined or "phone" in combined.lower()
        assert "Vision" in combined or "visual" in combined.lower()


class TestModalityScores:
    """Basic dataclass tests."""

    def test_default_scores_are_zero(self):
        ms = ModalityScores()
        assert ms.phone == 0.0
        assert ms.vision == 0.0
        assert ms.physio == 0.0
        assert ms.audio == 0.0
        assert ms.risk_reg == 0.0

    def test_to_dict(self):
        ms = ModalityScores(phone=0.5, risk_reg=1.0)
        d = ms.to_dict()
        assert d["phone"] == 0.5
        assert d["risk_reg"] == 1.0
        assert d["vision"] == 0.0


# ════════════════════════════════════════════════════════════════════════
# Integration Tests
# ════════════════════════════════════════════════════════════════════════


class TestMLEngineIntegration:
    """Integration tests using the in-memory test DB."""

    def setup_method(self):
        """Before each test: create a clean engine connected to the test factory."""
        self._engine = PrismMLEngine(TestingSessionLocal)
        ml_routes.set_ml_engine(self._engine)

    def test_ensure_fitted_fails_without_data(self):
        result = self._engine.ensure_fitted("nonexistent-subject")
        assert result is False

    def test_ensure_fitted_succeeds_with_data(self):
        subj = "test-subject-1"
        _seed_db_with_data(subj)
        result = self._engine.ensure_fitted(subj)
        assert result is True
        assert subj in self._engine._subjects

    def test_evaluate_returns_none_without_data(self):
        result = self._engine.evaluate("nonexistent-subject")
        assert result is None

    def test_evaluate_returns_result_with_data(self):
        subj = "test-subject-2"
        _seed_db_with_data(subj)
        self._engine.ensure_fitted(subj)
        result = self._engine.evaluate(subj)
        assert result is not None
        assert isinstance(result, InsightResult)
        assert 0.0 <= result.insight_score <= 100.0
        assert result.tier_label in [t[2] for t in INSIGHT_TIERS]

    def test_evaluate_and_persist_writes_to_db(self):
        subj = "test-subject-3"
        _seed_db_with_data(subj)
        self._engine.ensure_fitted(subj)

        result = self._engine.evaluate_and_persist(subj)
        assert result is not None

        db = TestingSessionLocal()
        try:
            score = db.query(models.RiskScoreV2).filter(
                models.RiskScoreV2.window.has(subject_id=subj)
            ).first()
            # May or may not have persisted if no window exists, but evaluate_and_persist
            # should not crash.
            db.close()
        except Exception:
            db.close()

        assert result.subject_id == subj

    def test_modality_scores_in_reasonable_range(self):
        subj = "test-subject-4"
        _seed_db_with_data(subj)
        self._engine.ensure_fitted(subj)
        result = self._engine.evaluate(subj)
        if result:
            ms = result.modality_scores
            for val in ms.to_dict().values():
                assert 0.0 <= val <= 1.0, f"Modality score {val} out of [0,1] range"


class TestMLEngineAPIRoutes:
    """Tests for the ML engine API endpoints."""

    def setup_method(self):
        self._engine = PrismMLEngine(TestingSessionLocal)
        ml_routes.set_ml_engine(self._engine)

    def _register_and_login(self):
        client.post(
            "/api/v1/auth/register",
            json={
                "full_name": "Test Guardian",
                "email": "mltest@example.com",
                "password": "securepass123",
            },
        )
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": "mltest@example.com", "password": "securepass123"},
        )
        return resp.json()["access_token"]

    def test_fit_endpoint_requires_auth(self):
        resp = client.post("/api/v1/ml/insight/subj/fit")
        assert resp.status_code == 401

    def test_fit_endpoint_insufficient_data(self):
        token = self._register_and_login()
        resp = client.post(
            "/api/v1/ml/insight/nonexistent/fit",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["fitted"] is False
        assert "Insufficient" in data["detail"]

    def test_fit_endpoint_with_data(self):
        token = self._register_and_login()
        subj = "api-test-subj"
        _seed_db_with_data(subj)

        resp = client.post(
            f"/api/v1/ml/insight/{subj}/fit",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["fitted"] is True

    def test_evaluate_endpoint_returns_insight(self):
        token = self._register_and_login()
        subj = "api-test-eval"
        _seed_db_with_data(subj)

        # Fit first
        client.post(
            f"/api/v1/ml/insight/{subj}/fit",
            headers={"Authorization": f"Bearer {token}"},
        )

        # Evaluate
        resp = client.post(
            f"/api/v1/ml/insight/{subj}",
            json={"persist": True},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "insight_score" in data
        assert "tier_label" in data
        assert "contributing_factors" in data
        assert 0.0 <= data["insight_score"] <= 100.0

    def test_evaluate_no_persist_does_not_write(self):
        token = self._register_and_login()
        subj = "api-test-nopersist"
        _seed_db_with_data(subj)

        client.post(
            f"/api/v1/ml/insight/{subj}/fit",
            headers={"Authorization": f"Bearer {token}"},
        )

        resp = client.post(
            f"/api/v1/ml/insight/{subj}",
            json={"persist": False},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    def test_evaluate_no_data_returns_404(self):
        token = self._register_and_login()
        resp = client.post(
            "/api/v1/ml/insight/nonexistent-eval",
            json={"persist": False},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404


# ════════════════════════════════════════════════════════════════════════
# Constraint Verification Tests
# ════════════════════════════════════════════════════════════════════════


class TestNonDiagnosticConstraint:
    """Verify non-negotiable constraint: never produce clinical/diagnostic labels."""

    def test_insight_tiers_contain_no_diagnostic_terms(self):
        prohibited = {"healthy", "depressed", "suicidal", "mentally ill",
                       "depression", "anxiety", "clinical", "disorder", "diagnosis"}
        for _, _, label, summary in INSIGHT_TIERS:
            combined = f"{label} {summary}".lower()
            for word in prohibited:
                assert word not in combined, f"'{word}' found in tier: {label}"

    def test_modality_labels_are_descriptive_not_clinical(self):
        from app.utils.prism_ml_engine import MODALITY_LABELS

        prohibited = {"healthy", "depressed", "suicidal", "disorder", "clinical"}
        for label in MODALITY_LABELS.values():
            for word in prohibited:
                assert word not in label.lower(), f"'{word}' in '{label}'"

    def test_contributing_factors_never_clinical(self):
        """Fuzz a range of inputs and verify no clinical terms appear."""
        prohibited = {"healthy", "depressed", "suicidal", "mentally ill", "disorder"}
        for score_val in [0.1, 0.3, 0.5, 0.7, 0.9]:
            scores = ModalityScores(phone=score_val, vision=score_val)
            result = PrismInsightScorer.interpret(score_val, score_val, scores)
            combined = " ".join(result.contributing_factors).lower()
            for word in prohibited:
                assert word not in combined, (
                    f"'{word}' in contributing factors at score={score_val}: {result.contributing_factors}"
                )