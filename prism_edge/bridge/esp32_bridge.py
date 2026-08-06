"""
ESP32 PRISM PULSE Bridge — lightweight HTTP server that receives telemetry
from the ESP32 PULSE node and relays it to the PRISM API Server.

The ESP32 posts to this bridge (on the RPi's LAN IP, port 8081),
and the bridge adds the payload to the shared state for the feature packer.

Also exposes a low-latency MJPEG camera stream at /camera/stream so the
dashboard can display live video without accessing the vision pipeline.
"""

import logging
import threading
import time
from typing import Any, Dict, Optional

from prism_edge import config

logger = logging.getLogger(__name__)

shared_state: Dict[str, Any] = {}
state_lock: threading.Lock = threading.Lock()

# Optional camera reference, populated via start_bridge(..., camera=...)
_camera_instance: Any = None


def _create_app():
    """Lazy Flask app factory — defers import until bridge is started."""
    from flask import Flask, request, jsonify, Response

    app = Flask(__name__)

    @app.after_request
    def add_cors(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return response

    @app.route("/api/v1/physio/pulse/ingest", methods=["POST", "OPTIONS"])
    def pulse_ingest():
        if request.method == "OPTIONS":
            return "", 200
        # Optional shared-secret auth (backward-compatible when token is empty)
        if config.ESP32_BRIDGE_TOKEN:
            auth_header = request.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                return jsonify({"status": "error", "message": "Missing Authorization header"}), 401
            if auth_header[7:] != config.ESP32_BRIDGE_TOKEN:
                return jsonify({"status": "error", "message": "Invalid bridge token"}), 403

        try:
            payload = request.get_json(force=True)
        except Exception:
            return jsonify({"status": "error", "message": "Invalid JSON"}), 400

        required = ["ts_ms", "pulse_raw", "bpm", "g_force", "alert_status"]
        for field in required:
            if field not in payload:
                return jsonify({"status": "error", "message": f"Missing field: {field}"}), 400

        try:
            ts_ms = int(payload["ts_ms"])
            pulse_raw = int(payload["pulse_raw"])
            bpm = float(payload["bpm"])
            g_force = float(payload["g_force"])
            alert_status = str(payload["alert_status"])[:32]
        except (TypeError, ValueError) as exc:
            return jsonify({"status": "error", "message": f"Invalid field type: {exc}"}), 400

        if not (0 <= bpm <= 300):
            return jsonify({"status": "error", "message": "bpm out of range"}), 400
        if not (0 <= g_force <= 50):
            return jsonify({"status": "error", "message": "g_force out of range"}), 400

        with state_lock:
            shared_state["esp32_pulse"] = {
                "ts_ms": ts_ms,
                "pulse_raw": pulse_raw,
                "bpm": bpm,
                "g_force": g_force,
                "alert_status": alert_status,
            }
        logger.debug("ESP32 pulse: bpm=%s g=%.2f status=%s",
                      payload.get("bpm"), payload.get("g_force"), payload.get("alert_status"))
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
            resp = jsonify({"status": "waiting", "message": "No data received from ESP32 yet"})
        else:
            resp = jsonify({"status": "ok", "data": data})
        resp.headers.add('Access-Control-Allow-Origin', '*')
        return resp

    @app.route("/camera/status", methods=["GET"])
    def camera_status():
        """Return whether a camera is attached and ready to stream."""
        if _camera_instance is None:
            return jsonify({"status": "error", "message": "Camera instance not registered"}), 503
        try:
            import cv2
            cv2  # silence lint
        except ImportError:
            return jsonify({"status": "error", "message": "OpenCV not available"}), 503
        return jsonify({
            "status": "ok" if _camera_instance.connected else "error",
            "connected": _camera_instance.connected,
            "frame_count": _camera_instance.frame_count,
        })

    @app.route("/camera/stream", methods=["GET"])
    def camera_stream():
        """MJPEG stream from the shared camera instance."""
        if _camera_instance is None:
            return jsonify({"status": "error", "message": "Camera not available"}), 503

        try:
            import cv2
        except ImportError:
            return jsonify({"status": "error", "message": "OpenCV not available"}), 503

        # Wait briefly for the camera to produce its first frame
        for _ in range(50):
            frame, _ = _camera_instance.read()
            if frame is not None:
                break
            time.sleep(0.05)
        else:
            return jsonify({"status": "error", "message": "Camera not producing frames"}), 503

        min_frame_interval = 1.0 / max(config.CAMERA_FPS, 1)
        last_frame_time = 0.0

        def generate():
            nonlocal last_frame_time
            while True:
                now = time.time()
                elapsed = now - last_frame_time
                if elapsed < min_frame_interval:
                    time.sleep(min_frame_interval - elapsed)
                    now = time.time()

                frame, _ = _camera_instance.read()
                if frame is None:
                    continue
                ret, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                if not ret:
                    continue
                last_frame_time = now
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
                )

        return Response(
            generate(),
            mimetype="multipart/x-mixed-replace; boundary=frame",
            headers={
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
            },
        )

    @app.route("/", methods=["GET"])
    def dashboard():
        """Live dashboard: MJPEG camera stream + ESP32 pulse data."""
        return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PRISM PULSE — Live Monitor</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; background: #0A0A0A; color: #FFFFFF; min-height: 100vh; }
  .navbar { height: 56px; background: #111111; border-bottom: 1px solid #2C2C2E; display: flex; align-items: center; padding: 0 24px; gap: 12px; position: sticky; top: 0; z-index: 100; }
  .navbar .logo { display: flex; align-items: center; gap: 8px; }
  .navbar .logo .ring { width: 24px; height: 24px; position: relative; }
  .navbar .logo .ring::before { content:''; position: absolute; inset: 0; border-radius: 50%; border: 2px solid #fff; }
  .navbar .logo .ring::after { content:''; position: absolute; top: 5px; left: 5px; width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid #fff; opacity: 0.35; }
  .navbar .title { font-weight: 800; font-size: 15px; letter-spacing: 0.14em; }
  .navbar .tag { font-size: 10px; color: #8E8E93; letter-spacing: 0.1em; text-transform: uppercase; margin-left: auto; }
  .navbar .live-dot { width: 7px; height: 7px; border-radius: 50%; background: #16A34A; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
  .main { display: flex; gap: 20px; padding: 20px; height: calc(100vh - 56px); }
  .camera-panel { flex: 1; min-width: 0; background: #111111; border-radius: 16px; border: 1px solid #2C2C2E; overflow: hidden; position: relative; }
  .camera-panel img { width: 60%; height: 100%; object-fit: contain; }
  .camera-panel .label { position: absolute; top: 12px; left: 14px; font-size: 10px; font-weight: 700; color: #8E8E93; letter-spacing: 0.1em; text-transform: uppercase; background: rgba(0,0,0,0.6); padding: 4px 10px; border-radius: 6px; }
  .pulse-panel { width: 340px; flex-shrink: 0; display: flex; flex-direction: column; gap: 14px; }
  .pulse-card { background: #111111; border-radius: 16px; border: 1px solid #2C2C2E; padding: 20px; }
  .pulse-card .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
  .pulse-card .header .title { font-size: 10px; font-weight: 700; color: #8E8E93; letter-spacing: 0.12em; text-transform: uppercase; }
  .pulse-card .header .status { font-size: 10px; font-weight: 700; display: flex; align-items: center; gap: 5px; }
  .pulse-card .header .status.online { color: #16A34A; }
  .pulse-card .header .status.offline { color: #DC2626; }
  .metric-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; background: #0A0A0A; border-radius: 10px; margin-bottom: 8px; }
  .metric-row .lbl { font-size: 11px; color: #6B6B6B; }
  .metric-row .val { font-weight: 700; font-size: 1.1em; }
  .metric-row .val.bpm { color: #F87171; }
  .metric-row .val.g { color: #C084FC; }
  .metric-row .val.raw { color: #4ADE80; }
  .metric-row .val.alert { color: #FBBF24; }
  .metric-row .val.alert.warn { color: #F97316; }
  .metric-big { text-align: center; padding: 8px 0; }
  .metric-big .big-val { font-size: 52px; font-weight: 800; font-family: 'Space Grotesk', 'Inter', monospace; letter-spacing: -0.03em; line-height: 1; }
  .metric-big .big-val.warn { color: #F97316; }
  .metric-big .big-val.ok { color: #22C55E; }
  .metric-big .big-unit { font-size: 14px; color: #6B6B6B; margin-top: 4px; }
  .footer-time { font-size: 10px; color: #48484A; text-align: center; }
  .alert-box { padding: 12px 16px; border-radius: 10px; text-align: center; margin-top: 8px; }
  .alert-box.warn { background: #1F1410; border: 1px solid #F97316; color: #F97316; }
  .alert-box.ok { background: #0F1A10; border: 1px solid #22C55E; color: #22C55E; }
  @media (max-width: 768px) { .main { flex-direction: column; } .pulse-panel { width: 100%; } }
</style>
</head>
<body>
<div class="navbar">
  <div class="logo">
    <div class="ring"></div>
    <span class="title">PRISM</span>
  </div>
  <span class="tag">ESP32 PULSE MONITOR</span>
  <div class="live-dot" id="liveDot"></div>
  <span style="font-size:10px;color:#6B6B6B;margin-left:3px" id="liveLabel">LIVE</span>
  <span style="flex:1"></span>
  <span style="font-size:10px;color:#48484A">Edge Node — 192.168.180.71</span>
</div>
<div class="main">
  <div class="camera-panel">
    <span class="label">LIVE CAMERA</span>
    <img src="/camera/stream" alt="Camera stream" />
  </div>
  <div class="pulse-panel">
    <div class="pulse-card">
      <div class="header">
        <span class="title">ESP32 SENSOR DATA</span>
        <span class="status online" id="connStatus"><span id="connDot">●</span> <span id="connLabel">ONLINE</span></span>
      </div>
      <div class="metric-big">
        <div class="big-val ok" id="bpmVal">--</div>
        <div class="big-unit">HEART RATE · BPM</div>
      </div>
      <div class="metric-row">
        <span class="lbl">G-Force</span>
        <span class="val g" id="gVal">--</span>
      </div>
      <div class="metric-row">
        <span class="lbl">Raw Signal</span>
        <span class="val raw" id="rawVal">--</span>
      </div>
      <div class="metric-row">
        <span class="lbl">Alert Status</span>
        <span class="val alert" id="alertVal">--</span>
      </div>
      <div class="alert-box ok" id="alertBox">● System Normal</div>
      <div class="footer-time" id="timestamp">Waiting for data...</div>
    </div>
    <div class="pulse-card" style="flex:1; display:flex; flex-direction:column; justify-content:center; text-align:center">
      <p style="font-size:10px;font-weight:700;color:#8E8E93;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:12px">SIGNAL CHAIN</p>
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;color:#48484A;font-size:12px">
        <span>Pulse Sensor</span><span>→</span><span>ESP32 ADC</span><span>→</span><span>Peak Detect</span><span>→</span>
        <span>BPM Calc</span><span>→</span><span style="color:#8E8E93">Bridge</span>
      </div>
      <div style="margin-top:16px;font-size:11px;color:#48484A">
        MPU6050 Accelerometer · ISD1820 Alert Trigger
      </div>
    </div>
  </div>
</div>
<script>
(async function() {
  const bpmEl = document.getElementById('bpmVal');
  const gEl = document.getElementById('gVal');
  const rawEl = document.getElementById('rawVal');
  const alertEl = document.getElementById('alertVal');
  const alertBox = document.getElementById('alertBox');
  const tsEl = document.getElementById('timestamp');
  const connDot = document.getElementById('connDot');
  const connLabel = document.getElementById('connLabel');
  const connStatus = document.getElementById('connStatus');
  const liveDot = document.getElementById('liveDot');
  const liveLabel = document.getElementById('liveLabel');

  async function poll() {
    try {
      const r = await fetch('/latest');
      const j = await r.json();
      if (j.status === 'ok' && j.data && j.data.bpm !== undefined) {
        const d = j.data;
        bpmEl.textContent = d.bpm;
        bpmEl.className = 'big-val ' + (d.bpm >= 110 ? 'warn' : 'ok');
        gEl.textContent = parseFloat(d.g_force).toFixed(2) + ' G';
        rawEl.textContent = d.pulse_raw;
        const isWarn = d.alert_status && d.alert_status.startsWith('WARNING');
        alertEl.textContent = d.alert_status || 'OK';
        alertEl.className = 'val alert' + (isWarn ? ' warn' : '');
        alertBox.textContent = isWarn ? '⚠ ' + d.alert_status : '● System Normal';
        alertBox.className = 'alert-box ' + (isWarn ? 'warn' : 'ok');
        tsEl.textContent = 'Updated: ' + new Date().toLocaleTimeString();
        connDot.textContent = '●';
        connLabel.textContent = 'ONLINE';
        connStatus.className = 'status online';
        liveDot.style.background = '#16A34A';
        liveLabel.textContent = 'LIVE';
      }
    } catch(e) {
      connDot.textContent = '●';
      connLabel.textContent = 'OFFLINE';
      connStatus.className = 'status offline';
      liveDot.style.background = '#DC2626';
      liveLabel.textContent = 'DOWN';
    }
  }
  poll();
  setInterval(poll, 2000);
})();
</script>
</body>
</html>"""

    return app


def start_bridge(
    state_ref: Dict[str, Any],
    lock: threading.Lock,
    camera: Optional[Any] = None,
) -> threading.Thread:
    """Start the ESP32 bridge HTTP server in a background thread."""
    global shared_state, state_lock, _camera_instance
    shared_state = state_ref
    state_lock = lock
    _camera_instance = camera

    app = _create_app()
    host = config.ESP32_BRIDGE_HOST
    port = config.ESP32_BRIDGE_PORT

    def _run():
        try:
            from waitress import serve
            logger.info("Using waitress WSGI server")
            serve(app, host=host, port=port, threads=4)
        except ImportError:
            logger.warning("waitress not installed; falling back to Flask development server")
            app.run(host=host, port=port, debug=False, use_reloader=False, threaded=True)

    thread = threading.Thread(target=_run, name="esp32-bridge", daemon=True)
    thread.start()
    logger.info("ESP32 bridge listening on %s:%d", host, port)
    return thread
