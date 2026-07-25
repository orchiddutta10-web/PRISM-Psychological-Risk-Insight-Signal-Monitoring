"""
Lightweight motion estimation for Raspberry Pi using OpenCV.

Uses sparse optical flow (Lucas-Kanade) + frame differencing.
Computationally efficient — designed for 15 Hz on RPi 4B CPU.
"""

import logging
import time
from typing import Dict, Any, Optional

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

import numpy as np

from prism_edge import config

logger = logging.getLogger(__name__)


class MotionFeatureExtractor:
    """
    Computes motion features from consecutive frames.

    Uses:
        - Sparse optical flow (Shi-Tomasi corners + Lucas-Kanade) for direction-aware motion
        - Frame differencing for rapid scene-change detection
        - Accumulated idle timer

    Usage:
        extractor = MotionFeatureExtractor()
        extractor.start()
        features = extractor.extract(bgr_frame, timestamp)
        extractor.stop()
    """

    def __init__(self):
        self._fps: int = config.MOTION_FPS
        self._flow_window: int = config.MOTION_OPTICAL_FLOW_WINDOW
        self._idle_threshold: float = config.MOTION_IDLE_THRESHOLD
        self._idle_confirmation: float = config.MOTION_IDLE_CONFIRMATION_SEC
        self._ready: bool = False

        # State
        self._prev_gray: Optional[np.ndarray] = None
        self._prev_pts: Optional[np.ndarray] = None
        self._is_idle: bool = True
        self._idle_start: float = 0.0
        self._last_motion_mag: float = 0.0
        self._last_motion_dir: float = 0.0

        # Shi-Tomasi corner detection params
        self._feature_params = dict(maxCorners=50, qualityLevel=0.3, minDistance=7, blockSize=7)
        # Lucas-Kanade optical flow params
        if HAS_CV2:
            self._lk_params = dict(winSize=(15, 15), maxLevel=2,
                                    criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 10, 0.03))
        else:
            self._lk_params = dict(winSize=(15, 15), maxLevel=2)

    def start(self) -> None:
        self._ready = True
        logger.info("Motion feature extractor initialized (fps=%d, idle_threshold=%.3f)", self._fps, self._idle_threshold)

    def stop(self) -> None:
        self._prev_gray = None
        self._prev_pts = None
        self._ready = False

    @property
    def ready(self) -> bool:
        return self._ready

    def extract(self, bgr_frame: np.ndarray, timestamp: float) -> Dict[str, Any]:
        base = {
            "motion_magnitude": 0.0,
            "motion_direction_deg": 0.0,
            "movement_speed_px_per_sec": 0.0,
            "is_idle": self._is_idle,
            "idle_duration_sec": 0.0,
            "optical_flow_mean": 0.0,
            "frame_diff_mean": 0.0,
        }

        if not self._ready or bgr_frame is None:
            return base

        h, w = bgr_frame.shape[:2]
        gray = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2GRAY)

        # ── Frame Differencing ────────────────────────────────────
        if self._prev_gray is not None and self._prev_gray.shape == gray.shape:
            frame_diff = cv2.absdiff(gray, self._prev_gray)
            diff_mean = float(np.mean(frame_diff)) / 255.0     # normalized 0–1
        else:
            diff_mean = 0.0

        # ── Sparse Optical Flow ───────────────────────────────────
        flow_mean = 0.0
        motion_direction = 0.0
        speed = 0.0

        if self._prev_gray is not None and self._prev_pts is not None and len(self._prev_pts) > 0:
            try:
                new_pts, status, _ = cv2.calcOpticalFlowPyrLK(
                    self._prev_gray, gray, self._prev_pts, None, **self._lk_params
                )
                if new_pts is not None and status is not None:
                    good_new = new_pts[status.flatten() == 1]
                    good_old = self._prev_pts[status.flatten() == 1]

                    if len(good_new) > 0:
                        flows = good_new - good_old
                        flow_mean = float(np.mean(np.linalg.norm(flows, axis=1)))
                        # Average direction
                        avg_flow = np.mean(flows, axis=0)
                        motion_direction = float(np.degrees(np.arctan2(avg_flow[1], avg_flow[0])))
                        speed = flow_mean * self._fps   # px/sec
            except cv2.error as e:
                logger.debug("Optical flow error: %s", e)

        # Detect new feature points for next frame
        try:
            self._prev_pts = cv2.goodFeaturesToTrack(gray, mask=None, **self._feature_params)
        except cv2.error:
            self._prev_pts = None

        self._prev_gray = gray

        # ── Idle Detection ────────────────────────────────────────
        motion_mag = max(diff_mean, flow_mean / max(w, 1))
        self._last_motion_mag = motion_mag
        self._last_motion_dir = motion_direction

        if motion_mag < self._idle_threshold:
            if self._is_idle:
                # Still idle
                pass
            else:
                # Transitioning to idle — start timer
                idle_elapsed = timestamp - self._idle_start
                if idle_elapsed >= self._idle_confirmation:
                    self._is_idle = True
        else:
            self._is_idle = False
            self._idle_start = timestamp

        idle_dur = timestamp - self._idle_start if self._is_idle else 0.0

        return {
            "motion_magnitude": round(motion_mag, 4),
            "motion_direction_deg": round(motion_direction, 2),
            "movement_speed_px_per_sec": round(speed, 2),
            "is_idle": self._is_idle,
            "idle_duration_sec": round(idle_dur, 2),
            "optical_flow_mean": round(flow_mean, 3),
            "frame_diff_mean": round(diff_mean, 4),
        }
