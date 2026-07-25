# PRISM Edge Behaviour Node — Architecture & Design

**Document Type:** Production Engineering Design  
**Target Hardware:** Raspberry Pi 4B (4 GB RAM, 64-bit Raspberry Pi OS)  
**Role:** Edge Feature Extraction & Sensor Bridge  
**PRISM Phase:** Phase 2 — Enhanced Sensing  
**Date:** 2026-07-25  

---

## 1. High-Level Architecture

### 1.1 Role in the PRISM System

The Raspberry Pi 4B serves as the **PRISM Edge Behaviour Node** — a lightweight, low-power edge computing device that performs feature extraction from camera and microphone inputs and bridges ESP32 PRISM PULSE telemetry to the cloud. All heavy AI inference (classification, anomaly detection, behavioural scoring) runs on the remote PRISM AI Server.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PRISM EDGE BEHAVIOUR NODE                            │
│                        Raspberry Pi 4B (4 GB RAM)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │ USB Webcam   │   │ USB Micro-   │   │ ESP32 PRISM  │   │ PRISM AI     │ │
│  │ (Video)      │   │ phone (Audio)│   │ PULSE Node   │   │ Server       │ │
│  └──────┬───────┘   └──────┬───────┘   │ (WiFi/UART)  │   │ (Cloud/LAN)  │ │
│         │                  │            └──────┬───────┘   └──────▲───────┘ │
│         ▼                  ▼                   ▼                   │        │
│  ┌──────────────────────────────────────────────────────────────┐  │        │
│  │                   PRISM EDGE CORE ENGINE                      │  │        │
│  │                                                               │  │        │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │  │        │
│  │  │ Vision       │  │ Audio        │  │ Sensor Bridge      │  │  │        │
│  │  │ Pipeline     │  │ Pipeline     │  │ (ESP32 → Cloud)    │  │  │        │
│  │  │              │  │              │  │                    │  │  │        │
│  │  │ • Face Mesh  │  │ • MFCC       │  │ • HTTP ingest      │  │  │        │
│  │  │ • Pose       │  │ • Pitch/Energy│  │ • Data relay      │  │  │        │
│  │  │ • Motion     │  │ • VAD        │  │ • Queue + retry   │  │  │        │
│  │  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘  │  │        │
│  │         │                 │                    │              │  │        │
│  │         └─────────────────┴────────────────────┘              │  │        │
│  │                            │                                  │  │        │
│  │                    ┌───────▼────────┐                         │  │        │
│  │                    │ Feature Packer │                         │  │        │
│  │                    │ + Sync + Queue │                         │  │        │
│  │                    └───────┬────────┘                         │  │        │
│  │                            │                                  │  │        │
│  │                    ┌───────▼────────┐                         │──┘        │
│  │                    │  API Client    │                                     │
│  │                    │  (REST/WS/MQTT)│                                     │
│  │                    └────────────────┘                                     │
│  └──────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ System Services                                                        │  │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │  │
│  │ │Watchdog  │ │Logging   │ │Health    │ │Config    │ │Signal Handlers│ │  │
│  │ │Timer     │ │(JSON)    │ │Monitor   │ │Manager   │ │(graceful kill)│ │  │
│  │ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Design Philosophy

| Constraint | Decision |
|-----------|----------|
| No AI inference on edge | All classification and anomaly detection on PRISM AI Server |
| Low CPU/RAM | MediaPipe CPU backend, no GPU delegate; 640×480 capture |
| High throughput | Multi-threaded pipelines; each sensor has its own thread |
| Reliability | Watchdog timers, reconnect loops, graceful degradation |
| Modularity | Clean separation: capture → extract → pack → transmit |
| PRISM compliance | Metadata only; no raw audio/video frames leave the edge |

### 1.3 Module Responsibilities

