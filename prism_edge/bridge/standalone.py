#!/usr/bin/env python3
"""
Standalone PRISM PULSE bridge — camera MJPEG stream + ESP32 UART listener.
No vision pipeline, no feature packer, no API client. Just the essentials
so the Pi 4B can serve the live dashboard without CPU starvation.
"""
import logging
import threading
import time
import json
import os
import sys

import cv2
import numpy as np

try:
    import serial
except ImportError:
    serial = None

from flask import Flask, request, jsonify, Response
from waitress import serve

# ── Config ──────────────────────────────────────────────────────────
CAMERA_ID = int(os.getenv("PRISM_CAMERA_ID", "0"))
CAMERA_WIDTH = int(os.getenv("PRISM_CAMERA_WIDTH", "640"))
CAMERA_HEIGHT = int(os.getenv("PRISM_CAMERA_HEIGHT", "480"))
CAMERA_FPS = int(os.getenv("PRISM_CAMERA_FPS", "15"))
UART_PORT = os.getenv("PRISM_UART_PORT", "/dev/ttyUSB0")
UART_BAUD = int(os.getenv("PRISM_UART_BAUD", "115200"))
BRIDGE_HOST = os.getenv("PRISM_ESP32_BRIDGE_HOST", "0.0.0.0")
BRIDGE_PORT = int(os.getenv("PRISM_ESP32_BRIDGE_PORT", "8081"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("standalone-bridge")

# ── Shared state ────────────────────────────────────────────────────
state_lock = threading.Lock()
esp32_pulse = {}
frame_count = 0
last_frame = None
camera_connected = False

# ── Camera capture thread ───────────────────────────────────────────
def camera_thread_fn():
    global last_frame, frame_count, camera_connected
    cap = cv2.VideoCapture(CAMERA_ID, cv2.CAP_V4L2)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
    cap.set(cv2.CAP_PROP_FPS, CAMERA_FPS)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))

    if not cap.isOpened():
        logger.error("Camera %d failed to open", CAMERA_ID)
        return

    logger.info("Camera %d: %dx%d @ %d fps", CAMERA_ID, CAMERA_WIDTH, CAMERA_HEIGHT, CAMERA_FPS)
    camera_connected = True
    interval = 1.0 / max(CAMERA_FPS, 1)

    while True:
        t0 = time.time()
        ret, frame = cap.read()
        if not ret or frame is None:
            time.sleep(0.1)
            continue
        last_frame = frame
        frame_count += 1
        elapsed = time.time() - t0
        if elapsed < interval:
            time.sleep(interval - elapsed)


# ── UART listener ───────────────────────────────────────────────────
def uart_thread_fn():
    if serial is None:
        logger.warning("pyserial not installed — UART disabled")
        return

    logger.info("UART listener on %s @ %d baud", UART_PORT, UART_BAUD)
    while True:
        try:
            s = serial.Serial(UART_PORT, UART_BAUD, timeout=1.0)
            while True:
                line = s.readline().decode("utf-8", errors="ignore").strip()
                if not line:
                    continue
                # CSV: ts_ms,pulse_raw,bpm,g_force,alert_status
                parts = line.split(",")
                if len(parts) >= 5:
                    try:
                        with state_lock:
                            esp32_pulse.update({
                                "ts_ms": int(parts[0]),
                                "pulse_raw": int(parts[1]),
                                "bpm": float(parts[2]),
                                "g_force": float(parts[3]),
                                "alert_status": parts[4].strip()[:32],
                            })
                    except (ValueError, IndexError):
                        pass
        except Exception as e:
            logger.error("UART error: %s — retrying in 2s", e)
            time.sleep(2)


# ── Flask app ───────────────────────────────────────────────────────
app = Flask(__name__)

@app.after_request
def cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "prism-standalone-bridge"})

@app.route("/latest")
def latest():
    with state_lock:
        data = dict(esp32_pulse)
    if not data:
        return jsonify({"status": "waiting", "message": "No data from ESP32 yet"})
    return jsonify({"status": "ok", "data": data})

