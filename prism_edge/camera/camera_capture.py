"""
Camera capture module for PRISM Edge Behaviour Node.
Handles USB webcam init, frame capture, reconnection, and graceful shutdown.
"""

from __future__ import annotations

import logging
import sys
import threading
import time
from typing import Any, Optional, Tuple, TYPE_CHECKING

import numpy as np

from prism_edge import config

if TYPE_CHECKING:
    import cv2

    VideoCapture = cv2.VideoCapture
else:
    VideoCapture = None  # type: ignore[assignment]

try:
    import cv2

    HAS_CV2 = True
except ImportError:
    cv2: Any = None  # type: ignore[assignment]
    HAS_CV2 = False

logger = logging.getLogger(__name__)


class CameraCapture:
    """
    Thread-safe USB camera capture with auto-reconnect.

    Lifecycle:
        camera = CameraCapture()
        camera.start()
        frame, timestamp = camera.read()     # thread-safe
        camera.stop()
    """

    def __init__(self):
        self._camera_id: int = config.CAMERA_ID
        self._width: int = config.CAMERA_WIDTH
        self._height: int = config.CAMERA_HEIGHT
        self._target_fps: int = config.CAMERA_FPS
        self._reconnect_delay: float = config.CAMERA_RECONNECT_DELAY
        self._backend: int = config.CAMERA_BACKEND

        # Default to V4L2 on Linux to avoid GStreamer Wayland/X11
        # clipboard errors
        if self._backend == 0 and sys.platform.startswith("linux") and HAS_CV2:
            self._backend = cv2.CAP_V4L2

        self._cap: Optional[VideoCapture] = None
        self._lock: threading.Lock = threading.Lock()
        self._running: bool = False
        self._connected: bool = False
        self._last_frame: Optional[np.ndarray] = None
        self._last_timestamp: float = 0.0
        self._frame_count: int = 0
        self._reconnect_count: int = 0
        self._capture_thread: Optional[threading.Thread] = None

    # ── Public API ──────────────────────────────────────────────────

    def start(self) -> bool:
        """
        Initialize camera and start continuous capture thread.
        Returns True on success.
        """
        if not HAS_CV2:
            logger.warning("OpenCV not available — camera disabled")
            return False
        if self._running:
            return self._connected

        self._running = True
        self._connected = self._init_camera()

        if self._connected:
            logger.info(
                "Camera %d opened: %dx%d @ %d fps",
                self._camera_id,
                self._width,
                self._height,
                self._target_fps,
            )
        else:
            logger.warning(
                "Camera %d failed to open; will retry in background",
                self._camera_id,
            )

        self._capture_thread = threading.Thread(
            target=self._capture_loop, name="camera-capture", daemon=True
        )
        self._capture_thread.start()
        return self._connected

    def stop(self) -> None:
        """Graceful shutdown — release camera and join thread."""
        self._running = False
        if self._capture_thread and self._capture_thread.is_alive():
            self._capture_thread.join(timeout=3.0)
            if self._capture_thread.is_alive():
                logger.warning(
                    "Camera capture thread did not terminate gracefully."
                )
        else:
            self._release_camera()
        logger.info("Camera stopped")

    def read(self) -> Tuple[Optional[np.ndarray], float]:
        """
        Thread-safe read of the latest frame and its timestamp.
        Returns (frame, timestamp) or (None, 0.0) if no frame available.
        """
        with self._lock:
            frame = (
                self._last_frame.copy()
                if self._last_frame is not None
                else None
            )
            ts = self._last_timestamp
        return frame, ts

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def frame_count(self) -> int:
        return self._frame_count

    @property
    def reconnect_count(self) -> int:
        return self._reconnect_count

    # ── Internal ────────────────────────────────────────────────────

    def _init_camera(self) -> bool:
        """Attempt to open the camera with configured parameters."""
        cap = cv2.VideoCapture(self._camera_id, self._backend)
        if not cap.isOpened():
            return False

        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self._width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self._height)
        cap.set(cv2.CAP_PROP_FPS, self._target_fps)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # minimize latency

        # Prefer MJPG codec on Linux for higher effective FPS
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))

        self._cap = cap
        return True

    def _release_camera(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        self._connected = False

    def _reconnect(self) -> None:
        self._release_camera()
        time.sleep(self._reconnect_delay)
        self._connected = self._init_camera()
        self._reconnect_count += 1
        if self._connected:
            logger.info(
                "Camera %d reconnected (attempt %d)",
                self._camera_id,
                self._reconnect_count,
            )
        else:
            logger.warning(
                "Camera %d reconnect failed (attempt %d)",
                self._camera_id,
                self._reconnect_count,
            )

    def _capture_loop(self) -> None:
        """Background thread: continuously grab frames from the camera."""
        try:
            while self._running:
                if not self._connected:
                    self._reconnect()
                    continue

                try:
                    assert self._cap is not None
                    ret, frame = self._cap.read()
                    if not ret or frame is None:
                        logger.warning("Camera read returned empty frame")
                        self._reconnect()
                        continue

                    timestamp = time.time()
                    self._frame_count += 1

                    with self._lock:
                        self._last_frame = frame
                        self._last_timestamp = timestamp

                except Exception as e:
                    logger.error("Camera read exception: %s", e)
                    self._reconnect()
        finally:
            self._release_camera()
