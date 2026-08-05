"""
prism_edge/bridge.py — PRISM Edge Bridge
=========================================

Connects the ESP32 PRISM PULSE v4.0 sensor via COM7 to the PRISM
backend API and companion engine. Reads raw sensor telemetry (BPM,
g-force, alert status), enriches with NALU-based text analysis
signals, and forwards to the PRISM API for guardian alerting.

Features:
  - ESP32 serial reader (PRISM PULSE v4.0 CSV stream)
  - NALU text screening enrichment
  - PRISM API HTTP client
  - Local SQLite caching for offline resilience
  - WebSocket relay for real-time dashboard updates
  - Auto-reconnect on serial disconnect

Usage:
  python bridge.py [--api-url http://localhost:8000] [--com-port COM7] [--baud 115200]

Also runnable as:
  uvicorn bridge:app --host 0.0.0.0 --port 8500
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sqlite3
import sys
import time
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger("prism-edge")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PRISM_DIR = Path(__file__).resolve().parent.parent
SYS_PATH_ENTRIES = [
    str(PRISM_DIR),
    str(PRISM_DIR / "services" / "api" / "app"),
    str(PRISM_DIR / ".." / "PRISM"),
]

for p in SYS_PATH_ENTRIES:
    if p not in sys.path and os.path.isdir(p):
        sys.path.insert(0, p)

DB_PATH = Path(__file__).resolve().parent / "prism_edge.db"

try:
    import serial
    HAS_SERIAL = True
except ImportError:
    HAS_SERIAL = False
    logger.warning("pyserial not installed — serial (ESP32) support disabled")

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False
    logger.warning("httpx not installed — API forwarding disabled")

try:
    from prism_framework import HeuristicInterpreter, PRISMSchema
    HAS_HEURISTIC = True
except ImportError:
    HAS_HEURISTIC = False

try:
    from utils.text_screening import TextScreeningResult, screen_text
    HAS_TEXT_SCREENING = True
except ImportError:
    HAS_TEXT_SCREENING = False

if not HAS_HEURISTIC and not HAS_TEXT_SCREENING:
    logger.warning("Text screening module not found — NALU enrichment disabled")

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
def init_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sensor_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            ts_ms INTEGER,
            bpm REAL,
            g_force REAL,
            alert_status TEXT,
            forwarded INTEGER DEFAULT 0,
            alert_level TEXT,
            distress_index REAL,
            risk_index REAL,
            raw_json TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS text_screenings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            device_id TEXT,
            text TEXT,
            alert_level TEXT,
            is_crisis INTEGER DEFAULT 0,
            distress_index REAL,
            risk_index REAL,
            raw_json TEXT
        )
    """)
    conn.commit()
    conn.close()

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="PRISM Edge Bridge", version="2.0")

active_websockets: List[WebSocket] = []

# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------
class EdgeState:
    def __init__(self):
        self.esp32_connected = False
        self.esp32_port = "COM7"
        self.esp32_baud = 115200
        self.api_url = "http://localhost:8000"
        self.latest_reading: Dict[str, Any] = {}
        self.reading_history: List[Dict[str, Any]] = []
        self.max_history = 500
        self.total_readings = 0
        self.screening_available = HAS_HEURISTIC or HAS_TEXT_SCREENING

state = EdgeState()

