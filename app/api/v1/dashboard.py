from flask import Blueprint, jsonify, request
from app.services.sensor_service import SensorService
from app.services.ml_service import MLService
from app.services.log_service import LogService
from app.ml.feature_extractor import extract_gsr_features, extract_hrv_features, compile_model_features
import numpy as np

dashboard_bp = Blueprint('dashboard', __name__)
sensor_service = SensorService()
ml_service     = MLService()
log_service    = LogService()


@dashboard_bp.route('/status', methods=['GET'])
def get_status():
    """
    Returns the current live sensor snapshot + ML prediction in one call.
    Used by the dashboard to refresh the status cards every second.
    """
    reading = sensor_service.get_latest_reading()

    # Build features from rolling buffer
    history = sensor_service.get_buffered_readings(count=30)
    if len(history) < 5:
        for _ in range(30):
            sensor_service.get_latest_reading()
        history = sensor_service.get_buffered_readings(count=30)

    gsr_vals = np.array([r["gsr_microsiemens"]       for r in history])
    ibi_vals = np.array([r["inter_beat_interval_ms"]  for r in history])

    gsr_feat   = extract_gsr_features(gsr_vals)
    hrv_feat   = extract_hrv_features(ibi_vals)
    features   = compile_model_features(gsr_feat, hrv_feat)
    prediction = ml_service.predict_state(features)

    # Auto-log anomalies when thresholds are breached
    state = prediction["predicted_state"]
    if state == "STRESSED" and prediction["confidence"] > 0.7:
        log_service.add_anomaly(
            "STRESS_PEAK",
            f"State classified as STRESSED (confidence {int(prediction['confidence']*100)}%)",
            severity="critical"
        )
    elif reading["heart_rate_bpm"] > 100:
        log_service.add_anomaly(
            "HIGH_HEART_RATE",
            f"Heart rate peaked at {reading['heart_rate_bpm']:.0f} BPM",
            severity="warning"
        )

    return jsonify({
        "status":     "success",
        "sensor":     reading,
        "features":   features,
        "prediction": prediction
    }), 200


@dashboard_bp.route('/stream', methods=['GET'])
def get_stream_data():
    """
    Returns the last N buffered sensor readings as time-series arrays for Chart.js.
    Query param: count (default 60, max 500)
    """
    count = min(max(request.args.get('count', default=60, type=int), 1), 500)

    # Ensure buffer has enough readings
    while len(sensor_service.data_history) < count:
        sensor_service.get_latest_reading()

    history = sensor_service.get_buffered_readings(count=count)

    return jsonify({
        "status":     "success",
        "count":      len(history),
        "labels":     [round(r["timestamp"], 2)             for r in history],
        "heart_rate": [round(r["heart_rate_bpm"], 2)        for r in history],
        "gsr":        [round(r["gsr_microsiemens"], 4)      for r in history],
        "ibi":        [round(r["inter_beat_interval_ms"], 2) for r in history],
    }), 200


@dashboard_bp.route('/anomalies', methods=['GET'])
def get_anomalies():
    """Returns the most recent anomaly and alert log entries."""
    limit = request.args.get('limit', default=20, type=int)
    return jsonify({
        "status": "success",
        "data":   log_service.get_anomalies(limit=limit)
    }), 200


@dashboard_bp.route('/voice-logs', methods=['GET'])
def get_voice_logs():
    """Returns the most recent voice command interaction logs."""
    limit = request.args.get('limit', default=20, type=int)
    return jsonify({
        "status": "success",
        "data":   log_service.get_voice_logs(limit=limit)
    }), 200
