import os
import sys
import numpy as np

# Add services/api to sys path to import app modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "api")))

from app.services.colab_ml_service import ColabMLService, ColabModelFeatures


def test():
    print("--- 1. Testing Model Loading ---")
    service = ColabMLService()

    if service.classifier is None or service.regressor is None or service.scaler is None:
        print("FAIL: One or more models failed to load.")
        return
    print("PASS: Classifier, Regressor, and Scaler loaded successfully.")

    print("\n--- 2. Verifying Scaler accepts 57 features ---")
    # Construct a plausible synthetic sample
    sample_data = {
        "Day_of_Week": 2.0,
        "Sleep_Score": 82.0,
        "Steps_Count": 5000.0,
        "Screen_Time_Hours": 4.5,
        "Typing_Speed_WPM": 65.0,
        "Pulse_Rate_BPM": 72.0,
        "Unique_POIs": 2.0,
        "App_Activity_VS Code": 1.0, # Categorical
        "sin_Day_of_Week": np.sin(2 * np.pi * 2 / 7),
        "cos_Day_of_Week": np.cos(2 * np.pi * 2 / 7),

        "Sleep_Score_7d_mean": 80.0,
        "Sleep_Score_14d_mean": 79.5,
        "Sleep_Score_7d_std": 5.0,
        "Sleep_Score_dev_from_7d": 2.0,

        "Steps_Count_7d_mean": 6000.0,
        "Steps_Count_dev_from_7d": -1000.0,

        "Screen_Time_Hours_7d_mean": 4.0,

        "Typing_Speed_WPM_7d_mean": 64.0,

        "Pulse_Rate_BPM_7d_mean": 71.0,

        "Audio_Stress_Score": 0.4,
        "Vocal_Pitch_Variance": 0.6,
        "Speech_Pause_Ratio": 0.1,
        "RMS_Energy": 0.05,
        "Spectral_Centroid": 1200.0,
        "MFCC_Mean": 0.0,
        "Facial_Valence_Score": 0.2,
        "Selfie_Smile_Pct": 45.0,
        "Eye_Fatigue_Index": 0.3
    }

    # We pass this to the pydantic model to ensure all defaults apply and it formats correctly
    features = ColabModelFeatures(**sample_data)
    feature_array = features.to_array()

    if feature_array.shape != (1, 57):
        print(f"FAIL: Feature array shape is {feature_array.shape}, expected (1, 57)")
        return

    try:
        scaled_array = service.scaler.transform(feature_array)
        print("PASS: Scaler accepted the 57 features successfully.")
    except Exception as e:
        print(f"FAIL: Scaler threw an error: {e}")
        return

    print("\n--- 3. Verifying Classifier and Regressor Predictions ---")
    try:
        response = service.predict(features)
        print(f"PASS: Prediction successful!")
        print(f"  Classifier Prediction: {response.classifier_prediction}")
        print(f"  Classifier Probabilities: {response.classifier_probabilities}")
        print(f"  Regressor Score: {response.regressor_score:.2f}")
        print(f"  Risk Level: {response.risk_level}")
    except Exception as e:
        print(f"FAIL: Predict function threw an error: {e}")
        return

if __name__ == "__main__":
    test()
