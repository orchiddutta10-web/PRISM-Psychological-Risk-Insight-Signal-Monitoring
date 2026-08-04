# Phase 4 — Raspberry Pi Backend Audit Report

**Scope:** `prism_edge` behaviour node and `services/api` backend
**Audited on:** 2026-08-04
**Branch:** `iot`

## 1. Architecture summary

```text
┌─────────────────────────────────────────────────────────────┐
│                     Raspberry Pi 4B                         │
│  ┌──────────────┐  ┌──────────────┐  ──────────────┐      │
│  │ ESP32 Bridge │  │ FeaturePacker│  │  API Client  │      │
│  │   :8081      │  │   (2 s loop) │  │   JWT/HTTP   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                  │            │
│         └──── shared_state / tx_queue ─────────┘            │
│                            │                                │
│                     ┌──────┴──────┐                          │
│                     │  Main loop  │                          │
│                     └──────┬──────┘                          │
│         ┌─────────────────┼─────────────────┐                │
│   ┌─────────┐  ┌─────┴────┐  ┌─────┴────┐  ┌──────────┐   │
│   │  Camera  │  │  Audio   │  │  Vision  │  │  Health  │   │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ PRISM API (8000)│
                   │ FastAPI + SQLite│
                   └─────────────────┘
```

## 2. Startup & service configuration

### prism-edge.service

- **File:** `prism_edge/prism-edge.service`
- **User/Group:** `pi`
- **WorkingDirectory:** `/opt/prism-edge`
- **ExecStart:** `/opt/prism-edge/.venv/bin/python /opt/prism-edge/main.py`
- **Restart:** always, 10 s delay
- **Memory:** max 1 GB
- **CPU:** max 200 %

**Finding 4.1 — Deployment path mismatch** ⚠️ HIGH
The repo currently lives at `/home/pi4b/iot-project/PRISM-Psychological-Risk-Insight-Signal-Monitoring/prism_edge`, but the service expects `/opt/prism-edge`.
Either symlink/copy or update the service file.

### services/api startup

- **File:** `services/api/app/main.py`
- Database tables created at import time via `models.Base.metadata.create_all(bind=engine)`.
- Risk registry seeded at import time via `seed_registry(SessionLocal())`.

**Finding 4.2 — Startup side effects at import time** ️ MEDIUM
Database/schema creation and seeding run when the module is imported. This is convenient for local dev but can block startup and cause migrations to clash in production.

## 3. Routing & API endpoints

FastAPI routers registered in `app/main.py`:

| Router | Prefix | Purpose |
|---|---|---|
| auth | `/api/v1/auth` | Guardian/device auth |
| consent | `/api/v1/consent` | Consent management |
| telemetry | `/api/v1/events` | Ingestion + WebSocket |
| audit | `/api/v1/audit` | Audit log read |
| voice | `/api/v1/voice` | Voice check-ins |
| companion | `/api/v1/companion` | Aria companion |
| physio | `/api/v1/physio` | GSR/PPG + PRISM PULSE |
| medical | `/api/v1/medical` | Medical AI RAG |

## 4. WebSocket

- Endpoint: `ws://host:8000/api/v1/events/ws?token=<jwt>`
- Token validated via `jose.jwt.decode`.
- Redis pub/sub forwards `guardian_events:{sub_id}` and `guardian_alerts:{sub_id}` to the WebSocket.
- Used for live dashboard updates.

## 5. MQTT

- **Not used** in current backend design. All IoT communication is HTTP.
- The `websocket-client` library is listed in `prism_edge/requirements.txt` but unused.

## 6. Logging

- API uses structured JSON logging (`app.utils.observability`).
- prism_edge uses standard Python logging with JSON formatter.
- Audit logging middleware writes every request to `AuditLogEntry`.

## 7. Configuration

### prism_edge (`prism_edge/config.py`)

