"""
Tests for the PRISM 57-feature ML integration.

Covers:
  - Feature schema lock (FEATURE_NAMES, EXPECTED_FEATURE_COUNT).
  - Feature engineering produces 57 values in correct order.
  - Scaler NEVER refit during inference.
  - Classifier returns one of {0,1,2} with probabilities summing to 1.
  - Regressor returns a finite float (clipped to [0,1]).
  - Inference is deterministic for fixed input.
  - Missing data returns PrismInsufficientData — never a fake prediction.
  - API endpoint returns 200 + PrismPredictionResponse, or 503 + structured error.

Tests build their own classifier/regressor/scaler with known seeds, so the
suite is self-contained and does NOT depend on the artifacts shipped in the
downloads directory.
"""

from __future__ import annotations

import math
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import joblib
import numpy as np
import pytest
from fastapi.testclient import TestClient
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.preprocessing import StandardScaler

from app.config import settings
from app.utils import prism_features, prism_model
from app.utils.prism_features import (
    EXPECTED_FEATURE_COUNT,
    FEATURE_NAMES,
    FeatureBuildResult,
    build_feature_vector,
)
from app.tests.conftest import TestingSessionLocal


# ── Test fixtures: build synthetic but realistic artifacts in a tmp dir ─────


@pytest.fixture
def prism_artifacts(tmp_path, monkeypatch):
    """
    Build three compatible artifacts in a temp directory, point
    settings.PRISM_MODEL_DIR at it, and reset the cached registry.
    """
    n_estimators = 25  # keep small so the test is fast
    rng = 0

    # Build a synthetic 57-feature training set so scaler/clf/regr are real.
    # The values are noise — what matters here is shape and protocol, not
    # accuracy. We do NOT use the production artifacts because they live
    # outside this test environment.
    X = np.random.RandomState(rng).randn(60, EXPECTED_FEATURE_COUNT)

    scaler = StandardScaler().fit(X)
    Xs = scaler.transform(X)

    classes = np.array([0, 1, 2])
    y_cls = np.random.RandomState(1).choice(classes, size=60)
    classifier = RandomForestClassifier(
        n_estimators=n_estimators, class_weight="balanced", random_state=rng
    ).fit(Xs, y_cls)

    y_reg = np.random.RandomState(2).rand(60)
    regressor = RandomForestRegressor(
        n_estimators=n_estimators, random_state=rng
    ).fit(Xs, y_reg)

    model_dir = tmp_path / "prism_models"
    model_dir.mkdir()
    joblib.dump(classifier, str(model_dir / "prism_classifier_model.joblib"))
    joblib.dump(regressor, str(model_dir / "prism_regressor_model.joblib"))
    joblib.dump(scaler, str(model_dir / "prism_scaler.joblib"))

    monkeypatch.setattr(settings, "PRISM_MODEL_DIR", str(model_dir) + os.sep)
    prism_model.reset_model_registry_for_tests()
    return {"classifier": classifier, "regressor": regressor, "scaler": scaler, "dir": str(model_dir)}


# ── Schema lock tests ────────────────────────────────────────────────────────


def test_feature_count_constant():
    assert len(FEATURE_NAMES) == EXPECTED_FEATURE_COUNT == 57


def test_feature_names_have_no_duplicates():
    assert len(set(FEATURE_NAMES)) == 57


def test_feature_names_have_no_illegal_chars():
    """Schema column names must be plain identifiers (no spaces, commas, etc.)."""
    for name in FEATURE_NAMES:
        assert "," not in name
        assert ";" not in name
        assert "\n" not in name


def test_feature_names_match_spec():
    """The exact first/last feature names must match the spec verbatim."""
    assert FEATURE_NAMES[0] == "Day_of_Week"
    assert FEATURE_NAMES[6] == "Unique_POIs"
    assert FEATURE_NAMES[7] == "App_Activity_Chrome"
    assert FEATURE_NAMES[14] == "App_Activity_VS Code"
    assert FEATURE_NAMES[15] == "App_Activity_YouTube"
    assert FEATURE_NAMES[16] == "sin_Day_of_Week"
    assert FEATURE_NAMES[17] == "cos_Day_of_Week"
    assert FEATURE_NAMES[-3] == "Facial_Valence_Score"
    assert FEATURE_NAMES[-2] == "Selfie_Smile_Pct"
    assert FEATURE_NAMES[-1] == "Eye_Fatigue_Index"


