#!/usr/bin/env python3
"""
PRISM Edge Behaviour Node — Main Application Entry Point.

Orchestrates all pipelines: camera → face + pose + motion extraction,
microphone → voice feature extraction, ESP32 bridge, feature packing,
and API transmission.

Designed for Raspberry Pi 4B running Raspberry Pi OS 64-bit (Bookworm).
"""

import logging
import queue
import signal
import sys
import threading
import time
from typing import Dict, Any

cv2 = None  # lazy import — allow graceful failure if OpenCV missing

from prism_edge import config
from prism_edge.utils.logging_setup import setup_logging

logger = logging.getLogger("prism-edge.main")


# ── Shared State ──────────────────────────────────────────────────────
shared_state: Dict[str, Any] = {
    "face": {},
    "pose": {},
    "motion": {},
    "voice": {},
    "esp32_pulse": {},
}
state_lock = threading.Lock()

# Transmission queue (thread-safe, bounded)
tx_queue = queue.Queue(maxsize=config.MAX_QUEUE_SIZE)

# Pipeline object references for cleanup
_pipelines: dict = {}


def main() -> None:
    """Application entry point."""
    setup_logging()
    config.ensure_directories()
    config.print_config()
    logger.info("=== PRISM Edge Behaviour Node v%s starting ===", config.EDGE_VERSION)

    # Register signal handlers for graceful shutdown
    shutdown_event = threading.Event()
    signal.signal(signal.SIGINT, lambda s, f: shutdown_event.set())
    signal.signal(signal.SIGTERM, lambda s, f: shutdown_event.set())

    # ── Import-heavy modules (lazy) ────────────────────────────────
    global cv2

    # ── 1. Start ESP32 Bridge (lightweight Flask HTTP server) ──────
    from prism_edge.bridge.esp32_bridge import start_bridge
    bridge_thread = start_bridge(shared_state, state_lock)
    _pipelines["bridge"] = bridge_thread

    # ── 2. Start Camera + Vision Pipelines ─────────────────────────
    try:
        import cv2 as _cv2
        cv2 = _cv2
    except ImportError:
        logger.warning("OpenCV not available — camera/vision pipelines disabled")
        cv2 = None

    face_extractor = None
    pose_extractor = None
    motion_extractor = None
    camera = None

    if cv2 is not None:
        from prism_edge.camera.camera_capture import CameraCapture
        from prism_edge.vision.face_features import FaceFeatureExtractor
        from prism_edge.vision.pose_features import PoseFeatureExtractor
        from prism_edge.vision.motion_features import MotionFeatureExtractor

        camera = CameraCapture()
        camera.start()

        face_extractor = FaceFeatureExtractor()
        face_extractor.start()

        pose_extractor = PoseFeatureExtractor()
        pose_extractor.start()

        motion_extractor = MotionFeatureExtractor()
        motion_extractor.start()

        _pipelines["camera"] = camera
        _pipelines["face"] = face_extractor
        _pipelines["pose"] = pose_extractor
        _pipelines["motion"] = motion_extractor

        # Start vision processing thread
        vision_thread = threading.Thread(
            target=vision_loop,
            args=(camera, face_extractor, pose_extractor, motion_extractor, shutdown_event),
            name="vision-pipeline",
            daemon=True,
        )
        vision_thread.start()
        _pipelines["vision_thread"] = vision_thread
    else:
        # Camera disabled — set empty features
        with state_lock:
            shared_state["face"] = {"present": False, "confidence": 0.0}
            shared_state["pose"] = {"present": False, "confidence": 0.0}
            shared_state["motion"] = {"motion_magnitude": 0.0, "is_idle": True}

    # ── 3. Start Audio Pipeline ────────────────────────────────────
    from prism_edge.audio.voice_features import VoiceFeatureExtractor
    voice_extractor = VoiceFeatureExtractor()
    voice_extractor.start()
    _pipelines["voice"] = voice_extractor

    # ── 4. Start Feature Packer ────────────────────────────────────
    from prism_edge.packer.feature_packer import FeaturePacker
    packer = FeaturePacker(shared_state, state_lock, tx_queue)
    packer.start()
    _pipelines["packer"] = packer

    # ── 5. Start API Client (Writer) ───────────────────────────────
    from prism_edge.api.client import ApiClient
    api_client = ApiClient(tx_queue)
    api_client.start()
    _pipelines["api"] = api_client

    logger.info("All pipelines started — running")

    # ── 6. Health Monitor + Audio State Sync Loop ──────────────────
    last_health_log = 0.0
    while not shutdown_event.is_set():
        time.sleep(1.0)

        # Sync voice features into shared state
        if voice_extractor.ready:
            voice_features = voice_extractor.read()
            with state_lock:
                shared_state["voice"] = voice_features

        # Log health periodically
        now = time.time()
        if now - last_health_log >= config.HEALTH_CHECK_INTERVAL_SEC:
            last_health_log = now
            from prism_edge.utils.health_monitor import get_health_snapshot
            health = get_health_snapshot()
            api_connected = "connected" if api_client.connected else f"disconnected ({api_client.consecutive_failures} failures)"
            logger.info(
                "Health: CPU=%.1f%% RAM=%.1f%% Temp=%.1f°C API=%s Queue=%d",
                health["cpu_percent"], health["ram_percent"],
                health["temperature_c"], api_connected, tx_queue.qsize(),
            )

            # Thermal throttle warning
            if health["temperature_c"] > config.TEMP_THROTTLE_C:
                logger.warning("Thermal throttle: %.1f°C exceeds threshold %.0f°C",
                               health["temperature_c"], config.TEMP_THROTTLE_C)

    # ── 7. Graceful Shutdown ───────────────────────────────────────
    logger.info("Shutdown signal received — stopping pipelines...")
    shutdown()


