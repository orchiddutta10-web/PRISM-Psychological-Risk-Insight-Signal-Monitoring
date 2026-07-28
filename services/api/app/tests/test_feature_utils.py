"""
Tests for notebook-derived feature engineering and behavioural classifier.
"""

import os

import numpy as np
import pandas as pd
import pytest

from app.utils.feature_utils import (
    TimeSeriesFeatureEngineer,
    cap_outliers_iqr,
    chrono_split,
    prune_collinear_features,
    safe_scale,
    select_features_mutual_info,
)


# ── Helper: generate a minimal test dataset ────────────────────────────


def _make_test_df(n: int = 50) -> pd.DataFrame:
    """Generate a small synthetic DataFrame matching notebook schema."""
    rng = np.random.default_rng(42)
    dates = pd.date_range("2025-01-01", periods=n, freq="D")
    data = {
        "Date": dates,
        "Day_of_Week": [d.weekday() for d in dates],
        "Sleep_Score": rng.normal(70, 5, n),
        "Steps_Count": rng.normal(6000, 1500, n),
        "Screen_Time_Hours": rng.normal(5, 1, n),
        "Typing_Speed_WPM": rng.normal(65, 10, n),
        "Pulse_Rate_BPM": rng.normal(70, 5, n),
        "App_Activity": rng.choice(["VS Code", "Spotify", "Chrome"], n),
        "Audio_Sentiment": rng.normal(0.3, 0.2, n),
        "Vocal_Pitch_Variance": rng.normal(0.7, 0.1, n),
        "Selfie_Smile_Pct": rng.normal(60, 15, n),
        "Time_at_Home_Pct": rng.normal(70, 10, n),
        "behavioural_change_index": rng.normal(50, 10, n),
        "Behavioural_State": rng.choice([0, 0, 0, 1, 2], n),  # mostly normal
    }
    return pd.DataFrame(data)


# ════════════════════════════════════════════════════════════════════════


class TestTimeSeriesFeatureEngineer:
    """Tests for the rolling-window feature engineering."""

    def test_cyclical_encoding(self):
        dow = pd.Series([0, 3, 6], name="Day_of_Week")
        sin_series, cos_series = TimeSeriesFeatureEngineer.encode_cyclical(dow, 7.0)
        assert len(sin_series) == 3
        assert len(cos_series) == 3
        assert np.abs(sin_series.iloc[0]) < 1e-9  # sin(0) ≈ 0
        assert np.abs(cos_series.iloc[0] - 1.0) < 1e-9  # cos(0) = 1

    def test_fit_transform_creates_features(self):
        df = _make_test_df(50)
        engineer = TimeSeriesFeatureEngineer()
        result = engineer.fit_transform(df)

        # Should include derived features
        assert "sin_Day_of_Week" in result.columns
        assert "cos_Day_of_Week" in result.columns
        assert "Digital_Fatigue_Ratio" in result.columns
        assert "Isolation_Ratio" in result.columns
        assert "Affect_Collapse_Score" in result.columns

        # Rolling features
        assert "Sleep_Score_3d_mean" in result.columns
        assert "Sleep_Score_7d_std" in result.columns
        assert "Sleep_Score_dev_from_7d" in result.columns
        assert "Pulse_Rate_BPM_14d_mean" in result.columns

    def test_rolling_means_preserve_length(self):
        df = _make_test_df(50)
        engineer = TimeSeriesFeatureEngineer()
        result = engineer.fit_transform(df)
        assert len(result) == len(df)

    def test_one_hot_encoding(self):
        df = _make_test_df(10)
        engineer = TimeSeriesFeatureEngineer()
        result = engineer.fit_transform(df)
        # App_Activity should be one-hot encoded (dropping first category)
        assert "App_Activity" not in result.columns
        has_activity_dummies = any("App_Activity_" in c for c in result.columns)
        assert has_activity_dummies

    def test_no_crash_on_missing_columns(self):
        """Engineer should handle DataFrames missing expected columns."""
        df = pd.DataFrame({"Sleep_Score": [70, 75, 80], "Screen_Time_Hours": [3, 4, 5]})
        engineer = TimeSeriesFeatureEngineer()
        result = engineer.fit_transform(df)
        assert len(result.columns) > 2  # should still produce rolling features


class TestOutlierCapping:
    def test_caps_extreme_values(self):
        df = pd.DataFrame({"a": [1, 2, 3, 4, 100]})
        capped = cap_outliers_iqr(df, ["a"])
        assert capped["a"].max() < 100
        assert capped["a"].max() > 4

    def test_does_not_cap_normal_values(self):
        df = pd.DataFrame({"a": [10.0, 11.0, 12.0, 13.0, 14.0]})
        capped = cap_outliers_iqr(df, ["a"])
        np.testing.assert_array_almost_equal(capped["a"].values, df["a"].values)

    def test_preserves_non_numeric_columns(self):
        df = pd.DataFrame({"a": [1, 2, 100], "b": ["x", "y", "z"]})
        capped = cap_outliers_iqr(df, ["a"])
        assert list(capped["b"]) == ["x", "y", "z"]


