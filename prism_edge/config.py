"""
PRISM Edge Behaviour Node — Central Configuration.
All tunables live here, sourced from environment variables with sensible defaults.
"""

import os
from pathlib import Path

# ── Directory Layout ──────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
LOG_DIR = Path(os.getenv("PRISM_LOG_DIR", "/var/log/prism-edge"))
DATA_DIR = Path(os.getenv("PRISM_DATA_DIR", "/var/lib/prism-edge"))
OFFLINE_QUEUE_DIR = DATA_DIR / "offline_queue"

# ── Camera ────────────────────────────────────────────────────────────
CAMERA_ID: int = int(os.getenv("PRISM_CAMERA_ID", "0"))
CAMERA_WIDTH: int = int(os.getenv("PRISM_CAMERA_WIDTH", "640"))
CAMERA_HEIGHT: int = int(os.getenv("PRISM_CAMERA_HEIGHT", "480"))
CAMERA_FPS: int = int(os.getenv("PRISM_CAMERA_FPS", "30"))
CAMERA_RECONNECT_DELAY: float = float(os.getenv("PRISM_CAMERA_RECONNECT_DELAY", "2.0"))
CAMERA_BACKEND: int = int(os.getenv("PRISM_CAMERA_BACKEND", "0"))  # V4L2 on Linux

# ── MediaPipe ─────────────────────────────────────────────────────────
MEDIAPIPE_FACE_CONFIDENCE: float = float(
    os.getenv("PRISM_MEDIAPIPE_FACE_CONFIDENCE", "0.5")
)
MEDIAPIPE_POSE_CONFIDENCE: float = float(
    os.getenv("PRISM_MEDIAPIPE_POSE_CONFIDENCE", "0.5")
)
MEDIAPIPE_FACE_MODEL: int = int(
    os.getenv("PRISM_MEDIAPIPE_FACE_MODEL", "0")
)  # 0=short-range lite model
FACE_SCALE: float = float(os.getenv("PRISM_FACE_SCALE", "0.5"))

# ── Audio ─────────────────────────────────────────────────────────────
AUDIO_SAMPLE_RATE: int = int(os.getenv("PRISM_AUDIO_SAMPLE_RATE", "16000"))
AUDIO_CHUNK_MS: int = int(os.getenv("PRISM_AUDIO_CHUNK_MS", "2000"))
AUDIO_DEVICE_INDEX: int = int(os.getenv("PRISM_AUDIO_DEVICE_INDEX", "0"))
AUDIO_CHANNELS: int = 1
AUDIO_N_MFCC: int = 13
AUDIO_N_FFT: int = 1024
AUDIO_HOP_LENGTH: int = 512
AUDIO_VAD_THRESHOLD_DB: float = float(os.getenv("PRISM_VAD_THRESHOLD_DB", "-40.0"))
AUDIO_VAD_MIN_DURATION_SEC: float = float(
    os.getenv("PRISM_VAD_MIN_DURATION_SEC", "0.15")
)

# ── Motion ────────────────────────────────────────────────────────────
MOTION_FPS: int = int(os.getenv("PRISM_MOTION_FPS", "15"))
MOTION_OPTICAL_FLOW_WINDOW: int = 15
MOTION_IDLE_THRESHOLD: float = float(os.getenv("PRISM_MOTION_IDLE_THRESHOLD", "0.05"))
MOTION_IDLE_CONFIRMATION_SEC: float = float(
    os.getenv("PRISM_MOTION_IDLE_CONFIRMATION_SEC", "3.0")
)

# ── Feature Packing ───────────────────────────────────────────────────
FEATURE_INTERVAL_SEC: float = float(os.getenv("PRISM_FEATURE_INTERVAL_SEC", "2.0"))

# ── PRISM API Server ──────────────────────────────────────────────────
API_BASE_URL: str = os.getenv("PRISM_API_BASE_URL", "http://127.0.0.1:8000").strip()
API_DEVICE_ID: str = os.getenv("PRISM_DEVICE_ID", "prism-edge-rpi4b-001").strip()
API_DEVICE_JWT: str = os.getenv("PRISM_DEVICE_JWT", "").strip()
API_WEBSOCKET_URL: str = os.getenv("PRISM_API_WEBSOCKET_URL", "").strip()
API_INGEST_ENDPOINT: str = "/api/v1/events/ingest/unified"
API_PULSE_ENDPOINT: str = "/api/v1/physio/pulse/ingest"

# ── ESP32 Bridge ──────────────────────────────────────────────────────
ESP32_BRIDGE_HOST: str = os.getenv("PRISM_ESP32_BRIDGE_HOST", "0.0.0.0").strip()
ESP32_BRIDGE_PORT: int = int(os.getenv("PRISM_ESP32_BRIDGE_PORT", "8081"))

# ── Reliability ───────────────────────────────────────────────────────
RECONNECT_TIMEOUT_SEC: float = float(os.getenv("PRISM_RECONNECT_TIMEOUT_SEC", "30.0"))
RETRY_INTERVAL_SEC: float = float(os.getenv("PRISM_RETRY_INTERVAL_SEC", "5.0"))
MAX_RETRIES: int = int(os.getenv("PRISM_MAX_RETRIES", "5"))
RETRY_BACKOFF_BASE: float = float(os.getenv("PRISM_RETRY_BACKOFF_BASE", "2.0"))
MAX_QUEUE_SIZE: int = int(os.getenv("PRISM_MAX_QUEUE_SIZE", "500"))

# ── Health & Performance ──────────────────────────────────────────────
HEALTH_CHECK_INTERVAL_SEC: float = float(os.getenv("PRISM_HEALTH_CHECK_SEC", "30.0"))
TEMP_THROTTLE_C: float = float(os.getenv("PRISM_TEMP_THROTTLE_C", "80.0"))
RAM_WARNING_PCT: float = float(os.getenv("PRISM_RAM_WARNING_PCT", "90.0"))

# ── Logging ───────────────────────────────────────────────────────────
LOG_LEVEL: str = os.getenv("PRISM_LOG_LEVEL", "INFO")
LOG_FORMAT: str = "json"  # "json" or "text"

# ── Edge Version ──────────────────────────────────────────────────────
EDGE_VERSION: str = "1.0.0"
DEVICE_TYPE: str = "raspberry_pi_4b"


def ensure_directories() -> None:
    """Create required directories if they don't exist."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    OFFLINE_QUEUE_DIR.mkdir(parents=True, exist_ok=True)


def print_config() -> None:
    """Print current configuration (excluding secrets) for startup log."""
    import json

    safe = {
        "camera": {
            "id": CAMERA_ID,
            "width": CAMERA_WIDTH,
            "height": CAMERA_HEIGHT,
            "fps": CAMERA_FPS,
        },
        "audio": {
            "sample_rate": AUDIO_SAMPLE_RATE,
            "chunk_ms": AUDIO_CHUNK_MS,
            "n_mfcc": AUDIO_N_MFCC,
        },
        "motion": {"fps": MOTION_FPS, "idle_threshold": MOTION_IDLE_THRESHOLD},
        "api": {
            "base_url": API_BASE_URL,
            "device_id": API_DEVICE_ID,
            "endpoint": API_INGEST_ENDPOINT,
        },
        "esp32_bridge": {"host": ESP32_BRIDGE_HOST, "port": ESP32_BRIDGE_PORT},
        "feature_interval_sec": FEATURE_INTERVAL_SEC,
        "edge_version": EDGE_VERSION,
        "log_level": LOG_LEVEL,
        "max_queue_size": MAX_QUEUE_SIZE,
    }
    print(f"[CONFIG] {json.dumps(safe, indent=2)}")
