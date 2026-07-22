import time
from flask import Blueprint, jsonify, request
from app.services.sensor_service import SensorService
from app.core.exceptions import InvalidPayloadException

hardware_bp = Blueprint('hardware', __name__)
sensor_service = SensorService()


@hardware_bp.route('/stream', methods=['POST'])
def ingest_hardware_stream():
    """
    Accepts batched physiological readings from a remote hardware node
    (ESP32/ESP8266) and feeds them into the local sensor buffer so the
    existing dashboard and ML pipeline can consume them transparently.
    """
    body = request.get_json(silent=True)
    if not body:
        raise InvalidPayloadException("Request body must be valid JSON.")

    device_id = body.get("device_id", "unknown")
    readings = body.get("readings")
    if not isinstance(readings, list) or len(readings) == 0:
        raise InvalidPayloadException("'readings' must be a non-empty array.")

    ingested = 0
    for r in readings:
        hr = r.get("hr_bpm", 0.0)
        gsr = r.get("gsr_us", 0.0)
        ibi = r.get("ibi_ms", 0.0)
        ts = r.get("ts", time.time())

        reading = {
            "timestamp":             ts,
            "state":                 "MONITORED",
            "heart_rate_bpm":        round(hr, 2),
            "inter_beat_interval_ms": round(ibi, 2) if ibi else round(60000.0 / hr, 2) if hr > 0 else 0.0,
            "gsr_microsiemens":      round(gsr, 4),
            "eda_tonic_scl":         round(r.get("gsr_tonic_us", gsr), 4),
            "eda_phasic_scr":        round(r.get("gsr_phasic_us", 0.0), 4),
        }

        sensor_service.data_history.append(reading)
        if len(sensor_service.data_history) > sensor_service.max_history_len:
            sensor_service.data_history.pop(0)
        ingested += 1

    sensor_service.get_latest_reading()
    _log_anomalies(body, device_id)
    _try_ml_update(body, device_id)

    return jsonify({
        "status":   "success",
        "device":   device_id,
        "ingested": ingested,
        "message":  f"Ingested {ingested} hardware readings from {device_id}."
    }), 200


def _log_anomalies(body: dict, device_id: str):
    try:
        from app.services.log_service import LogService
        logs = LogService()

        for r in body.get("readings", []):
            hr = r.get("hr_bpm", 0)
            gsr = r.get("gsr_us", 0)
            if hr > 110:
                logs.add_anomaly("HIGH_HEART_RATE",
                                 f"[{device_id}] HR {hr:.0f} BPM",
                                 severity="warning")
            if hr < 40 and hr > 0:
                logs.add_anomaly("LOW_HEART_RATE",
                                 f"[{device_id}] HR {hr:.0f} BPM")
            if gsr > 10.0:
                logs.add_anomaly("HIGH_GSR",
                                 f"[{device_id}] GSR {gsr:.2f} µS",
                                 severity="warning")
            if gsr > 15.0:
                logs.add_anomaly("STRESS_PEAK",
                                 f"[{device_id}] GSR spike {gsr:.2f} µS",
                                 severity="critical")
    except Exception:
        pass


def _try_ml_update(body: dict, device_id: str):
    try:
        import numpy as np
        from app.services.ml_service import MLService
        from app.ml.feature_extractor import extract_gsr_features, extract_hrv_features, compile_model_features

        ml = MLService()
        readings = body.get("readings", [])
        if len(readings) < 5:
            return

        gsr_vals = np.array([r.get("gsr_us", 0) for r in readings])
        ibi_vals = np.array([
            r.get("ibi_ms", 60000.0 / r["hr_bpm"])
            if r.get("hr_bpm", 0) > 0 else 600.0
            for r in readings
        ])
        tonic = np.array([r.get("gsr_tonic_us", gsr_vals[i]) for i, r in enumerate(readings)])
        phasic = np.array([r.get("gsr_phasic_us", 0.0) for r in readings])

        gsr_feat = extract_gsr_features(gsr_vals, tonic, phasic)
        hrv_feat = extract_hrv_features(ibi_vals)
        features = compile_model_features(gsr_feat, hrv_feat)
        pred = ml.predict_state(features)

        from app.services.log_service import LogService
        LogService().add_voice_log(
            f"hardware_stream:{device_id}",
            f"Prediction: {pred['predicted_state']} ({pred['confidence']:.0%})",
            intent="hardware_ml"
        )
    except Exception:
        pass