class TestCollinearityPruning:
    def test_removes_highly_correlated(self):
        rng = np.random.default_rng(42)
        n = 100
        base = rng.normal(0, 1, n)
        df = pd.DataFrame({
            "feat_a": base,
            "feat_b": base + rng.normal(0, 0.02, n),  # nearly identical to a
            "feat_c": rng.normal(0, 1, n),  # independent
        })
        pruned, dropped = prune_collinear_features(df, threshold=0.90)
        assert len(dropped) >= 1
        assert "feat_c" in pruned.columns

    def test_no_drop_when_independent(self):
        rng = np.random.default_rng(42)
        df = pd.DataFrame({
            "a": rng.normal(0, 1, 50),
            "b": rng.normal(0, 1, 50),
            "c": rng.normal(0, 1, 50),
        })
        pruned, dropped = prune_collinear_features(df, threshold=0.90)
        assert len(dropped) == 0
        assert pruned.shape[1] == 3


class TestMutualInfoSelection:
    def test_ranks_features(self):
        df = _make_test_df(30)
        y_clf = df["Behavioural_State"].values
        y_reg = df["behavioural_change_index"].values
        features = df[["Sleep_Score", "Screen_Time_Hours", "Steps_Count", "Pulse_Rate_BPM"]]
        ranked = select_features_mutual_info(features, y_reg, y_clf)
        assert len(ranked) == 4
        assert "Feature" in ranked.columns
        assert "MI_Classification" in ranked.columns
        assert ranked.iloc[0]["MI_Classification"] >= 0

    def test_top_k(self):
        df = _make_test_df(30)
        y_clf = df["Behavioural_State"].values
        features = df[["Sleep_Score", "Screen_Time_Hours", "Steps_Count"]]
        ranked = select_features_mutual_info(features, y_clf=y_clf, top_k=2)
        assert len(ranked) == 2


class TestChronoSplit:
    def test_no_shuffle_maintains_order(self):
        df = _make_test_df(50)
        y_clf = df["Behavioural_State"].values
        y_reg = df["behavioural_change_index"].values
        X = df[["Sleep_Score", "Screen_Time_Hours"]]
        Xt, Xv, yrt, yrv, yct, ycv = chrono_split(X, y_reg, y_clf, test_size=0.2)
        assert len(Xt) == 40
        assert len(Xv) == 10
        # Chronological: first row of test should match row 40 of original
        assert Xv.iloc[0]["Sleep_Score"] == X.iloc[40]["Sleep_Score"]

    def test_target_variables_preserved(self):
        df = _make_test_df(50)
        y_clf = df["Behavioural_State"].values
        y_reg = df["behavioural_change_index"].values
        X = df[["Sleep_Score"]]
        Xt, Xv, yrt, yrv, yct, ycv = chrono_split(X, y_reg, y_clf, test_size=0.2)
        assert len(yrt) == 40
        assert len(yrv) == 10
        assert len(yct) == 40
        assert len(ycv) == 10


class TestSafeScale:
    def test_scales_train_and_test(self):
        X_train = pd.DataFrame({"a": [1, 2, 3], "b": [10, 20, 30]})
        X_test = pd.DataFrame({"a": [0, 5], "b": [5, 35]})
        Xt_s, Xv_s, scaler = safe_scale(X_train, X_test)
        assert Xt_s.shape == (3, 2)
        assert Xv_s.shape == (2, 2)
        assert all(Xt_s.columns == X_train.columns)
        # Training data should have mean near 0, std near 1
        assert abs(Xt_s["a"].mean()) < 0.5


# ════════════════════════════════════════════════════════════════════════


class TestNotebookConstraintVerification:
    """Verify non-diagnostic constraints from the integration plan."""

    def test_no_psychological_health_index_in_api(self):
        """The label 'Psychological_Health_Index' must never appear in production code."""
        forbidden = "Psychological_Health_Index"
        # Check prism_ml_engine.py
        engine_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "utils", "prism_ml_engine.py",
        )
        content = open(engine_path, encoding="utf-8").read()
        assert forbidden not in content, f"'{forbidden}' found in prism_ml_engine.py"

    def test_no_distress_risk_label_in_ml_engine(self):
        """The label 'Distress Risk' (class 2) must never leak to API/module code."""
        forbidden = "Distress Risk"
        engine_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "utils", "prism_ml_engine.py",
        )
        content = open(engine_path, encoding="utf-8").read()
        assert forbidden not in content, f"'{forbidden}' found in prism_ml_engine.py"

    def test_no_distress_risk_in_routes(self):
        """The label 'Distress Risk' must never appear in API routes."""
        import glob
        route_files = glob.glob(
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "routes", "*.py")
        )
        for rf in route_files:
            content = open(rf, encoding="utf-8").read()
            assert "Distress Risk" not in content, f"'Distress Risk' found in {rf}"

    def test_feature_utils_no_diagnostic_labels(self):
        utils_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "utils", "feature_utils.py",
        )
        content = open(utils_path, encoding="utf-8").read()
        assert "Psychological_Health_Index" not in content
        assert "Distress Risk" not in content
