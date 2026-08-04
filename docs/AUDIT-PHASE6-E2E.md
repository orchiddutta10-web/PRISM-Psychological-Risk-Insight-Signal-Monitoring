# Phase 6 — End-to-End Validation Report

**Scope:** Full PRISM data pipeline from sensor to dashboard
**Audited on:** 2026-08-04
**Branch:** `iot`

## 1. Pipeline under test

```text
Pulse Sensor
      ↓
ESP32 ADC (GPIO34)
      ↓
ESP32 Firmware (BPM, G-Force, alert_status)
      ↓
HTTP POST /api/v1/physio/pulse/ingest
      ↓
prism_edge Bridge (:8081)
      ↓
shared_state["esp32_pulse"]
      ↓
FeaturePacker (every 2 s)
      ↓
tx_queue
      ↓
ApiClient → POST /api/v1/events/ingest/unified
      ↓
PRISM API (FastAPI :8000)
      ↓
SQLite / PostgreSQL + Redis pub/sub
      ↓
WebSocket /events/ws
      ↓
Next.js Dashboard (/overview, /prism-node)
```

```text
Camera (USB/CSI)
      ↓
prism_edge CameraCapture (OpenCV V4L2)
      ↓
Vision loop (face/pose/motion)
      ↓
shared_state["face"/"pose"/"motion"]
      ↓
FeaturePacker → ApiClient → API → Redis → WebSocket
      ↓
Dashboard (no camera UI yet)
```

## 2. Stage-by-stage validation

### Stage 1 — Sensor input

| Field | Expected | Actual | Validation |
|---|---|---|---|
| Pulse sensor signal | Analog 0–4095 (ESP32 ADC) | Not tested (hardware) | Oscilloscope/serial plotter |
| Sampling rate | 50 Hz (`SAMPLE_INTERVAL = 20 ms`) | Not tested (hardware) | Logic analyzer or serial log |
| MPU6050 G-Force | 3-axis acceleration / 9.81 | Not tested (hardware) | Serial log |

### Stage 2 — ESP32 firmware processing

| Check | Expected | Actual | Status |
|---|---|---|---|
| Non-blocking loop | `millis()`-based | Yes | ✅ Code review |
| BPM computation | Peak detection, IBI → BPM | Implemented | ✅ Code review |
| Alert logic | High BPM + Low movement → 15 s → ISD trigger | Implemented | ✅ Code review |
| JSON payload | `{ts_ms, pulse_raw, bpm, g_force, alert_status}` | Matches | ✅ Code review |

### Stage 3 — Wireless communication

| Check | Expected | Actual | Status |
|---|---|---|---|
| Protocol | HTTP POST | HTTP POST | ✅ |
| Destination | `ESP32_BRIDGE_URL/api/v1/physio/pulse/ingest` | Hardcoded in firmware, overridable via `config.h` | ✅ After Phase 3 fix |
| Content-Type | `application/json` | Set | ✅ |
| Authorization | `Bearer <JWT>` | Sent, but `DEVICE_JWT` is empty by default | ⚠️ Requires provisioning |
| Retry/backoff | Retry on failure | Minimal: forces Wi-Fi reconnect on error | ⚠️ See Phase 3 |

### Stage 4 — prism_edge bridge

| Check | Expected | Actual | Status |
|---|---|---|---|
| Receives POST | 200 OK with `{status: accepted}` | Yes | ✅ Tested via curl |
| Validates required fields | `ts_ms`, `pulse_raw`, `bpm`, `g_force`, `alert_status` | Yes | ✅ Code review |
| Stores in shared state | `shared_state["esp32_pulse"]` | Yes | ✅ Code review |
| Thread-safe | Uses `state_lock` | Yes | ✅ Code review |
| Latest endpoint | `GET /latest` returns last reading | Yes | ✅ Tested via curl |

### Stage 5 — Feature packing

| Check | Expected | Actual | Status |
|---|---|---|---|
| Interval | Every 2 s | `FEATURE_INTERVAL_SEC = 2.0` | ✅ |
| Payload modality | `edge_behaviour` | Yes | ✅ |
| Includes pulse data | `value.esp32_pulse` | Yes | ✅ |
| Includes camera/vision | `value.face`, `value.pose`, `value.motion` | Yes | ✅ |
| Queue overflow | Drop oldest | Implemented | ✅ |

