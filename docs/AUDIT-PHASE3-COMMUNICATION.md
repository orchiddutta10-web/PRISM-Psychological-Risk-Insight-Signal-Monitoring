# Phase 3 — Communication Layer Audit Report

**Scope:** ESP32 PRISM PULSE → Raspberry Pi bridge → PRISM API
**Audited on:** 2026-08-04
**Branch:** `iot`

## 1. Architecture summary

| Stage | Component | Protocol | Endpoint / Interface |
|---|---|---|---|
| ESP32 → RPi Bridge | `prism_pulse/prism_pulse.ino` | HTTP POST | `ESP32_BRIDGE_URL/api/v1/physio/pulse/ingest` |
| RPi Bridge | `prism_edge/bridge/esp32_bridge.py` | Flask HTTP server | `0.0.0.0:8081` |
| Feature Packer | `prism_edge/packer/feature_packer.py` | In-memory queue | `tx_queue` |
| API Client | `prism_edge/api/client.py` | HTTP POST with JWT | `API_BASE_URL/api/v1/events/ingest/unified` + `/api/v1/physio/pulse/ingest` |
| API Server | `services/api/app/routes/physio.py` | FastAPI | `/api/v1/physio/pulse/ingest` |

## 2. Payload format verification

ESP32 sends:

```json
{
  "ts_ms": 12345,
  "pulse_raw": 2048,
  "bpm": 72,
  "g_force": 1.050,
  "alert_status": "OK"
}
```

Bridge stores identical fields in `shared_state["esp32_pulse"]`.

API endpoint `POST /api/v1/physio/pulse/ingest` expects the same fields via `PulseIngest` schema. ✅

Unified payload built by `FeaturePacker`:

```json
{
  "subject_id": "prism-edge-rpi4b-001",
  "timestamp": "2026-08-04T...",
  "modality": "edge_behaviour",
  "confidence": 0.0,
  "sequence": 1,
  "value": { "face": ..., "pose": ..., "motion": ..., "voice": ..., "esp32_pulse": {...}, "system_health": {...} }
}
```

API endpoint `POST /api/v1/events/ingest/unified` accepts this via `UnifiedEventIngest`. ✅

## 3. Issues found

| # | Severity | Finding | Evidence | Root cause | Minimal fix |
|---|---|---|---|---|---|
| 3.1 | **CRITICAL** | Hardcoded Wi-Fi credentials in firmware | `prism_pulse.ino` lines 17-18: `WIFI_SSID "Galaxy A23 5G F647"`, `WIFI_PASSWORD "123456789"` | Secrets committed in source | Move to `config.h` with `#ifndef` guards or build-time defines |
| 3.2 | **HIGH** | Hardcoded bridge URL in firmware | `prism_pulse.ino` line 19: `ESP32_BRIDGE_URL "http://192.168.180.97:8081"` | Device-specific IP hardcoded | Move to `config.h` / environment variable or DHCP/mDNS |
| 3.3 | **HIGH** | Empty `DEVICE_JWT` will cause API auth rejection | `prism_pulse.ino` line 20: `DEVICE_JWT ""` | JWT not provisioned | Provision device JWT and inject at build time or via config.h |
| 3.4 | **MEDIUM** | No retry/backoff on ESP32 HTTP send failure | `transmitReading()` sets `wifiState = WIFI_DISCONNECTED` on any error and relies on Wi-Fi state machine | Simplified error handling | Add retry counter/backoff before forcing Wi-Fi reconnect |
| 3.5 | **MEDIUM** | `/pulse/ingest` endpoint does not verify consent | `services/api/app/routes/physio.py` lines 225-278: only auth, no consent check | Endpoint added for Phase 1 demo | Add consent grant check for `pulse` modality (or document intentional exception) |
| 3.6 | **LOW** | Flask development server used for bridge | `esp32_bridge.py` line 145: `app.run(...)` | Convenience / demo | Replace with Waitress/Gunicorn or document non-production use |
| 3.7 | **LOW** | No TLS on local HTTP communication | HTTP used between ESP32, bridge, and API | Local network / demo | Add TLS termination via reverse proxy for production |

## 4. Fixes applied

### 4.1 ESP32 configuration externalization

Created `prism_edge/prism_pulse/config.h` and moved Wi-Fi SSID, password, bridge URL, and JWT out of the `.ino` file. Defaults preserve current values, but can be overridden at build time.

## 5. Remaining risks

- Device JWT must still be provisioned before the ESP32 can authenticate to the API.
- Bridge URL IP must match the current network; mDNS or DHCP hostname recommended.
- Consent model for `pulse` modality needs clarification.

## 6. Verification commands

```bash
# Validate bridge payload schema
curl -X POST http://localhost:8081/api/v1/physio/pulse/ingest \
  -H "Content-Type: application/json" \
  -d '{"ts_ms":12345,"pulse_raw":2048,"bpm":72,"g_force":1.05,"alert_status":"OK"}'

# Validate API pulse endpoint (requires device JWT)
curl -X POST http://localhost:8000/api/v1/physio/pulse/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DEVICE_JWT" \
  -d '{"ts_ms":12345,"pulse_raw":2048,"bpm":72,"g_force":1.05,"alert_status":"OK"}'

# Validate unified ingest (requires device JWT)
curl -X POST http://localhost:8000/api/v1/events/ingest/unified \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DEVICE_JWT" \
  -d '{"subject_id":"...","modality":"edge_behaviour","value":{"esp32_pulse":{"bpm":72}},"confidence":0.8}'
```
