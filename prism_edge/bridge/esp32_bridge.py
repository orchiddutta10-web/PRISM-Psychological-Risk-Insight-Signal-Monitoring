"""
ESP32 PRISM PULSE Bridge — lightweight HTTP server that receives telemetry
from the ESP32 PULSE node and relays it to the PRISM API Server.

The ESP32 posts to this bridge (on the RPi's LAN IP, port 8081),
and the bridge adds the payload to the shared state for the feature packer.
"""

import json
import logging
import threading
from typing import Dict, Any

from prism_edge import config

logger = logging.getLogger(__name__)

shared_state: Dict[str, Any] = {}
state_lock: threading.Lock = threading.Lock()


def _create_app():
    """Lazy Flask app factory — defers import until bridge is started."""
    from flask import Flask, request, jsonify

    app = Flask(__name__)

    def _check_auth(request):
        """Return None if authorized, else an error response."""
        token = config.ESP32_BRIDGE_TOKEN
        if not token:
            return None  # auth disabled (backward compatible)
        auth_header = request.headers.get("Authorization", "")
        if auth_header == f"Bearer {token}":
            return None
        return jsonify({"status": "error", "message": "Unauthorized"}), 401

    @app.route("/api/v1/physio/pulse/ingest", methods=["POST"])
    def pulse_ingest():
        auth_error = _check_auth(request)
        if auth_error is not None:
            return auth_error
        try:
            payload = request.get_json(force=True)
        except Exception:
            return jsonify({"status": "error", "message": "Invalid JSON"}), 400

        required = ["ts_ms", "pulse_raw", "bpm", "g_force", "alert_status"]
        for field in required:
            if field not in payload:
                return jsonify({"status": "error", "message": f"Missing field: {field}"}), 400

        with state_lock:
            shared_state["esp32_pulse"] = {
                "ts_ms": payload["ts_ms"],
                "pulse_raw": payload["pulse_raw"],
                "bpm": payload["bpm"],
                "g_force": payload["g_force"],
                "alert_status": payload["alert_status"],
            }
        logger.debug("ESP32 pulse: bpm=%s g=%.2f status=%s",
                      payload.get("bpm"), payload.get("g_force"), payload.get("alert_status"))
        return jsonify({"status": "accepted"})

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "service": "prism-esp32-bridge"})

    return app


def start_bridge(state_ref: Dict[str, Any], lock: threading.Lock) -> threading.Thread:
    """Start the ESP32 bridge HTTP server in a background thread."""
    global shared_state, state_lock
    shared_state = state_ref
    state_lock = lock

    app = _create_app()
    host = config.ESP32_BRIDGE_HOST
    port = config.ESP32_BRIDGE_PORT

    thread = threading.Thread(
        target=lambda: app.run(host=host, port=port, debug=False, use_reloader=False),
        name="esp32-bridge",
        daemon=True,
    )
    thread.start()
    logger.info("ESP32 bridge listening on %s:%d", host, port)
    return thread
