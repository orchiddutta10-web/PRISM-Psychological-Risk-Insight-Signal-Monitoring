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
                return (
                    jsonify({"status": "error", "message": f"Missing field: {field}"}),
                    400,
                )

        with state_lock:
            shared_state["esp32_pulse"] = {
                "ts_ms": payload["ts_ms"],
                "pulse_raw": payload["pulse_raw"],
                "bpm": payload["bpm"],
                "g_force": payload["g_force"],
                "alert_status": payload["alert_status"],
            }
        logger.debug(
            "ESP32 pulse: bpm=%s g=%.2f status=%s",
            payload.get("bpm"),
            payload.get("g_force"),
            payload.get("alert_status"),
        )
        return jsonify({"status": "accepted"})

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "service": "prism-esp32-bridge"})

    @app.route("/latest", methods=["GET"])
    def latest():
        """Return the most recent ESP32 pulse reading."""
        with state_lock:
            data = shared_state.get("esp32_pulse", None)
        if data is None:
            return jsonify({"status": "waiting", "message": "No data received from ESP32 yet"})
        return jsonify({"status": "ok", "data": data})

    @app.route("/", methods=["GET"])
    def dashboard():
        """Live-updating HTML dashboard showing ESP32 data."""
        return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PRISM PULSE Live</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #0d1117; color: #c9d1d9; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 16px; padding: 32px; max-width: 480px; width: 90%; text-align: center; }
  h1 { font-size: 1.5em; margin-bottom: 8px; color: #58a6ff; }
  .subtitle { color: #8b949e; font-size: 0.85em; margin-bottom: 24px; }
  .row { display: flex; justify-content: space-between; padding: 12px 16px; background: #0d1117; border-radius: 8px; margin-bottom: 8px; }
  .label { color: #8b949e; }
  .value { font-weight: 700; font-size: 1.1em; }
  .bpm { color: #f78166; }
  .gforce { color: #d2a8ff; }
  .raw { color: #7ee787; }
  .status { color: #58a6ff; }
  .time { color: #8b949e; font-size: 0.8em; margin-top: 16px; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
  .dot.online { background: #3fb950; box-shadow: 0 0 8px #3fb950; }
  .dot.offline { background: #f85149; }
  .badge { display: flex; align-items: center; justify-content: center; margin-bottom: 16px; gap: 6px; }
</style>
</head>
<body>
<div class="card">
  <div class="badge"><span class="dot online" id="statusDot"></span><span id="statusText">Connected</span></div>
  <h1>&#x1F493; PRISM PULSE</h1>
  <div class="subtitle">ESP32 | 192.168.180.71</div>
  <div class="row"><span class="label">&#x2764;&#xFE0F; Heart Rate</span><span class="value bpm" id="bpm">--</span></div>
  <div class="row"><span class="label">&#x1F300; G-Force</span><span class="value gforce" id="gforce">--</span></div>
  <div class="row"><span class="label">&#x1F4A1; Raw Signal</span><span class="value raw" id="raw">--</span></div>
  <div class="row"><span class="label">&#x26A0;&#xFE0F; Alert</span><span class="value status" id="alert">--</span></div>
  <div class="time" id="timestamp">Waiting for data...</div>
</div>
<script>
async function fetchData() {
  try {
    const r = await fetch('/latest');
    const j = await r.json();
    if (j.status === 'ok' && j.data) {
      const d = j.data;
      document.getElementById('bpm').textContent = d.bpm + ' BPM';
      document.getElementById('gforce').textContent = parseFloat(d.g_force).toFixed(2) + ' G';
      document.getElementById('raw').textContent = d.pulse_raw;
      document.getElementById('alert').textContent = d.alert_status;
      document.getElementById('timestamp').textContent = 'Updated: ' + new Date(d.ts_ms).toLocaleTimeString();
      document.getElementById('statusDot').className = 'dot online';
      document.getElementById('statusText').textContent = 'Connected';
    }
  } catch(e) {
    document.getElementById('statusDot').className = 'dot offline';
    document.getElementById('statusText').textContent = 'Offline';
  }
}
fetchData();
setInterval(fetchData, 2000);
</script>
</body>
</html>"""

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
        target=lambda: app.run(host=host, port=port, debug=False, use_reloader=False, threaded=True),
        name="esp32-bridge",
        daemon=True,
    )
    thread.start()
    logger.info("ESP32 bridge listening on %s:%d", host, port)
    return thread
