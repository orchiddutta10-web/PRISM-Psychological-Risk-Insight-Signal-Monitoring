from flask import Blueprint, jsonify, request
from app.services.sensor_service import SensorService
from app.core.exceptions import InvalidPayloadException

sensors_bp = Blueprint('sensors', __name__)
sensor_service = SensorService()

@sensors_bp.route('/latest', methods=['GET'])
def get_latest():
    """
    Get the latest instantaneous reading from the sensors (or simulator).
    """
    data = sensor_service.get_latest_reading()
    return jsonify({
        "status": "success",
        "data": data
    }), 200

@sensors_bp.route('/wave', methods=['GET'])
def get_wave():
    """
    Get a raw simulated PPG pulse wave for signal processing test.
    Query Param: duration (seconds, default 5.0)
    """
    duration = request.args.get('duration', default=5.0, type=float)
    if duration <= 0 or duration > 60:
        raise InvalidPayloadException("Duration must be between 1 and 60 seconds.")
        
    wave_data = sensor_service.get_raw_waves(duration_sec=duration)
    return jsonify({
        "status": "success",
        "data": wave_data
    }), 200

@sensors_bp.route('/state', methods=['POST'])
def update_state():
    """
    Manually override the physiological state of the simulator.
    Body: {"state": "REST" | "STRESSED" | "EXCITED"}
    """
    body = request.get_json(silent=True) or {}
    state = body.get('state')
    
    if not state:
        raise InvalidPayloadException("State parameter is required.")
        
    success = sensor_service.change_user_state(state.upper())
    if not success:
        raise InvalidPayloadException("Invalid state. Allowed states: REST, STRESSED, EXCITED")
        
    return jsonify({
        "status": "success",
        "message": f"Simulator state updated to {state.upper()}."
    }), 200

@sensors_bp.route('/history', methods=['GET'])
def get_history():
    """
    Retrieve the last N buffered mock sensor readings.
    Query Param: count (default 50)
    """
    count = request.args.get('count', default=50, type=int)
    if count <= 0 or count > 1000:
        raise InvalidPayloadException("Count must be between 1 and 1000.")
        
    history = sensor_service.get_buffered_readings(count=count)
    return jsonify({
        "status": "success",
        "count": len(history),
        "data": history
    }), 200
