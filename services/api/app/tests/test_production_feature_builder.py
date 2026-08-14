import pytest
import numpy as np
from datetime import datetime, timezone
from unittest.mock import Mock, patch

from app.utils.production_feature_builder import ProductionFeatureBuilder, MissingTelemetryError
from app.services.colab_ml_service import ColabModelFeatures
from app.utils.prism_ml_engine import PrismMLEngine

def test_builder_detects_unavailable_features():
    db = Mock()
    # BehaviorWindow returns None
    db.query().filter().order_by().first.return_value = None

    builder = ProductionFeatureBuilder(db)

    # Should safely fail and return None instead of fabricating
    features = builder.build("sub123")
    assert features is None

def test_engine_handles_unavailable_features_safely():
    db = Mock()
    # Mocking db queries to return None will trigger MissingTelemetryError in the builder
    db.query().filter().order_by().first.return_value = None
    db.query().filter().all.return_value = []

    # Setup ML engine
    engine = PrismMLEngine(lambda: db)

    # Needs some legacy feature vector to avoid early None return from evaluate()
    with patch("app.utils.prism_ml_engine.FeatureVectorBuilder.build", return_value=np.zeros(16)):
        result = engine.evaluate("sub123")

        assert result is not None
        # It must safely fail rather than generating a misleading prediction
        assert result.colab_ml_risk_level == "ML prediction unavailable (missing 57-feature telemetry)"
        assert result.colab_ml_score is None

def test_builder_fails_on_missing_steps_count_specifically():
    db = Mock()
    bw = Mock()
    bw.sleep_hours_proxy = 8.0
    db.query().filter().order_by().first.return_value = bw

    builder = ProductionFeatureBuilder(db)
    features = builder.build("sub123")

    # Even if BW exists, it should hit Steps_Count missing telemetry check and return None
    assert features is None

def test_builder_produces_57_features_when_mocked_to_bypass_errors():
    db = Mock()
    builder = ProductionFeatureBuilder(db)

    # We must patch the _extract_features to simulate what would happen if all data WAS present
    # ensuring that if it does return a dict, it produces exactly 57 features that match the schema.

    dummy_dict = {
        "Day_of_Week": 1.0,
        "Sleep_Score": 100.0,
        "Steps_Count": 5000.0,
        "Screen_Time_Hours": 2.0,
        "Typing_Speed_WPM": 60.0,
        "Pulse_Rate_BPM": 70.0,
        "Unique_POIs": 2.0,

        "App_Activity_Chrome": 1.0,
        "App_Activity_Figma": 0.0,
        "App_Activity_Instagram": 1.0,
        "App_Activity_Slack": 0.0,
        "App_Activity_Spotify": 1.0,
        "App_Activity_Terminal": 0.0,
        "App_Activity_TikTok": 0.0,
        "App_Activity_VS_Code": 0.0,
        "App_Activity_YouTube": 1.0,

        "sin_Day_of_Week": 0.0,
        "cos_Day_of_Week": 1.0,

        "Sleep_Score_3d_mean": 90.0, "Sleep_Score_7d_mean": 85.0, "Sleep_Score_14d_mean": 80.0,
        "Sleep_Score_7d_std": 5.0, "Sleep_Score_14d_std": 6.0, "Sleep_Score_dev_from_7d": 15.0,

        "Steps_Count_3d_mean": 5000.0, "Steps_Count_7d_mean": 5100.0, "Steps_Count_14d_mean": 5200.0,
        "Steps_Count_7d_std": 100.0, "Steps_Count_14d_std": 150.0, "Steps_Count_dev_from_7d": -100.0,

        "Screen_Time_Hours_3d_mean": 2.0, "Screen_Time_Hours_7d_mean": 2.5, "Screen_Time_Hours_14d_mean": 3.0,
        "Screen_Time_Hours_7d_std": 0.5, "Screen_Time_Hours_14d_std": 0.8, "Screen_Time_Hours_dev_from_7d": -0.5,

        "Typing_Speed_WPM_3d_mean": 60.0, "Typing_Speed_WPM_7d_mean": 62.0, "Typing_Speed_WPM_14d_mean": 61.0,
        "Typing_Speed_WPM_7d_std": 2.0, "Typing_Speed_WPM_14d_std": 3.0, "Typing_Speed_WPM_dev_from_7d": -2.0,

        "Pulse_Rate_BPM_3d_mean": 70.0, "Pulse_Rate_BPM_7d_mean": 72.0, "Pulse_Rate_BPM_14d_mean": 71.0,
        "Pulse_Rate_BPM_7d_std": 2.0, "Pulse_Rate_BPM_14d_std": 3.0, "Pulse_Rate_BPM_dev_from_7d": -2.0,

        "Audio_Stress_Score": 0.0,
        "Vocal_Pitch_Variance": 0.0,
        "Speech_Pause_Ratio": 0.0,
        "RMS_Energy": 0.0,
        "Spectral_Centroid": 0.0,
        "MFCC_Mean": 0.0,
        "Facial_Valence_Score": 0.0,
        "Selfie_Smile_Pct": 0.0,
        "Eye_Fatigue_Index": 0.0
    }

    with patch.object(builder, "_extract_features", return_value=dummy_dict):
        features = builder.build("sub123")
        assert features is not None
        assert isinstance(features, ColabModelFeatures)

        arr = features.to_array()
        assert arr.shape == (1, 57), f"Expected 57 features, got {arr.shape[1]}"

        # Test feature ordering and integrity (unchanged)
        assert arr[0, 0] == 1.0  # Day_of_Week
        assert arr[0, 1] == 100.0 # Sleep_Score