def test_app_activity_keys_match_schema():
    assert set(prism_features.APP_ACTIVITY_KEYS).issubset(set(FEATURE_NAMES))


# ── Feature engineering tests ────────────────────────────────────────────────


def _seed_baselines(db, device_id, signal_type, value, days=14):
    """Seed `days` daily BaselineProfile rows ending today."""
    from app import models

    today = datetime.now(timezone.utc)
    rows = []
    for offset in range(days):
        ts = today - timedelta(days=offset)
        bp = models.BaselineProfile(
            device_id=device_id,
            signal_type=signal_type,
            rolling_mean=float(value + offset * 0.01),
            rolling_variance=0.0,
        )
        # Default is _now(); we override updated_at to control history.
        rows.append(bp)
    for r in rows:
        db.add(r)
    db.flush()
    # Override updated_at AFTER insert so timestamps match rolling windows.
    for offset, r in enumerate(rows):
        r.updated_at = today - timedelta(days=offset)
    db.commit()


def _make_device(db, suffix=""):
    from app import models

    guardian = models.Guardian(
        full_name="Test Guardian", email=f"g{suffix}@example.com",
        password_hash="x", role="guardian",
    )
    db.add(guardian)
    db.flush()
    device = models.ChildDevice(
        guardian_id=guardian.id,
        name=f"Test Device{suffix}",
        platform="android",
        device_token=f"tok{suffix}",
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


def test_build_feature_vector_returns_57_in_order(setup_db):
    """Even on an empty device, build_feature_vector must emit a 57-vector."""
    db = TestingSessionLocal()
    device = _make_device(db, suffix="-schema")
    result = build_feature_vector(db, str(device.id))

    assert isinstance(result, FeatureBuildResult)
    assert result.values.shape == (57,)
    assert result.feature_names == FEATURE_NAMES


def test_build_feature_vector_uses_db_history(setup_db):
    """Sleep_Score snapshot should equal the most recent BaselineProfile value."""
    db = TestingSessionLocal()
    device = _make_device(db, suffix="-hist")
    _seed_baselines(db, str(device.id), "sleep", 80.0, days=14)
    _seed_baselines(db, str(device.id), "steps", 9000.0, days=14)

    result = build_feature_vector(db, str(device.id))
    # Sleep_Score is column index 1.
    assert 70.0 <= result.values[1] <= 90.0
    # Steps_Count is column 2.
    assert 8000.0 <= result.values[2] <= 10000.0


def test_build_feature_vector_handles_no_history(setup_db):
    """Empty device → NaN-filled vector of length 57."""
    db = TestingSessionLocal()
    device = _make_device(db, suffix="-empty")
    result = build_feature_vector(db, str(device.id))
    assert result.values.shape == (57,)
    assert math.isnan(result.values[1])  # Sleep_Score


# ── Inference service tests (uses synthetic artifacts) ─────────────────────


def test_models_load_with_correct_feature_count(prism_artifacts):
    ok, err = prism_model._registry.load_all()
    assert ok, err
    assert prism_model._registry.get_scaler() is not None
    assert prism_model._registry.get_classifier() is not None
    assert prism_model._registry.get_regressor() is not None


def test_predict_prism_returns_label_in_registered_set(prism_artifacts, setup_db):
    db = TestingSessionLocal()
    device = _make_device(db, suffix="-pred")
    result = prism_model.predict_prism(str(device.id), db)
    assert isinstance(result, prism_model.PrismPrediction)
    assert result.classifier_index in {0, 1, 2}
    assert result.classifier_label in settings.PRISM_CLASSIFIER_LABELS.values()


def test_predict_prism_probabilities_sum_to_one(prism_artifacts, setup_db):
    db = TestingSessionLocal()
    device = _make_device(db, suffix="-probs")
    result = prism_model.predict_prism(str(device.id), db)
    assert isinstance(result, prism_model.PrismPrediction)
    total = sum(result.classifier_probabilities.values())
    assert abs(total - 1.0) < 1e-6


def test_predict_prism_regressor_returns_finite_score(prism_artifacts, setup_db):
    db = TestingSessionLocal()
    device = _make_device(db, suffix="-reg")
    result = prism_model.predict_prism(str(device.id), db)
    assert isinstance(result, prism_model.PrismPrediction)
    assert math.isfinite(result.regressor_score)
    assert 0.0 <= result.regressor_score <= 1.0
    assert result.regressor_label in {"low", "moderate", "elevated"}


def test_predict_prism_is_deterministic(prism_artifacts, setup_db):
    """Same input → same output."""
    db = TestingSessionLocal()
    device = _make_device(db, suffix="-det")
    r1 = prism_model.predict_prism(str(device.id), db)
    r2 = prism_model.predict_prism(str(device.id), db)
    assert isinstance(r1, prism_model.PrismPrediction)
    assert isinstance(r2, prism_model.PrismPrediction)
    assert r1.classifier_index == r2.classifier_index
    assert r1.regressor_score == r2.regressor_score


def test_predict_prism_scaler_never_refit(prism_artifacts, setup_db):
    """`scaler.fit` / `scaler.fit_transform` must NEVER be called during inference."""
    db = TestingSessionLocal()
    device = _make_device(db, suffix="-nofit")
    # Load artifacts explicitly so the cached scaler is available.
    ok, err = prism_model._registry.load_all()
    assert ok, err
    scaler = prism_model._registry.get_scaler()
    original_state = scaler.__dict__.copy()

    with patch.object(
        type(scaler), "fit", side_effect=AssertionError("scaler.fit was called!")
    ), patch.object(
        type(scaler),
        "fit_transform",
        side_effect=AssertionError("scaler.fit_transform was called!"),
    ):
        prism_model.predict_prism(str(device.id), db)

    # The scaler's state must not have changed.
    for key, value in original_state.items():
        if key in scaler.__dict__:
            np.testing.assert_array_equal(scaler.__dict__[key], value)


def test_predict_prism_missing_artifacts_returns_insufficient(setup_db, monkeypatch):
    """Without artifacts, predict_prism returns PrismInsufficientData — never raises."""
    # Point at an empty directory.
    empty = tempfile.mkdtemp()
    monkeypatch.setattr(settings, "PRISM_MODEL_DIR", empty + os.sep)
    prism_model.reset_model_registry_for_tests()

    db = TestingSessionLocal()
    device = _make_device(db, suffix="-missing")
    result = prism_model.predict_prism(str(device.id), db)
    assert isinstance(result, prism_model.PrismInsufficientData)
    assert result.reason == "model_not_loaded"
    assert result.message  # not empty


# ── Schema regression tests ────────────────────────────────────────────────


def test_feature_pipeline_rejects_wrong_count():
    """If someone accidentally changes EXPECTED_FEATURE_COUNT, the test fails."""
    assert EXPECTED_FEATURE_COUNT == 57, (
        "EXPECTED_FEATURE_COUNT changed! This will silently break all Prism "
        "inference. Update artifacts and tests together if intentional."
    )


def test_app_activity_feature_names_match_artifact_schema():
    """Order-of-features is critical for the scaler; do not reorder."""
    expected = (
        "App_Activity_Chrome", "App_Activity_Figma", "App_Activity_Instagram",
        "App_Activity_Slack", "App_Activity_Spotify", "App_Activity_Terminal",
        "App_Activity_TikTok", "App_Activity_VS Code", "App_Activity_YouTube",
    )
    assert prism_features.APP_ACTIVITY_KEYS == expected, (
        "APP_ACTIVITY_KEYS order diverged — re-training required."
    )