# ---------------------------------------------------------------------------
# ESP32 Serial reader
# ---------------------------------------------------------------------------
def read_esp32_loop():
    """Background thread: reads PRISM PULSE data from ESP32."""
    if not HAS_SERIAL:
        logger.info("Serial disabled — ESP32 reader not started")
        return

    while True:
        try:
            with serial.Serial(state.esp32_port, state.esp32_baud, timeout=2) as ser:
                state.esp32_connected = True
                logger.info(f"ESP32 connected on {state.esp32_port} @ {state.esp32_baud}")

                while True:
                    line = ser.readline().decode("utf-8", errors="replace").strip()
                    if not line:
                        continue

                    parts = line.split(",")
                    if len(parts) < 5 or not parts[0].isdigit():
                        continue

                    try:
                        ts_ms = int(parts[0])
                        bpm = float(parts[2])
                        g_force = float(parts[3])
                        alert_status = parts[4].strip()
                    except (ValueError, IndexError):
                        continue

                    reading = {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "ts_ms": ts_ms,
                        "bpm": bpm,
                        "g_force": g_force,
                        "alert_status": alert_status,
                        "alert_level": "LOW",
                        "distress_index": 0.0,
                        "risk_index": 0.0,
                        "source": "esp32",
                    }

                    # NALU enrichment via sensor proxy
                    if bpm > 90:
                        reading["alert_level"] = "MILD"
                        reading["risk_index"] = 0.15
                    if bpm > 110:
                        reading["alert_level"] = "MODERATE"
                        reading["distress_index"] = 0.45
                        reading["risk_index"] = 0.35
                    if g_force > 2.5:
                        reading["alert_level"] = "MODERATE"
                        reading["distress_index"] = 0.50

                    state.latest_reading = reading
                    state.total_readings += 1
                    state.reading_history.append(reading)
                    if len(state.reading_history) > state.max_history:
                        state.reading_history = state.reading_history[-state.max_history:]

                    # Store in local DB
                    _ = _store_reading(reading)

                    # Forward to PRISM API
                    asyncio.run(_forward_to_api(reading))

                    # Broadcast to WebSocket clients
                    asyncio.run(_broadcast(json.dumps({
                        "type": "sensor_reading",
                        "data": reading,
                    })))

        except serial.SerialException as e:
            state.esp32_connected = False
            logger.warning(f"ESP32 disconnected: {e}. Retrying in 3s...")
            time.sleep(3)
        except Exception as e:
            state.esp32_connected = False
            logger.error(f"ESP32 reader error: {e}. Retrying in 5s...")
            time.sleep(5)