@app.route("/camera/status")
def camera_status():
    return jsonify({"connected": camera_connected, "frame_count": frame_count, "status": "ok" if camera_connected else "error"})

@app.route("/camera/stream")
def camera_stream():
    if not camera_connected:
        return jsonify({"status": "error", "message": "Camera not available"}), 503

    interval = 1.0 / max(CAMERA_FPS, 1)

    def generate():
        local_last = 0.0
        while True:
            now = time.time()
            if now - local_last < interval:
                time.sleep(max(0, interval - (now - local_last)))
            frame = last_frame
            if frame is None:
                time.sleep(0.05)
                continue
            ret, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 50])
            if not ret:
                continue
            local_last = time.time()
            yield (b"--frame\r\n"
                   b"Content-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n")

    return Response(generate(), mimetype="multipart/x-mixed-replace; boundary=frame",
                    headers={"Cache-Control": "no-cache", "Pragma": "no-cache"})

@app.route("/")
def dashboard():
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PRISM PULSE — Live Monitor</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter','Segoe UI',sans-serif; background:#0A0A0A; color:#FFF; min-height:100vh; display:flex; flex-direction:column; }
  .navbar { height:48px; background:#111; border-bottom:1px solid #2C2C2E; display:flex; align-items:center; padding:0 20px; gap:10px; flex-shrink:0; }
  .navbar .title { font-weight:800; font-size:14px; letter-spacing:0.12em; }
  .navbar .tag { font-size:9px; color:#8E8E93; letter-spacing:0.1em; text-transform:uppercase; margin-left:auto; }
  .live-dot { width:7px; height:7px; border-radius:50%; background:#16A34A; animation:pulse 2s infinite; flex-shrink:0; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
  .main { display:flex; gap:16px; padding:16px; flex:1; min-height:0; }
  .camera-panel { flex:1; min-width:0; background:#111; border-radius:12px; border:1px solid #2C2C2E; overflow:hidden; position:relative; display:flex; align-items:center; justify-content:center; }
  .camera-panel img { width:100%; height:100%; object-fit:contain; }
  .camera-panel .label { position:absolute; top:10px; left:12px; font-size:9px; font-weight:700; color:#8E8E93; letter-spacing:0.1em; text-transform:uppercase; background:rgba(0,0,0,0.6); padding:3px 8px; border-radius:5px; }
  .pulse-panel { width:300px; flex-shrink:0; display:flex; flex-direction:column; gap:12px; }
  .pulse-card { background:#111; border-radius:12px; border:1px solid #2C2C2E; padding:16px; }
  .pulse-card .header { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
  .pulse-card .header .h-title { font-size:9px; font-weight:700; color:#8E8E93; letter-spacing:0.1em; text-transform:uppercase; }
  .status.online { color:#16A34A; font-size:9px; font-weight:700; }
  .status.offline { color:#DC2626; font-size:9px; font-weight:700; }
  .metric-big { text-align:center; padding:6px 0; }
  .big-val { font-size:48px; font-weight:800; font-family:'Space Grotesk',monospace; letter-spacing:-0.03em; line-height:1; }
  .big-val.warn { color:#F97316; }
  .big-val.ok { color:#22C55E; }
  .big-unit { font-size:12px; color:#6B6B6B; margin-top:3px; }
  .metric-row { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#0A0A0A; border-radius:8px; margin-bottom:6px; }
  .metric-row .lbl { font-size:10px; color:#6B6B6B; }
  .metric-row .val { font-weight:700; font-size:1em; }
  .metric-row .val.g { color:#C084FC; }
  .metric-row .val.raw { color:#4ADE80; }
  .metric-row .val.alert { color:#FBBF24; }
  .metric-row .val.alert.warn { color:#F97316; }
  .alert-box { padding:10px 14px; border-radius:8px; text-align:center; margin-top:6px; font-size:12px; font-weight:700; }
  .alert-box.warn { background:#1F1410; border:1px solid #F97316; color:#F97316; }
  .alert-box.ok { background:#0F1A10; border:1px solid #22C55E; color:#22C55E; }
  .footer-time { font-size:9px; color:#48484A; text-align:center; margin-top:4px; }
</style>
</head>
<body>
<div class="navbar">
  <span class="title">PRISM PULSE</span>
  <span class="tag">ESP32 · LIVE</span>
  <div class="live-dot" id="liveDot"></div>
  <span style="font-size:9px;color:#6B6B6B;margin-left:2px" id="liveLabel">LIVE</span>
</div>
<div class="main">
  <div class="camera-panel">
    <span class="label">LIVE CAMERA</span>
    <img src="/camera/stream" alt="Camera stream" />
  </div>
  <div class="pulse-panel">
    <div class="pulse-card">
      <div class="header">
        <span class="h-title">ESP32 SENSOR DATA</span>
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
      <p style="font-size:9px;font-weight:700;color:#8E8E93;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px">SIGNAL CHAIN</p>
      <div style="color:#48484A;font-size:11px">
        Pulse Sensor → ESP32 ADC → Peak Detect → BPM Calc → <span style="color:#8E8E93">Bridge</span>
      </div>
      <div style="margin-top:12px;font-size:10px;color:#48484A">
        CP2102 USB-UART · MPU6050 · ISD1820
      </div>
    </div>
  </div>
</div>
<script>
(function() {
  var bpmEl=document.getElementById('bpmVal');
  var gEl=document.getElementById('gVal');
  var rawEl=document.getElementById('rawVal');
  var alertEl=document.getElementById('alertVal');
  var alertBox=document.getElementById('alertBox');
  var tsEl=document.getElementById('timestamp');
  var connDot=document.getElementById('connDot');
  var connLabel=document.getElementById('connLabel');
  var connStatus=document.getElementById('connStatus');
  var liveDot=document.getElementById('liveDot');
  var liveLabel=document.getElementById('liveLabel');
  function poll(){
    fetch('/latest').then(function(r){return r.json()}).then(function(j){
      if(j.status==='ok'&&j.data&&j.data.bpm!==undefined){
        var d=j.data;
        bpmEl.textContent=d.bpm;
        bpmEl.className='big-val '+(d.bpm>=110?'warn':'ok');
        gEl.textContent=parseFloat(d.g_force).toFixed(2)+' G';
        rawEl.textContent=d.pulse_raw;
        var isWarn=d.alert_status&&d.alert_status.toLowerCase().indexOf('warn')===0;
        alertEl.textContent=d.alert_status||'OK';
        alertEl.className='val alert'+(isWarn?' warn':'');
        alertBox.textContent=isWarn?'\u26a0 '+d.alert_status:'\u25cf System Normal';
        alertBox.className='alert-box '+(isWarn?'warn':'ok');
        tsEl.textContent='Updated: '+new Date().toLocaleTimeString();
        connDot.textContent='\u25cf';connLabel.textContent='ONLINE';
        connStatus.className='status online';
        liveDot.style.background='#16A34A';liveLabel.textContent='LIVE';
      }
    }).catch(function(){
      connDot.textContent='\u25cf';connLabel.textContent='OFFLINE';
      connStatus.className='status offline';
      liveDot.style.background='#DC2626';liveLabel.textContent='DOWN';
    });
  }
  poll();setInterval(poll,2000);
})();
</script>
</body>
</html>"""


# ── Main ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logger.info("Starting PRISM standalone bridge")

    # Camera thread
    cam_t = threading.Thread(target=camera_thread_fn, daemon=True, name="camera")
    cam_t.start()

    # Wait for first frame
    for _ in range(100):
        if last_frame is not None:
            break
        time.sleep(0.1)

    if not camera_connected:
        logger.warning("Camera not connected — stream will be unavailable")

    # UART thread
    uart_t = threading.Thread(target=uart_thread_fn, daemon=True, name="uart")
    uart_t.start()

    logger.info("Serving on %s:%d", BRIDGE_HOST, BRIDGE_PORT)
    serve(app, host=BRIDGE_HOST, port=BRIDGE_PORT, threads=4)