### Stage 6 — API ingestion

| Check | Expected | Actual | Status |
|---|---|---|---|
| Unified endpoint | `POST /api/v1/events/ingest/unified` | Implemented | ✅ |
| Pulse endpoint | `POST /api/v1/physio/pulse/ingest` | Implemented | ✅ |
| JWT auth | Required | Yes | ✅ |
| Schema validation | Pydantic models | Yes | ✅ |
| Consent check | For unified: yes; for pulse: missing | Partial | ⚠️ See Phase 4 |

### Stage 7 — Real-time broadcast

| Check | Expected | Actual | Status |
|---|---|---|---|
| Redis publish | On telemetry ingest | Yes | ✅ Code review |
| WebSocket forward | Guardian receives events | Yes | ✅ Code review |

### Stage 8 — Dashboard

| Check | Expected | Actual | Status |
|---|---|---|---|
| Renders real devices | `/auth/devices` | Yes, with demo fallback | ✅ |
| PRISM Node vitals | `/physio/pulse/readings` | Yes, with synthetic fallback | ✅ |
| WebSocket live log | Receives events | Yes, no reconnect | ⚠️ See Phase 5 |
| Camera feed | Live video | **Not implemented** | ❌ |

## 3. Simultaneous telemetry + camera verification

| Check | Expected | Actual | Status |
|---|---|---|---|
| Telemetry continues while camera streams | Should not block | Camera and vision run in separate threads | ✅ Code review |
| Dashboard shows synchronized data | Sensor + camera metadata together | Only sensor data displayed | ❌ Camera UI missing |
| CPU/RAM within limits | CPU <50%, RAM <1 GB | Not measured (requires runtime) | ⏸️ |
| Latency acceptable | <5 s end-to-end | Not measured (requires runtime) | ⏸️ |

## 4. Identified gaps

1. **Camera stream is not exposed** — only metadata reaches the API; no MJPEG/WebRTC endpoint.
2. **Dashboard has no camera UI** — even if a stream endpoint existed, nothing renders it.
3. **No end-to-end latency benchmark** — no automated timing from ESP32 to dashboard.
4. **No load test** — queue behavior under high pulse/camera throughput is untested.
5. **WebSocket disconnects** — dashboard does not reconnect automatically.

## 5. E2E curl verification

```bash
# 1. Start prism_edge main (or just the bridge)
cd prism_edge
python main.py

# 2. In another terminal, send a pulse reading
curl -X POST http://localhost:8081/api/v1/physio/pulse/ingest \
  -H "Content-Type: application/json" \
  -d '{"ts_ms":12345,"pulse_raw":2048,"bpm":72,"g_force":1.05,"alert_status":"OK"}'

# 3. Verify latest
curl http://localhost:8081/api/v1/physio/pulse/latest

# 4. Start API and send unified payload (requires device JWT)
curl -X POST http://localhost:8000/api/v1/events/ingest/unified \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DEVICE_JWT" \
  -d '{"subject_id":"...","modality":"edge_behaviour","confidence":0.8,"value":{"esp32_pulse":{"ts_ms":12345,"pulse_raw":2048,"bpm":72,"g_force":1.05,"alert_status":"OK"}}}'

# 5. Open dashboard, sign in, and verify live log / PRISM Node vitals.
```

## 6. Conclusion

The telemetry pipeline is **functionally complete** from ESP32 to dashboard:
- Sensor data can be ingested via the bridge.
- Feature packer aggregates and forwards to the API.
- API stores events and broadcasts via WebSocket.
- Dashboard renders real pulse/vitals when available and falls back to demo data.

The camera pipeline is **partially complete**:
- Hardware capture and vision feature extraction exist.
- Metadata flows through the same pipeline.
- **No video stream endpoint or UI exists.**

Next critical steps:
1. Add a camera streaming endpoint (MJPEG or WebRTC).
2. Add a camera tile to the dashboard.
3. Add automated E2E latency/load tests.
