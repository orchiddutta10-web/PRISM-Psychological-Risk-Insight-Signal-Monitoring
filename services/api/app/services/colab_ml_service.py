import os
import logging
from typing import Dict, Any, List
import numpy as np
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

class ColabModelFeatures(BaseModel):
    # Base features
    Day_of_Week: float = 0.0
    Sleep_Score: float = 0.0
    Steps_Count: float = 0.0
    Screen_Time_Hours: float = 0.0
    Typing_Speed_WPM: float = 0.0
    Pulse_Rate_BPM: float = 0.0
    Unique_POIs: float = 0.0

    # Categorical One-Hot Encoded
    App_Activity_Chrome: float = 0.0
    App_Activity_Figma: float = 0.0
    App_Activity_Instagram: float = 0.0
    App_Activity_Slack: float = 0.0
    App_Activity_Spotify: float = 0.0
    App_Activity_Terminal: float = 0.0
    App_Activity_TikTok: float = 0.0
    App_Activity_VS_Code: float = Field(0.0, alias="App_Activity_VS Code")
    App_Activity_YouTube: float = 0.0

    # Cyclical
    sin_Day_of_Week: float = 0.0
    cos_Day_of_Week: float = 0.0

    # Rolling Sleep
    Sleep_Score_3d_mean: float = 0.0
    Sleep_Score_7d_mean: float = 0.0
    Sleep_Score_14d_mean: float = 0.0
    Sleep_Score_7d_std: float = 0.0
    Sleep_Score_14d_std: float = 0.0
    Sleep_Score_dev_from_7d: float = 0.0

    # Rolling Steps
    Steps_Count_3d_mean: float = 0.0
    Steps_Count_7d_mean: float = 0.0
    Steps_Count_14d_mean: float = 0.0
    Steps_Count_7d_std: float = 0.0
    Steps_Count_14d_std: float = 0.0
    Steps_Count_dev_from_7d: float = 0.0

    # Rolling Screen Time
    Screen_Time_Hours_3d_mean: float = 0.0
    Screen_Time_Hours_7d_mean: float = 0.0
    Screen_Time_Hours_14d_mean: float = 0.0
    Screen_Time_Hours_7d_std: float = 0.0
    Screen_Time_Hours_14d_std: float = 0.0
    Screen_Time_Hours_dev_from_7d: float = 0.0

    # Rolling Typing
    Typing_Speed_WPM_3d_mean: float = 0.0
    Typing_Speed_WPM_7d_mean: float = 0.0
    Typing_Speed_WPM_14d_mean: float = 0.0
    Typing_Speed_WPM_7d_std: float = 0.0
    Typing_Speed_WPM_14d_std: float = 0.0
    Typing_Speed_WPM_dev_from_7d: float = 0.0

    # Rolling Pulse Rate
    Pulse_Rate_BPM_3d_mean: float = 0.0
    Pulse_Rate_BPM_7d_mean: float = 0.0
    Pulse_Rate_BPM_14d_mean: float = 0.0
    Pulse_Rate_BPM_7d_std: float = 0.0
    Pulse_Rate_BPM_14d_std: float = 0.0
    Pulse_Rate_BPM_dev_from_7d: float = 0.0

    # Advanced Audio/Visual Features
    Audio_Stress_Score: float = 0.0
    Vocal_Pitch_Variance: float = 0.0
    Speech_Pause_Ratio: float = 0.0
    RMS_Energy: float = 0.0
    Spectral_Centroid: float = 0.0
    MFCC_Mean: float = 0.0
    Facial_Valence_Score: float = 0.0
    Selfie_Smile_Pct: float = 0.0
    Eye_Fatigue_Index: float = 0.0

    def to_array(self) -> np.ndarray:
        # The exact order expected by the model
        feature_names = [
            'Day_of_Week', 'Sleep_Score', 'Steps_Count', 'Screen_Time_Hours', 'Typing_Speed_WPM', 'Pulse_Rate_BPM', 'Unique_POIs',
            'App_Activity_Chrome', 'App_Activity_Figma', 'App_Activity_Instagram', 'App_Activity_Slack', 'App_Activity_Spotify',
            'App_Activity_Terminal', 'App_Activity_TikTok', 'App_Activity_VS Code', 'App_Activity_YouTube',
            'sin_Day_of_Week', 'cos_Day_of_Week',
            'Sleep_Score_3d_mean', 'Sleep_Score_7d_mean', 'Sleep_Score_14d_mean', 'Sleep_Score_7d_std', 'Sleep_Score_14d_std', 'Sleep_Score_dev_from_7d',
            'Steps_Count_3d_mean', 'Steps_Count_7d_mean', 'Steps_Count_14d_mean', 'Steps_Count_7d_std', 'Steps_Count_14d_std', 'Steps_Count_dev_from_7d',
            'Screen_Time_Hours_3d_mean', 'Screen_Time_Hours_7d_mean', 'Screen_Time_Hours_14d_mean', 'Screen_Time_Hours_7d_std', 'Screen_Time_Hours_14d_std', 'Screen_Time_Hours_dev_from_7d',
            'Typing_Speed_WPM_3d_mean', 'Typing_Speed_WPM_7d_mean', 'Typing_Speed_WPM_14d_mean', 'Typing_Speed_WPM_7d_std', 'Typing_Speed_WPM_14d_std', 'Typing_Speed_WPM_dev_from_7d',
            'Pulse_Rate_BPM_3d_mean', 'Pulse_Rate_BPM_7d_mean', 'Pulse_Rate_BPM_14d_mean', 'Pulse_Rate_BPM_7d_std', 'Pulse_Rate_BPM_14d_std', 'Pulse_Rate_BPM_dev_from_7d',
            'Audio_Stress_Score', 'Vocal_Pitch_Variance', 'Speech_Pause_Ratio', 'RMS_Energy', 'Spectral_Centroid', 'MFCC_Mean',
            'Facial_Valence_Score', 'Selfie_Smile_Pct', 'Eye_Fatigue_Index'
        ]

        # We must use model_dump(by_alias=True) so 'App_Activity_VS Code' maps correctly
        data = self.model_dump(by_alias=True)
        return np.array([data[f] for f in feature_names], dtype=np.float64).reshape(1, -1)