def _store_reading(reading: dict) -> bool:
    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.execute(
            """INSERT INTO sensor_readings (timestamp, ts_ms, bpm, g_force, alert_status, alert_level, distress_index, risk_index, raw_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                reading["timestamp"], reading["ts_ms"], reading["bpm"],
                reading["g_force"], reading["alert_status"],
                reading["alert_level"], reading["distress_index"],
                reading["risk_index"], json.dumps(reading),
            ),
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"DB store error: {e}")
        return False


_offline_queue_ref = None  # set by main after init
_lcd_controller_ref = None


def set_offline_queue(queue):
    global _offline_queue_ref
    _offline_queue_ref = queue


def set_lcd_controller(lcd):
    global _lcd_controller_ref
    _lcd_controller_ref = lcd


async def _forward_to_api(reading: dict) -> None:
    """Forward sensor reading to PRISM API with offline queue fallback."""
    payload = {
        "device_id": "prism-node-001",
        "signal_type": "physiological",
        "metadata": {
            "bpm": reading["bpm"],
            "g_force": reading["g_force"],
            "alert_status": reading["alert_status"],
            "source": "prism-pulse-v4",
        },
    }

    if _offline_queue_ref is not None:
        _offline_queue_ref.insert(
            timestamp=reading.get("timestamp", datetime.now(timezone.utc).isoformat()),
            source="esp32_pulse",
            device_id="prism-node-001",
            payload=payload,
        )

    if not HAS_HTTPX:
        return

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{state.api_url}/api/v1/events/ingest",
                json=payload,
            )
            if resp.status_code >= 400:
                logger.debug(f"API forward returned {resp.status_code}")
    except Exception:
        logger.debug("API forward failed — data already in offline queue")


async def _broadcast(message: str) -> None:
    """Send message to all connected WebSocket clients."""
    disconnected = []
    for ws in active_websockets:
        try:
            await ws.send_text(message)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        if ws in active_websockets:
            active_websockets.remove(ws)


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.get("/")
async def root():
    return {"service": "PRISM Edge Bridge", "version": "2.0", "esp32_connected": state.esp32_connected}

@app.get("/status")
async def status():
    history_len = len(state.reading_history)
    return {
        "esp32_connected": state.esp32_connected,
        "esp32_port": state.esp32_port,
        "api_url": state.api_url,
        "total_readings": state.total_readings,
        "history_size": history_len,
        "latest": state.latest_reading,
        "screening_available": state.screening_available,
        "recent_readings": state.reading_history[-20:],
    }

@app.get("/readings")
async def readings(limit: int = 50):
    return {"readings": state.reading_history[-limit:]}

@app.post("/screen")
async def screen_text_endpoint(payload: dict):
    """Run NALU text screening on arbitrary text — self-contained."""
    text = payload.get("text", "")
    if not text:
        return JSONResponse({"error": "No text provided"}, status_code=400)

    device_id = payload.get("device_id", "prism-edge")

    # Self-contained screening — no external imports needed
    try:
        result = _local_screen_text(text)
        result["device_id"] = device_id
        result["timestamp"] = datetime.now(timezone.utc).isoformat()
        _store_text_screening(device_id, text, result)
        return result
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


def _local_screen_text(text: str) -> dict:
    """Self-contained NALU screener — embedded keyword lexicon, no external imports."""
    import math

    EMOTION_KW = {
        "joy": ["happy", "glad", "delighted", "joyful", "wonderful", "great", "amazing", "love", "blessed", "grateful", "thankful", "content", "pleased", "excited", "thrilled", "elated", "cheerful", "awesome", "fantastic"],
        "sadness": ["sad", "unhappy", "depressed", "down", "miserable", "heartbroken", "crying", "tears", "grief", "sorrow", "melancholy", "despair", "devastated", "gloomy", "dismal", "blue", "feel empty", "numb", "hollow", "nobody cares", "no one cares", "all alone", "completely alone"],
        "anger": ["angry", "furious", "rage", "irritated", "annoyed", "frustrated", "mad", "livid", "outraged", "resentful", "bitter", "hostile", "pissed"],
        "fear": ["afraid", "scared", "fearful", "terrified", "anxious", "worried", "dread", "panic", "frightened", "nervous", "uneasy", "alarmed", "paranoid", "apprehensive", "anxiety"],
        "distress": ["distressed", "overwhelmed", "struggling", "can't cope", "breaking down", "falling apart", "losing it", "too much", "can't handle", "drowning", "suffocating", "barely holding on", "i can't", "i'm so tired", "exhausted", "drained"],
        "calm": ["calm", "peaceful", "relaxed", "serene", "tranquil", "at ease", "composed", "centered", "grounded", "chill"],
    }

    RISK_KW = {
        "crisis_danger": ["crisis", "suicide", "self-harm", "hurt myself", "hurting myself", "cutting", "overdose", "kill myself", "suicidal", "end my life", "end it all", "want to die", "thinking about hurting", "jump off", "hang myself", "not safe", "danger to myself", "ending it"],
        "anxiety_language": ["anxiety", "anxious", "panic attack", "worrying", "worried sick", "constant worry", "can't stop worrying", "overthinking"],
        "depression_language": ["depression", "depressed", "no energy", "can't get out of bed", "no motivation", "don't enjoy anything", "numb", "empty", "lifeless"],
        "risk_flag": ["not okay", "struggling badly", "breaking down", "can't go on", "paranoid", "hearing voices", "seeing things", "losing my mind"],
    }

    PSYCH_KW = {
        "stress_pressure": ["stress", "stressed", "pressure", "overworked", "burnout", "burned out", "overloaded", "swamped"],
        "hopelessness": ["hopeless", "no hope", "giving up", "why bother", "no way out", "can't go on", "better off dead"],
        "self_devaluation": ["worthless", "useless", "failure", "not good enough", "hate myself", "burden", "pathetic", "loser"],
        "resilience_coping": ["coping", "managing", "getting through", "therapy", "counseling", "taking steps", "getting help", "trying to", "self-care"],
    }

    def _score(txt, kws):
        tc = 0.0
        for kw in kws:
            if kw in txt.lower():
                tc += 1.0 + min(len(kw) * 0.03, 0.7)
        if tc == 0:
            return 0.0
        return round(min(1.0 - math.exp(-tc * 0.8), 1.0), 4)

    emotion = {k: _score(text, v) for k, v in EMOTION_KW.items()}
    risk = {k: _score(text, v) for k, v in RISK_KW.items()}
    psych = {k: _score(text, v) for k, v in PSYCH_KW.items()}

    pos = emotion.get("joy", 0) + emotion.get("calm", 0)
    neg = emotion.get("sadness", 0) + emotion.get("fear", 0) + emotion.get("distress", 0) + emotion.get("anger", 0)
    total = pos + neg + 0.5
    sentiment = {"positive": round(pos / total, 4), "negative": round(neg / total, 4), "neutral": round(0.5 / total, 4)}
    s = sum(sentiment.values())
    if s > 0:
        sentiment = {k: round(v / s, 4) for k, v in sentiment.items()}

    distress_idx = round(sentiment.get("negative", 0) * 0.3 + emotion.get("distress", 0) * 0.5 + emotion.get("sadness", 0) * 0.3 + psych.get("stress_pressure", 0) * 0.2, 4)
    risk_idx = round(risk.get("crisis_danger", 0) * 0.5 + risk.get("risk_flag", 0) * 0.4 + psych.get("hopelessness", 0) * 0.4 + risk.get("depression_language", 0) * 0.2, 4)
    protective_idx = round(psych.get("resilience_coping", 0) * 0.6, 4)

    if risk_idx >= 0.5 or risk.get("crisis_danger", 0) >= 0.35:
        alert = "HIGH"; crisis = True
    elif risk_idx >= 0.25 or distress_idx >= 0.45:
        alert = "MODERATE"; crisis = False
    elif risk_idx >= 0.1 or distress_idx >= 0.25:
        alert = "MILD"; crisis = False
    else:
        alert = "LOW"; crisis = False

    factors = []
    for cat, scores in [("Risk", risk), ("Emotion", emotion), ("Psychological", psych)]:
        for n, v in sorted(scores.items(), key=lambda x: -x[1]):
            if v >= 0.4:
                factors.append(f"{n.replace('_', ' ').title()} language signal ({round(v * 100)}% intensity)")
                if len(factors) >= 3:
                    break
        if len(factors) >= 3:
            break
    if risk.get("crisis_danger", 0) >= 0.3:
        factors.insert(0, "CRITICAL: Crisis/danger language detected")
    if protective_idx > 0.3:
        factors.append(f"Protective factors (coping/resilience: {protective_idx:.0%})")

    return {
        "text": text, "alert_level": alert, "is_crisis": crisis,
        "distress_index": distress_idx, "risk_index": risk_idx,
        "protective_index": protective_idx,
        "emotion": emotion, "risk": risk, "psychological": psych,
        "sentiment": sentiment,
        "contributing_factors": factors,
    }


def _store_text_screening(device_id: str, text: str, result: dict):
    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.execute(
            """INSERT INTO text_screenings (timestamp, device_id, text, alert_level, is_crisis, distress_index, risk_index, raw_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                datetime.now(timezone.utc).isoformat(),
                device_id,
                text,
                result.get("alert_level", "LOW"),
                1 if result.get("is_crisis") else 0,
                result.get("distress_index", 0),
                result.get("risk_index", 0),
                json.dumps(result),
            ),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    active_websockets.append(ws)
    try:
        await ws.send_text(json.dumps({
            "type": "connected",
            "message": "Connected to PRISM Edge Bridge",
            "esp32_connected": state.esp32_connected,
            "screening_available": state.screening_available,
        }))
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "screen":
                text = msg.get("text", "")
                if text:
                    result = await screen_text({"text": text, "device_id": msg.get("device_id", "prism-edge")})
                    await ws.send_text(json.dumps({"type": "screening_result", "data": result}))
            elif msg.get("type") == "ping":
                await ws.send_text(json.dumps({"type": "pong", "timestamp": datetime.now(timezone.utc).isoformat()}))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"WebSocket error: {e}")
    finally:
        if ws in active_websockets:
            active_websockets.remove(ws)