- All tunables have environment variable overrides.
- Defaults are sensible for local dev.
- **Issue:** `API_DEVICE_JWT` defaults to empty string; API client will fail auth.

### services/api (`services/api/app/config.py`)

- Uses `pydantic_settings`.
- **Finding 4.3 — Default secrets present** ⚠️ CRITICAL
  - `JWT_SECRET` default is a hardcoded test key.
  - `ENCRYPTION_KEY` default is hardcoded.
  - `META_VERIFY_TOKEN` default is hardcoded.
  - Production mode raises `ValueError` if defaults are still active. ✅ Good safeguard.

## 8. Exception handling

- prism_edge uses lazy imports for OpenCV/mediapipe and degrades gracefully.
- API client catches `Timeout`, `ConnectionError`, and generic exceptions with retries.
- Feature packer drops oldest payload on full queue.

## 9. Graceful shutdown

- `prism_edge/main.py` registers SIGINT/SIGTERM handlers.
- `_pipelines` dict tracks threads; `shutdown()` calls `stop()` on each.
- API relies on uvicorn signal handling.

## 10. Camera backend integration

**Finding 4.4 — No live video stream to dashboard** ⚠️ HIGH
The current `prism_edge` pipeline extracts metadata from frames (face/pose/motion) and sends only metadata to the API. It does **not** stream or expose MJPEG/WebRTC for the dashboard. The audit prompt's "Live Camera Feed" pipeline is not yet implemented.

**Finding 4.5 — OpenCV V4L2 backend may not work with CSI camera** ⚠️ MEDIUM
`camera_capture.py` uses `cv2.VideoCapture(CAMERA_ID, cv2.CAP_V4L2)`. Raspberry Pi Camera Module v2/v3 on Bookworm uses the `libcamera` pipeline. V4L2 compatibility layer can work, but:
- CSI cameras may need `cv2.CAP_LIBCAMERA` or Picamera2.
- Resolution/FPS setting is best-effort; read-back should be verified.

## 11. Issues summary

| # | Severity | Finding | Location | Recommended fix |
|---|---|---|---|---|
| 4.1 | HIGH | Service path `/opt/prism-edge` does not match repo layout | `prism-edge.service` | Update `WorkingDirectory`/`ExecStart` or add deploy script to install to `/opt` |
| 4.2 | MEDIUM | DB create/seed at import time | `services/api/app/main.py` | Move to explicit `lifespan`/startup handler |
| 4.3 | CRITICAL | Default JWT/encryption/META secrets in source | `services/api/app/config.py` | Already blocked in production; ensure `.env` is required in prod |
| 4.4 | HIGH | No live camera feed endpoint | `prism_edge` | Add MJPEG/WebRTC streaming endpoint |
| 4.5 | MEDIUM | V4L2 may not support CSI camera | `prism_edge/camera/camera_capture.py` | Detect camera type; fallback to libcamera/Picamera2 |
| 4.6 | MEDIUM | Empty `API_DEVICE_JWT` default | `prism_edge/config.py` | Fail startup if JWT missing and API auth required |
| 4.7 | LOW | `websocket-client` unused | `prism_edge/requirements.txt` | Remove if not planned |

## 12. Verification commands

```bash
# Check prism_edge config
python -m prism_edge.config

# Start API and hit health endpoint
cd services/api
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
curl http://localhost:8000/
curl http://localhost:8000/api/internal/ingestion/health

# Check camera detection
python - <<'PY'
import cv2
cap = cv2.VideoCapture(0, cv2.CAP_V4L2)
print("Opened:", cap.isOpened())
cap.release()
PY
```

## 13. Recommendations

1. Update `prism-edge.service` to match the actual deployment path or create an install script.
2. Move DB create/seed from import time to a lifespan startup hook.
3. Add an explicit startup check for `API_DEVICE_JWT`.
4. Implement a lightweight MJPEG streaming endpoint for the dashboard.
5. Add camera backend auto-detection (V4L2 vs libcamera) with Picamera2 fallback.