class ColabPredictionResponse(BaseModel):
    classifier_prediction: int
    classifier_probabilities: List[float]
    regressor_score: float
    risk_level: str


class ColabMLService:
    """
    Singleton service that loads the Colab-trained joblib models once and performs inference.
    """
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ColabMLService, cls).__new__(cls)
            cls._instance.initialized = False
        return cls._instance

    def __init__(self):
        if self.initialized:
            return

        self.classifier = None
        self.regressor = None
        self.scaler = None
        self._load_models()
        self.initialized = True

    def _load_models(self):
        try:
            import joblib

            # Paths to the authoritative production 57-feature models
            model_dir = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                "resources"
            )

            classifier_path = os.path.join(model_dir, "prism_behavioural_classifier.joblib")
            regressor_path = os.path.join(model_dir, "prism_behavioural_regressor.joblib")
            scaler_path = os.path.join(model_dir, "prism_behavioural_scaler.joblib")

            if os.path.exists(classifier_path):
                self.classifier = joblib.load(classifier_path)
            if os.path.exists(regressor_path):
                self.regressor = joblib.load(regressor_path)
            if os.path.exists(scaler_path):
                self.scaler = joblib.load(scaler_path)

            logger.info(f"Colab models loaded successfully from {model_dir}")
        except Exception as e:
            logger.error(f"Failed to load Colab models: {e}")

    def predict(self, features: ColabModelFeatures) -> ColabPredictionResponse:
        """
        Runs the 57 features through the scaler, classifier, and regressor.
        """
        if self.classifier is None or self.regressor is None or self.scaler is None:
            raise RuntimeError("Colab models are not properly loaded.")

        try:
            # 1. Prepare and scale features
            X_raw = features.to_array()
            X_scaled = self.scaler.transform(X_raw)

            # 2. Classifier Prediction
            clf_pred = int(self.classifier.predict(X_scaled)[0])
            clf_proba = self.classifier.predict_proba(X_scaled)[0].tolist()

            # 3. Regressor Prediction
            reg_score = float(self.regressor.predict(X_scaled)[0])

            # 4. Map to label
            risk_level_map = {
                0: "Normal",
                1: "Habit Shift",
                2: "Behavioural Change / High Risk"
            }
            risk_level = risk_level_map.get(clf_pred, "Unknown")

            return ColabPredictionResponse(
                classifier_prediction=clf_pred,
                classifier_probabilities=clf_proba,
                regressor_score=reg_score,
                risk_level=risk_level
            )
        except Exception as e:
            logger.error(f"Error during Colab model prediction: {e}")
            raise e
