from flask import Blueprint, jsonify, request
import numpy as np
from app.services.sensor_service import SensorService
from app.services.ml_service import MLService
from app.ml.feature_extractor import extract_gsr_features, extract_hrv_features, compile_model_features
from app.core.exceptions import InvalidPayloadException

ml_bp = Blueprint('ml', __name__)
sensor_service = SensorService()
ml_service = MLService()

@ml_bp.route('/predict', methods=['POST', 'GET'])
def predict_current_state():
    """
    Performs real-time state inference.
    If POST, parses manual features provided in request body.
    If GET, extracts features dynamically from the last 30 buffered sensor readings.
    """
    if request.method == 'POST':
        # Direct prediction with custom feature values passed
        body = request.get_json(silent=True) or {}
        if not body:
            raise InvalidPayloadException("Request body cannot be empty for POST.")
            
        prediction = ml_service.predict_state(body)
        return jsonify({
            "status": "success",
            "features_used": body,
            "prediction": prediction
        }), 200
        
    else:
        # GET - Dynamic extraction from buffered sensor stream
        # Fetch the last 30 readings (approx 3 seconds of data at 10Hz)
        history = sensor_service.get_buffered_readings(count=30)
        
        # If the buffer is empty, seed it with a single mock request to ensure it works
        if len(history) < 5:
            # Seed some samples
            for _ in range(30):
                sensor_service.get_latest_reading()
            history = sensor_service.get_buffered_readings(count=30)
            
        # Extract features
        gsr_vals = np.array([r["gsr_microsiemens"] for r in history])
        tonic_vals = np.array([r["eda_tonic_scl"] for r in history])
        phasic_vals = np.array([r["eda_phasic_scr"] for r in history])
        ibi_vals = np.array([r["inter_beat_interval_ms"] for r in history])
        
        gsr_features = extract_gsr_features(gsr_vals, tonic_vals, phasic_vals)
        hrv_features = extract_hrv_features(ibi_vals)
        
        model_features = compile_model_features(gsr_features, hrv_features)
        prediction = ml_service.predict_state(model_features)
        
        return jsonify({
            "status": "success",
            "samples_analyzed": len(history),
            "features": model_features,
            "prediction": prediction
        }), 200