def vision_loop(
    camera,
    face_extractor,
    pose_extractor,
    motion_extractor,
    shutdown_event: threading.Event,
) -> None:
    """
    Vision pipeline thread: reads camera frames, extracts face + pose + motion features,
    and updates shared state. Runs at camera FPS, throttled by extraction cost.
    """
    last_motion_frame_time = 0.0
    motion_interval = 1.0 / max(config.MOTION_FPS, 1)

    logger.info("Vision pipeline started")

    while not shutdown_event.is_set():
        frame, timestamp = camera.read()
        if frame is None:
            time.sleep(0.01)
            continue

        # Face extraction
        if face_extractor.ready:
            try:
                face_feats = face_extractor.extract(frame, timestamp)
                with state_lock:
                    shared_state["face"] = face_feats
            except Exception as e:
                logger.debug("Face extraction error: %s", e)

        # Pose extraction
        if pose_extractor.ready:
            try:
                pose_feats = pose_extractor.extract(frame, timestamp)
                with state_lock:
                    shared_state["pose"] = pose_feats
            except Exception as e:
                logger.debug("Pose extraction error: %s", e)

        # Motion extraction (throttled to MOTION_FPS)
        if motion_extractor.ready and (timestamp - last_motion_frame_time) >= motion_interval:
            last_motion_frame_time = timestamp
            try:
                motion_feats = motion_extractor.extract(frame, timestamp)
                with state_lock:
                    shared_state["motion"] = motion_feats
            except Exception as e:
                logger.debug("Motion extraction error: %s", e)


def shutdown() -> None:
    """Gracefully stop all pipelines."""
    for name, obj in reversed(list(_pipelines.items())):
        try:
            if hasattr(obj, "stop"):
                obj.stop()
                logger.info("Stopped: %s", name)
        except Exception as e:
            logger.error("Error stopping %s: %s", name, e)

    logger.info("=== PRISM Edge Behaviour Node stopped ===")
    sys.exit(0)


if __name__ == "__main__":
    main()