| Module | Responsibility |
|--------|---------------|
| `main.py` | Application entry point, thread orchestration, signal handling, health monitoring |
| `config.py` | Centralized configuration via env vars + dotenv |
| `camera/camera_capture.py` | USB webcam init, frame capture, resolution/FPS control, reconnection |
| `vision/face_features.py` | MediaPipe Face Mesh → 468 landmarks → eye openness, head pose, mouth, smile |
| `vision/pose_features.py` | MediaPipe Pose → 33 landmarks → torso angle, posture classification, limb angles |
| `vision/motion_features.py` | OpenCV sparse optical flow + frame differencing → motion magnitude, idle detection |
| `audio/voice_features.py` | sounddevice capture → librosa MFCC, pitch, energy, spectral features, VAD |
| `bridge/esp32_bridge.py` | HTTP server to receive ESP32 PULSE telemetry, forward to PRISM API |
| `packer/feature_packer.py` | Synchronize features from all pipelines, build JSON payload |
| `api/client.py` | REST + WebSocket client with auth, retry, exponential backoff, offline queue |
| `utils/logging_setup.py` | JSON structured logging with rotation |
| `utils/health_monitor.py` | CPU/RAM/temperature tracking embedded in payloads |

---

## 2. Data Flow

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Camera Thread│  │ Audio Thread │  │  ESP32 Bridge │  │ Motion Thread│
│ 30 fps       │  │ 16 kHz mono  │  │  (HTTP serve) │  │ 15 fps calc  │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │ face mesh       │ MFCC + pitch   │ JSON relay       │ opt flow
       │ pose landmarks  │ energy + VAD   │ {ts_ms,bpm,      │ motion mag
       │ head angles     │ spectral       │  g_force,        │ idle flag
       ▼                 ▼                 ▼                  ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │                   Feature Packer (every 2 seconds)               │
 │                                                                  │
 │  Synchronize latest features from all pipelines                  │
 │  Build unified JSON payload                                      │
 │  Push to tx_queue                                                │
 └─────────────────────────────┬───────────────────────────────────┘
                               ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │                     API Client (Writer Thread)                   │
 │                                                                  │
 │  Drain tx_queue                                                  │
 │  POST /api/v1/events/ingest/unified  (behavioural features)      │
 │  POST /api/v1/physio/pulse/ingest    (ESP32 PULSE relay)        │
 │  Exponential backoff on failure                                  │
 │  Offline disk queue if network down                              │
 └─────────────────────────────┬───────────────────────────────────┘
                               ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │                     PRISM AI Server (Remote)                     │
 │                                                                  │
 │  FastAPI: ingest → run_risk_engine → generate alerts             │
 │  PostgreSQL: store unified events                                │
 │  Redis: pub/sub to guardian dashboard                            │
 └─────────────────────────────────────────────────────────────────┘
```

---

## 3. Threading Model

```
Main Process (main.py)
│
├── CameraThread        (Thread-1)   30 fps capture + face + pose extraction
│   └── produces: face_features, pose_features
│
├── MotionThread        (Thread-2)   15 Hz frame differencing + optical flow
│   └── produces: motion_features
│
├── AudioThread         (Thread-3)   16 kHz capture, 2s windows, MFCC extraction
│   └── produces: voice_features
│
├── ESP32BridgeThread   (Thread-4)   HTTP server on LAN port 8081
│   └── produces: esp32_telemetry, relays to packer
│
├── PackerThread        (Thread-5)   Every 2s: collect latest features → build JSON → push queue
│   └── produces: tx_queue entries
│
└── WriterThread        (Thread-6)   Drain tx_queue → HTTP POST to PRISM API
    └── handles: retry logic, backoff, offline disk queue

All threads communicate via thread-safe queues (queue.Queue) and
shared dictionaries with threading.Lock() guards for feature state.
```

### 3.1 Thread Safety Contract

- Each pipeline thread writes its latest features into a thread-safe shared dict: `shared_state["face"]`, `shared_state["pose"]`, `shared_state["motion"]`, `shared_state["voice"]`, `shared_state["esp32_pulse"]`
- `threading.Lock()` acquired only for the dictionary write (microseconds)
- Packer thread reads snapshot under lock, releases immediately
- `queue.Queue` for tx_queue (inherently thread-safe)
- **No shared OpenCV/MediaPipe objects across threads** — each thread owns its VideoCapture/MediaPipe instances

---

## 4. ESP32 PRISM PULSE Integration

The Raspberry Pi runs a lightweight HTTP server (`bridge/esp32_bridge.py`) on port 8081 to receive telemetry from the ESP32 PRISM PULSE node. The ESP32 is already configured (in `prism_pulse.ino` v5.0) to POST to a configurable `API_BASE_URL` with a device JWT.

### 4.1 Why RPi Bridges ESP32

- ESP32 on same WiFi network as RPi
- RPi handles auth, retry, offline queuing, batching
- ESP32 stays simple — just fire-and-forget HTTP POST every 5s
- RPi can combine ESP32 data with camera/audio features in the same payload

### 4.2 Data Flow

```
ESP32 PRISM PULSE                    Raspberry Pi 4B                  PRISM AI Server
┌─────────────────┐    POST /pulse   ┌──────────────────────┐    POST    ┌──────────────┐
│ BPM + g-force   │ ───────────────▶ │ esp32_bridge.py      │ ─────────▶ │ FastAPI      │
│ alert_status    │   every 5s       │ (Flask HTTP server)  │  batch or  │ /physio/     │
│ device_jwt      │   JSON payload   │ port 8081            │  relay     │ pulse/ingest │
└─────────────────┘                  └──────────────────────┘            └──────────────┘
```

### 4.3 ESP32 Firmware Config Update

The ESP32 `API_BASE_URL` should point to the RPi's LAN IP:
```cpp
#define API_BASE_URL    "http://192.168.1.50:8081"  // RPi LAN IP
#define DEVICE_JWT      "YOUR_DEVICE_JWT_TOKEN"
```

The `esp32_bridge.py` receives it, optionally enriches with RPi-side features, and forwards to the real PRISM API.

---

## 5. JSON Payload Schema

### 5.1 Unified Behaviour Edge Payload

```json
{
  "subject_id": "prism-edge-rpi4b-001",
  "timestamp": "2026-07-25T18:30:00.000Z",
  "modality": "edge_behaviour",
  "confidence": 0.95,
  "value": {
    "face": {
      "present": true,
      "confidence": 0.98,
      "eye_openness_left": 0.85,
      "eye_openness_right": 0.83,
      "blink_ratio": 0.12,
      "head_yaw_deg": -3.2,
      "head_pitch_deg": 1.4,
      "head_roll_deg": 0.8,
      "mouth_openness": 0.05,
      "smile_coefficient": 0.02,
      "face_center_x": 0.51,
      "face_center_y": 0.48,
      "face_bbox": [120, 80, 380, 400],
      "tracking_id": 1
    },
    "pose": {
      "present": true,
      "confidence": 0.92,
      "torso_angle_deg": 5.3,
      "spine_angle_deg": 3.1,
      "shoulder_angle_deg": 2.7,
      "left_elbow_angle_deg": 145.2,
      "right_elbow_angle_deg": 150.8,
      "left_knee_angle_deg": 172.1,
      "right_knee_angle_deg": 170.5,
      "posture": "seated",
      "body_center_x": 0.49,
      "body_center_y": 0.55
    },
    "motion": {
      "motion_magnitude": 0.08,
      "motion_direction_deg": 45.0,
      "movement_speed_px_per_sec": 12.4,
      "is_idle": true,
      "idle_duration_sec": 28.0,
      "optical_flow_mean": 0.03,
      "frame_diff_mean": 5.2
    },
    "voice": {
      "voice_active": true,
      "rms_energy": 0.15,
      "pitch_hz": 180.5,
      "zero_crossing_rate": 0.08,
      "mfcc_mean": [-12.3, -4.5, 2.1, 5.8, 1.2, -0.8, -3.2, -1.1, 0.4, -2.3, 1.5, 0.9, -0.7],
      "spectral_centroid_hz": 850.2,
      "spectral_bandwidth_hz": 1200.5,
      "spectral_rolloff_hz": 2500.0,
      "chroma_mean": [0.2, 0.1, 0.05, 0.15, 0.3, 0.1, 0.05, 0.02, 0.01, 0.01, 0.005, 0.005],
      "speaking_duration_sec": 12.3,
      "silence_duration_sec": 3.8,
      "avg_loudness_db": -28.5,
      "peak_loudness_db": -12.1
    },
    "esp32_pulse": {
      "ts_ms": 45000,
      "pulse_raw": 1950,
      "bpm": 72,
      "g_force": 1.02,
      "alert_status": "OK"
    },
    "system_health": {
      "cpu_percent": 35.2,
      "ram_percent": 42.8,
      "temperature_c": 52.1,
      "uptime_sec": 86400
    }
  },
  "edge_version": "1.0.0",
  "device_type": "raspberry_pi_4b"
}
```

---

## 6. Configuration (config.py — Environment Variables)

```env
# Camera
PRISM_CAMERA_ID=0
PRISM_CAMERA_WIDTH=640
PRISM_CAMERA_HEIGHT=480
PRISM_CAMERA_FPS=30

# MediaPipe
PRISM_MEDIAPIPE_FACE_CONFIDENCE=0.5
PRISM_MEDIAPIPE_POSE_CONFIDENCE=0.5

# Audio
PRISM_AUDIO_SAMPLE_RATE=16000
PRISM_AUDIO_CHUNK_MS=2000
PRISM_AUDIO_DEVICE_INDEX=0

# PRISM API Server
PRISM_API_BASE_URL=http://192.168.1.100:8000
PRISM_API_KEY=
PRISM_DEVICE_ID=prism-edge-rpi4b-001
PRISM_DEVICE_JWT=

# ESP32 Bridge
PRISM_ESP32_BRIDGE_PORT=8081
PRISM_ESP32_BRIDGE_HOST=0.0.0.0

# Performance
PRISM_FEATURE_INTERVAL_SEC=2.0
PRISM_MOTION_FPS=15
PRISM_FACE_SCALE=0.5
PRISM_MAX_QUEUE_SIZE=500

# Reliability
PRISM_RECONNECT_TIMEOUT_SEC=30
PRISM_RETRY_INTERVAL_SEC=5
PRISM_MAX_RETRIES=5
PRISM_RETRY_BACKOFF_BASE=2.0

# Logging
PRISM_LOG_LEVEL=INFO
PRISM_LOG_DIR=/var/log/prism-edge
```

---

## 7. Error Handling & Recovery

| Failure Scenario | Recovery Strategy |
|-----------------|-------------------|
| Camera disconnect | `VideoCapture.isOpened()` check every frame; auto-reconnect with 2s backoff |
| Microphone disconnect | `sounddevice` callback catches PortAudioError; re-initialize stream |
| MediaPipe init failure | Log error, set `face.present = false`, continue with other pipelines |
| ESP32 offline | ESP32 bridge returns 200 anyway; ESP32 retries on its own schedule |
| PRISM API unreachable | Exponential backoff (2s → 4s → 8s → 16s → 32s max); queue to disk if >60s offline |
| Disk full | `queue.Queue` has max size; oldest entries dropped with warning log |
| Memory pressure | Health monitor checks RAM% every 30s; if >90%, drop frames to reduce buffer |
| Thermal throttle | If temp > 80°C, reduce camera FPS to 15 and motion calculation to 5 Hz |
| Thread crash | Main thread monitors all child threads via `threading.enumerate()` + heartbeat counters |

---

## 8. Performance Budget

| Metric | Target | Achieved Through |
|--------|--------|-----------------|
| CPU usage | <50% (2 cores of 4) | MediaPipe CPU backend, 640×480, face scale 0.5 |
| RAM usage | <1 GB | Fixed-size queues, no frame buffering beyond 2 frames |
| Camera FPS | 25–30 | OpenCV CAP_PROP_FPS, hardware-accelerated decode |
| Face mesh latency | <50 ms per frame | MediaPipe with MODEL_SELECTION=0 (lite) |
| Pose latency | <30 ms per frame | MediaPipe Pose with static_image_mode=False |
| Audio feature latency | <100 ms per 2s window | librosa optimized with piwheels numpy |
| Feature interval | 2 seconds | Packer thread timer, not per-frame |
| Network bandwidth | <5 KB/s average | JSON compressed, 2-second aggregation |
| Power consumption | <10 W typical | No GPU delegates, efficient CPU usage |

---

## 9. Deployment Architecture

```
Raspberry Pi 4B (Raspberry Pi OS 64-bit, Bookworm)
│
├── /opt/prism-edge/                   # Application root
│   ├── main.py
│   ├── config.py
│   ├── requirements.txt
│   ├── .env                            # Environment config
│   ├── camera/
│   │   └── camera_capture.py
│   ├── vision/
│   │   ├── face_features.py
│   │   ├── pose_features.py
│   │   └── motion_features.py
│   ├── audio/
│   │   └── voice_features.py
│   ├── bridge/
│   │   └── esp32_bridge.py
│   ├── packer/
│   │   └── feature_packer.py
│   ├── api/
│   │   └── client.py
│   └── utils/
│       ├── logging_setup.py
│       └── health_monitor.py
│
├── /var/log/prism-edge/               # Log directory
│   ├── prism-edge.log
│   ├── prism-edge.1.log
│   └── ...
│
├── /var/lib/prism-edge/               # Offline queue
│   └── offline_queue/
│
└── /etc/systemd/system/
    └── prism-edge.service              # Systemd unit
```

### Systemd Service

```ini
[Unit]
Description=PRISM Edge Behaviour Node
After=network.target

[Service]
Type=simple
User=prism
WorkingDirectory=/opt/prism-edge
EnvironmentFile=/opt/prism-edge/.env
ExecStart=/opt/prism-edge/.venv/bin/python main.py
Restart=always
RestartSec=10
StandardOutput=append:/var/log/prism-edge/prism-edge.log
StandardError=append:/var/log/prism-edge/prism-edge.log

[Install]
WantedBy=multi-user.target
```

---

## 10. Dependencies (requirements.txt)

```
opencv-python-headless==4.10.0.84
mediapipe==0.10.18
numpy>=1.24.0,<2.0
scipy>=1.10.0
librosa>=0.10.0
sounddevice>=0.4.6
requests>=2.31.0
websocket-client>=1.6.0
python-dotenv>=1.0.0
flask>=3.0.0
python-json-logger>=2.0.0
psutil>=5.9.0
```

---

## 11. Installation Commands (Raspberry Pi 4B)

```bash
# System dependencies
sudo apt update
sudo apt install -y python3-pip python3-venv python3-dev \
    libatlas-base-dev libopenblas-dev libportaudio2 \
    portaudio19-dev libsndfile1 ffmpeg

# Create application directory
sudo mkdir -p /opt/prism-edge /var/log/prism-edge /var/lib/prism-edge/offline_queue
sudo chown -R pi:pi /opt/prism-edge /var/log/prism-edge /var/lib/prism-edge

# Virtual environment
cd /opt/prism-edge
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Verify camera and audio
python3 -c "import cv2; cap = cv2.VideoCapture(0); print(cap.isOpened())"
python3 -c "import sounddevice as sd; print(sd.query_devices())"

# Install and enable service
sudo cp /opt/prism-edge/prism-edge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable prism-edge
sudo systemctl start prism-edge
```

---

## 12. Future Improvements

- **ONNX Runtime**: If MediaPipe CPU usage exceeds budget, convert face mesh to ONNX for ~30% faster inference
- **Hailo-8L NPU**: USB AI accelerator for face/pose inference, freeing CPU for audio DSP
- **Multiple camera support**: Add second USB camera for wider-angle room view
- **MQTT broker on RPi**: Run local Mosquitto for ESP32/other IoT devices instead of HTTP bridge
- **TFLite models**: Replace librosa MFCC with on-device TFLite audio feature extractor
- **Edge anomaly detection**: Run lightweight anomaly detector (e.g., isolation forest) locally as a pre-filter
- **Docker containerization**: Package as Docker image for easier deployment across multiple devices
- **Signed OTA updates**: Signed firmware update mechanism via PRISM API

---

**Document approved for Day 2 implementation.**