@app.get("/dashboard")
async def dashboard():
    """Simple HTML dashboard for the PRISM Edge Bridge."""
    return HTMLResponse("""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PRISM Edge Bridge — Live Dashboard</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f1117; color: #e4e6eb; padding: 20px; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
            .header h1 { color: #6C5CE7; font-size: 1.6rem; }
            .status-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; margin-right: 6px; }
            .status-dot.online { background: #00b894; box-shadow: 0 0 8px #00b894; }
            .status-dot.offline { background: #d63031; box-shadow: 0 0 8px #d63031; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
            .card { background: #1a1d27; border-radius: 12px; padding: 20px; border: 1px solid #2d3143; }
            .card h3 { color: #a29bfe; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
            .metric { display: flex; justify-content: space-between; align-items: baseline; margin: 8px 0; }
            .metric .label { color: #888; font-size: 0.8rem; }
            .metric .value { font-size: 1.5rem; font-weight: 700; }
            .metric .value.red { color: #d63031; }
            .metric .value.green { color: #00b894; }
            .meter { background: #2d3143; height: 8px; border-radius: 4px; margin: 8px 0; overflow: hidden; }
            .meter-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
            .meter-fill.red { background: #d63031; }
            .meter-fill.amber { background: #e17055; }
            .meter-fill.green { background: #00b894; }
            .log { max-height: 400px; overflow-y: auto; font-family: 'Consolas', monospace; font-size: 0.75rem; }
            .log-entry { padding: 4px 0; border-bottom: 1px solid #2d3143; }
            .log-entry .time { color: #666; }
            .log-entry .bpm { color: #6C5CE7; font-weight: 700; }
            textarea { width: 100%; background: #0f1117; color: #e4e6eb; border: 1px solid #2d3143; border-radius: 8px; padding: 10px; font-family: inherit; resize: vertical; }
            button { background: #6C5CE7; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.9rem; }
            button:hover { background: #5a4bd1; }
            .screening-result { margin-top: 12px; padding: 12px; background: #0f1117; border-radius: 8px; border: 1px solid #2d3143; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🧿 PRISM Edge Bridge</h1>
            <div>
                <span class="status-dot" id="esp32-dot"></span>
                <span id="esp32-status">Checking...</span>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <h3>📡 Live Sensor</h3>
                <div class="metric"><span class="label">BPM</span><span class="value" id="bpm-value">--</span></div>
                <div class="metric"><span class="label">G-Force</span><span class="value" id="gforce-value">--</span></div>
                <div class="metric"><span class="label">Alert</span><span class="value" id="alert-value">--</span></div>
                <div class="metric"><span class="label">Risk Index</span><span class="value" id="risk-value">--</span></div>
                <div class="meter"><div class="meter-fill" id="risk-meter" style="width:0%"></div></div>
            </div>

            <div class="card">
                <h3>📊 Stats</h3>
                <div class="metric"><span class="label">Total Readings</span><span class="value" id="total-value">0</span></div>
                <div class="metric"><span class="label">ESP32 Uptime</span><span class="value" id="uptime-value">--</span></div>
                <div class="metric"><span class="label">API Status</span><span class="value" id="api-value">--</span></div>
            </div>

            <div class="card">
                <h3>🔍 Text Screening</h3>
                <textarea id="screen-text" rows="3" placeholder="Enter text for NALU mental health screening..."></textarea>
                <button onclick="screenText()" style="margin-top:8px;width:100%;">Run Screening</button>
                <div id="screening-result" class="screening-result" style="display:none;"></div>
            </div>

            <div class="card" style="grid-column: span 2;">
                <h3>📜 Sensor Log</h3>
                <div class="log" id="sensor-log"><div class="log-entry">Waiting for ESP32 data...</div></div>
            </div>
        </div>

        <script>
            const ws = new WebSocket('ws://' + location.host + '/ws');
            let totalReadings = document.getElementById('total-value').textContent;

            ws.onopen = () => {
                document.getElementById('api-value').textContent = 'Connected';
                document.getElementById('api-value').className = 'value green';
            };

            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.type === 'connected') {
                    document.getElementById('esp32-status').textContent = msg.esp32_connected ? 'ESP32 Online' : 'ESP32 Offline';
                    document.getElementById('esp32-dot').className = 'status-dot ' + (msg.esp32_connected ? 'online' : 'offline');
                }
                if (msg.type === 'sensor_reading') {
                    const d = msg.data;
                    document.getElementById('bpm-value').textContent = d.bpm;
                    document.getElementById('gforce-value').textContent = d.g_force.toFixed(2);
                    document.getElementById('alert-value').textContent = d.alert_level;
                    document.getElementById('risk-value').textContent = d.risk_index.toFixed(2);

                    const riskFill = document.getElementById('risk-meter');
                    riskFill.style.width = (d.risk_index * 100) + '%';
                    riskFill.className = 'meter-fill ' + (d.risk_index > 0.5 ? 'red' : d.risk_index > 0.25 ? 'amber' : 'green');

                    const log = document.getElementById('sensor-log');
                    const entry = document.createElement('div');
                    entry.className = 'log-entry';
                    const time = new Date(d.timestamp).toLocaleTimeString();
                    entry.innerHTML = '<span class="time">' + time + '</span> BPM=<span class="bpm">' + d.bpm + '</span> G=' + d.g_force.toFixed(2) + ' Alert=' + d.alert_level;
                    log.prepend(entry);
                    if (log.children.length > 50) log.removeChild(log.lastChild);
                }
                if (msg.type === 'screening_result') {
                    const r = msg.data;
                    const div = document.getElementById('screening-result');
                    div.style.display = 'block';
                    div.innerHTML = '<strong>Alert:</strong> ' + r.alert_level +
                        ' | <strong>Distress:</strong> ' + (r.distress_index || 0).toFixed(2) +
                        ' | <strong>Risk:</strong> ' + (r.risk_index || 0).toFixed(2) +
                        (r.contributing_factors ? '<br><strong>Factors:</strong> ' + r.contributing_factors.join('; ') : '');
                }
            };

            async function screenText() {
                const text = document.getElementById('screen-text').value;
                const res = await fetch('/screen', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text})});
                const data = await res.json();
                const div = document.getElementById('screening-result');
                div.style.display = 'block';
                div.innerHTML = '<strong>Alert:</strong> ' + (data.alert_level || '--') +
                    ' | <strong>Distress:</strong> ' + (data.distress_index || 0).toFixed(2) +
                    ' | <strong>Risk:</strong> ' + (data.risk_index || 0).toFixed(2) +
                    (data.contributing_factors ? '<br><strong>Factors:</strong> ' + data.contributing_factors.join('; ') : '') +
                    (data.clinical_summary ? '<br><strong>Summary:</strong> ' + data.clinical_summary : '');
                ws.send(JSON.stringify({type:'screen', text}));
            }

            // Periodic status poll
            setInterval(() => {
                fetch('/status').then(r => r.json()).then(s => {
                    document.getElementById('total-value').textContent = s.total_readings;
                    document.getElementById('esp32-status').textContent = s.esp32_connected ? 'ESP32 Online' : 'ESP32 Offline';
                    document.getElementById('esp32-dot').className = 'status-dot ' + (s.esp32_connected ? 'online' : 'offline');
                }).catch(() => {});
            }, 3000);
        </script>
    </body>
    </html>
    """)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="PRISM Edge Bridge")
    parser.add_argument("--api-url", default="http://localhost:8000", help="PRISM API URL")
    parser.add_argument("--com-port", default="COM7", help="ESP32 serial port")
    parser.add_argument("--baud", type=int, default=115200, help="ESP32 baud rate")
    parser.add_argument("--port", type=int, default=8500, help="Bridge HTTP server port")
    parser.add_argument("--no-serial", action="store_true", help="Disable ESP32 serial reader")
    args = parser.parse_args()

    state.api_url = args.api_url
    state.esp32_port = args.com_port
    state.esp32_baud = args.baud

    init_db()
    logger.info(f"PRISM Edge Bridge starting on port {args.port}")

    if not args.no_serial and HAS_SERIAL:
        esp_thread = threading.Thread(target=read_esp32_loop, daemon=True)
        esp_thread.start()
        logger.info(f"ESP32 reader thread started (port={state.esp32_port})")
    else:
        logger.info("ESP32 reader disabled")

    uvicorn.run(app, host="0.0.0.0", port=args.port, log_level="info")


if __name__ == "__main__":
    main()
