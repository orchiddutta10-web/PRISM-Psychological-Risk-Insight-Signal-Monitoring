# Phase 7 — Fault Tolerance Audit Report

**Scope:** ESP32, prism_edge backend, dashboard, and camera
**Audited on:** 2026-08-04
**Branch:** `iot`

## 1. ESP32 fault tolerance

| Scenario | Expected behavior | Actual behavior | Status |
|---|---|---|---|
| Wi-Fi loss | Reconnect automatically | `handleWiFi()` state machine retries every 30 s | ✅ |
| Wi-Fi connection timeout | Return to disconnected, retry | Timeout after 15 s, retry | ✅ |
| HTTP POST failure | Retry or backoff | Sets `wifiState = WIFI_DISCONNECTED`, relies on Wi-Fi reconnect | ⚠️ No HTTP-level retry |
| Sensor failure (MPU6050) | Use safe default | `currentGForce = 1.0` fallback | ✅ |
| LCD failure | Continue without LCD | `lcdFound` flag; continues operation | ✅ |
| Invalid ADC values | Clamp or ignore | `pulseValue = analogRead(PULSE_PIN)`; no clamping | ️ No validation |
| Reboot | Start from clean state | Resets all variables; expected | ✅ |
| Missing bridge server | Retry | Only Wi-Fi reconnect, no bridge-specific retry | ⚠️ |

### Findings

- **7.1 — No HTTP retry on 5xx/timeout** (MEDIUM)
  - `transmitReading()` does not retry failed POSTs.
  - **Fix:** Add retry counter with backoff before giving up.

- **7.2 — Invalid ADC values not sanitized** (LOW)
  - `pulseValue` can be any 12-bit value.
  - **Fix:** Sanity-check range before feeding BPM algorithm.

## 2. Backend fault tolerance

| Scenario | Expected behavior | Actual behavior | Status |
|---|---|---|---|
| Malformed JSON | Return 400, keep running | try/except returns 400 in `esp32_bridge.py` | ✅ |
| Missing required fields | Return 400, keep running | Validated in `esp32_bridge.py` | ✅ |
| Server restart | ESP32 reconnects when available | ESP32 reconnects via Wi-Fi + HTTP | ✅ |
| Network interruption | Queue payloads, retry | `ApiClient` saves to offline queue | ✅ |
| API returns 401/403 | Discard payload, log | `ApiClient._on_failure(..., permanent=True)` | ✅ |
| Database failure | API returns 500, client retries | FastAPI exception handling | ✅ |
| Camera disconnect | Reconnect automatically | `CameraCapture._reconnect()` | ✅ |
| Camera driver failure | Retry, degrade gracefully | `CameraCapture` retries with delay | ✅ |
| Backend restart during streaming | Camera/vision threads restart | Main process restart required | ✅ |

### Findings

- **7.3 — Bridge does not rate-limit requests** (LOW)
  - Flask dev server could be overwhelmed by high-frequency ESP32 posts.
  - **Fix:** Add minimal rate limiting or use a production WSGI server.

## 3. Dashboard fault tolerance

| Scenario | Expected behavior | Actual behavior | Status |
|---|---|---|---|
| Backend unavailable | Show cached/demo data | Falls back to `DEVICES` demo data | ✅ |
| WebSocket close | Reconnect automatically | Only sets status to `disconnected` | ❌ |
| WebSocket error | Reconnect automatically | Only sets status to `disconnected` | ❌ |
| Invalid payload | Ignore gracefully | try/catch around `JSON.parse` | ✅ |
| Stale data | Indicate age/refresh | `lastSeen` shown, but no auto-refresh on WS failure | ⚠️ |

### Findings

- **7.4 — WebSocket has no auto-reconnect** (HIGH)
  - `overview/page.tsx` does not reconnect on `onclose`/`onerror`.
  - **Fix:** Implement exponential-backoff reconnect.

## 4. Camera fault tolerance

| Scenario | Expected behavior | Actual behavior | Status |
|---|---|---|---|
| Camera disconnected | Retry, log | `_reconnect()` called | ✅ |
| Driver failure | Retry, log | `_reconnect()` called | ✅ |
| Stream interruption | Retry | `_reconnect()` called | ✅ |
| Backend restart | Camera thread stops with process | Process restart required | ✅ |

## 5. Recommendations

1. Add HTTP retry with exponential backoff in ESP32 firmware.
2. Add ADC value sanity checks in ESP32 firmware.
3. Implement WebSocket auto-reconnect in dashboard overview page.
4. Add a production WSGI server for the bridge.
5. Add backend-side rate limiting on the ingest endpoint.

## 6. Verification commands

```bash
# Malformed payload should not crash bridge
curl -X POST http://localhost:8081/api/v1/physio/pulse/ingest \
  -H "Content-Type: application/json" \
  -d 'not-json' | should return 400

# Missing fields should return 400
curl -X POST http://localhost:8081/api/v1/physio/pulse/ingest \
  -H "Content-Type: application/json" \
  -d '{"ts_ms":123}' | should return 400
```
