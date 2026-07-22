import os
import joblib
import numpy as np
from pathlib import Path
from flask import current_app
from app.ml.feature_extractor import compile_model_features

class MLService:
    """
    Service layer to handle ML model loading, feature aggregation,
    and running real-time inferences.

    Supports two model tiers:
      1. scikit-learn classifier  (from .pkl file)
      2. PyTorch fusion classifier (from .pt TorchScript)
    Falls back to heuristic rules when neither is available.
    """
    _instance = None
    
    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(MLService, cls).__new__(cls, *args, **kwargs)
            cls._instance._initialized = False
        return cls._instance
        
    def __init__(self):
        if self._initialized:
            return
        self.model = None               # scikit-learn model
        self.fusion_model = None        # PyTorch fusion model
        self.model_loaded = False
        self.fusion_loaded = False
        self._initialized = True
        
    def load_model(self, model_path: str = None) -> bool:
        """
        Attempts to load a trained model from disk.
        Returns True if successful, False otherwise.
        """
        if not model_path:
            model_path = current_app.config['DEFAULT_MODEL_PATH']
            
        if os.path.exists(model_path):
            try:
                self.model = joblib.load(model_path)
                self.model_loaded = True
                current_app.logger.info(f"ML Model successfully loaded from {model_path}")
                return True
            except Exception as e:
                current_app.logger.error(f"Error loading ML model: {str(e)}")
                self.model_loaded = False
                return False
        else:
            current_app.logger.warning(
                f"Model file not found at {model_path}. Using fallback heuristic logic for inference."
            )
            self.model_loaded = False
            return False

    def load_fusion_model(self) -> bool:
        """
        Optionally load the TorchScript fusion model.
        This is a separate model that fuses phone + biometric data.
        """
        model_path = current_app.config.get('FUSION_MODEL_PATH')
        if not model_path or not os.path.exists(model_path):
            return False
        try:
            import torch
            self.fusion_model = torch.jit.load(str(model_path))
            self.fusion_model.eval()
            self.fusion_loaded = True
            current_app.logger.info(f"Fusion model loaded from {model_path}")
            return True
        except Exception as e:
            current_app.logger.error(f"Error loading fusion model: {e}")
            self.fusion_loaded = False
            return False
            
    def predict_fusion(self, device_id: str = None,
                       daily_tensor: dict = None) -> dict:
        """
        Run inference using the multi-modal fusion model.

        Accepts either:
          - ``device_id`` — fetches the latest daily tensor from the
            phone ingestion buffer + SensorService automatically.
          - ``daily_tensor`` — a pre-built FusedDailyTensor-like dict
            with keys: keystroke, app, gps, biometric_ts, biometric_feat.

        Returns a prediction dict matching the ``predict_state`` format
        for backward compatibility with the dashboard.
        """
        if not self.fusion_loaded and not self.load_fusion_model():
            # Fall back to standard bio-only prediction
            from app.services.sensor_service import SensorService
            svc = SensorService()
            reading = svc.get_latest_reading()
            from app.services.sensor_service import SensorService as SS
            ss = SS()
            hist = ss.get_buffered_readings(count=30)
            if len(hist) < 5:
                for _ in range(30):
                    ss.get_latest_reading()
                hist = ss.get_buffered_readings(count=30)
            import numpy as np
            gsr_vals = np.array([r["gsr_microsiemens"] for r in hist])
            ibi_vals = np.array([r["inter_beat_interval_ms"] for r in hist])
            from app.ml.feature_extractor import extract_gsr_features, extract_hrv_features
            gsr_f = extract_gsr_features(gsr_vals)
            hrv_f = extract_hrv_features(ibi_vals)
            feats = compile_model_features(gsr_f, hrv_f)
            return self.predict_state(feats)

        try:
            import torch
            import numpy as np
            from app.ml.behavioral_schema import IDX_TO_CLASS

            if daily_tensor is None and device_id:
                from app.api.v1.phone import assemble_daily_tensor
                tensor = assemble_daily_tensor(device_id)
                if tensor is None:
                    raise ValueError(f"Insufficient phone data for {device_id}")
                daily_tensor = {
                    "keystroke":    tensor.keystroke,
                    "app":          tensor.app,
                    "gps":          tensor.gps,
                    "biometric_ts": tensor.biometric,
                }
                # Build static feature vector
                from app.ml.feature_extractor import extract_gsr_features as eg, extract_hrv_features as eh
                bio_mean = tensor.biometric.mean(axis=0)
                gsr_f = eg(np.array([bio_mean[1]]))
                hrv_f = eh(np.array([60000.0 / max(bio_mean[0], 30)]))
                feats = compile_model_features(gsr_f, hrv_f)
                daily_tensor["biometric_feat"] = np.array([
                    feats.get("mean_hr", 70.0), feats.get("mean_gsr", 3.0),
                    feats.get("std_gsr", 0.5), feats.get("mean_scl", 3.0),
                    feats.get("max_scr", 0.0), feats.get("sdnn", 45.0),
                    feats.get("rmssd", 35.0),
                ], dtype=np.float32)
                daily_tensor["biometric_feat"][0] = bio_mean[0]

            if daily_tensor is None:
                raise ValueError("Either device_id or daily_tensor is required.")

            # Normalise each modality
            from app.ml.fusion_model import BehavioralPreprocessor
            preproc = BehavioralPreprocessor()
            from app.ml.behavioral_schema import KEYSTROKE_FEATURES, APP_FEATURES, GPS_FEATURES, BIOMETRIC_FEATURES

            _names_map = {
                "keystroke": KEYSTROKE_FEATURES,
                "app": APP_FEATURES,
                "gps": GPS_FEATURES,
                "biometric_ts": BIOMETRIC_FEATURES,
            }

            inputs = {}
            for mod in ["keystroke", "app", "gps", "biometric_ts"]:
                arr = daily_tensor[mod]
                if len(arr.shape) == 2:
                    arr = preproc.transform_daily(arr, _names_map[mod])
                inputs[mod] = torch.from_numpy(arr).unsqueeze(0).float()

            static = daily_tensor.get("biometric_feat", np.zeros(7, dtype=np.float32))
            inputs["biometric_feat"] = torch.from_numpy(static).unsqueeze(0).float()

            with torch.no_grad():
                out = self.fusion_model(inputs)
                probs = out["probabilities"][0].numpy()
                pred_idx = int(probs.argmax())
                pred_class = IDX_TO_CLASS.get(pred_idx, "UNKNOWN")

            return {
                "predicted_state": pred_class,
                "confidence": round(float(probs[pred_idx]), 2),
                "probabilities": {
                    IDX_TO_CLASS[i]: round(float(probs[i]), 2)
                    for i in range(len(probs))
                },
                "engine": "Fusion Model (PyTorch)",
            }

        except Exception as e:
            current_app.logger.error(f"Fusion inference failed: {e}")
            # Fall back
            from app.services.sensor_service import SensorService
            ss = SensorService()
            hist = ss.get_buffered_readings(count=30)
            import numpy as np
            gsr_vals = np.array([r["gsr_microsiemens"] for r in hist])
            ibi_vals = np.array([r["inter_beat_interval_ms"] for r in hist])
            from app.ml.feature_extractor import extract_gsr_features, extract_hrv_features
            gsr_f = extract_gsr_features(gsr_vals)
            hrv_f = extract_hrv_features(ibi_vals)
            feats = compile_model_features(gsr_f, hrv_f)
            return self.predict_state(feats)

    def predict_state(self, features: dict) -> dict:
        """
        Runs inference on the provided biosensor feature dict.
        Uses the loaded ML model if available; otherwise falls back to physiological heuristic rules.
        """
        # Ensure model is checked/loaded if not already done
        if not self.model_loaded:
            self.load_model()
            
        feature_names = ["mean_gsr", "std_gsr", "mean_scl", "max_scr", "mean_hr", "sdnn", "rmssd"]
        feature_vector = [features.get(k, 0.0) for k in feature_names]
        
        # Class mapping
        classes = ["REST", "EXCITED", "STRESSED"]
        
        if self.model_loaded and self.model is not None:
            # Predict using scikit-learn model
            try:
                prediction_idx = int(self.model.predict([feature_vector])[0])
                probabilities = self.model.predict_proba([feature_vector])[0].tolist()
                
                return {
                    "predicted_state": classes[prediction_idx],
                    "confidence": float(probabilities[prediction_idx]),
                    "probabilities": {classes[i]: float(probabilities[i]) for i in range(len(classes))},
                    "engine": "ML Model"
                }
            except Exception as e:
                current_app.logger.error(f"ML Inference failed, using fallback: {str(e)}")
                # Fall through to fallback heuristic logic
                
        # --- Fallback Heuristic Classifier (Bio-rules) ---
        mean_hr = features.get("mean_hr", 70.0)
        rmssd = features.get("rmssd", 40.0)
        mean_gsr = features.get("mean_gsr", 3.0)
        
        # High heart rate + low heart rate variability (RMSSD) + elevated GSR = high stress probability
        stress_score = 0.0
        
        # Heart rate factor
        if mean_hr > 95:
            stress_score += 0.4
        elif mean_hr > 80:
            stress_score += 0.2
            
        # HRV factor (lower RMSSD indicates higher stress/sympathetic activation)
        if rmssd < 25:
            stress_score += 0.4
        elif rmssd < 35:
            stress_score += 0.2
            
        # GSR factor
        if mean_gsr > 8.0:
            stress_score += 0.3
        elif mean_gsr > 5.0:
            stress_score += 0.15
            
        # Normalize and map score
        stress_prob = min(0.99, max(0.01, stress_score))
        
        # Determine state prediction based on features
        if stress_prob >= 0.55:
            pred = "STRESSED"
            probs = {"REST": float(1.0 - stress_prob - 0.05), "EXCITED": 0.05, "STRESSED": float(stress_prob)}
        elif mean_hr > 85 and mean_gsr > 4.5:
            pred = "EXCITED"
            probs = {"REST": 0.20, "EXCITED": 0.60, "STRESSED": 0.20}
        else:
            pred = "REST"
            probs = {"REST": float(1.0 - stress_prob), "EXCITED": 0.10, "STRESSED": float(stress_prob - 0.10 if stress_prob > 0.1 else 0.0)}
            
        # Guarantee probability sums to 1.0
        total_p = sum(probs.values())
        probs = {k: v / total_p for k, v in probs.items()}
            
        return {
            "predicted_state": pred,
            "confidence": round(probs[pred], 2),
            "probabilities": {k: round(v, 2) for k, v in probs.items()},
            "engine": "Heuristic Rule-Engine (Fallback)"
        }
