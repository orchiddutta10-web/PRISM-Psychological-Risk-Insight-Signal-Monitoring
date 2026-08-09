"""
Pose feature extraction using MediaPipe Pose (33 landmarks).

Extracts body joint angles, posture classification, and body center.
NO activity recognition, NO emotion inference — numerical features only.
"""

import logging
from typing import Dict, Any

import numpy as np

try:
    import cv2
except ImportError:
    cv2 = None

from prism_edge import config

logger = logging.getLogger(__name__)

# MediaPipe Pose landmark indices
NOSE = 0
LEFT_SHOULDER = 11
RIGHT_SHOULDER = 12
LEFT_ELBOW = 13
RIGHT_ELBOW = 14
LEFT_WRIST = 15
RIGHT_WRIST = 16
LEFT_HIP = 23
RIGHT_HIP = 24
LEFT_KNEE = 25
RIGHT_KNEE = 26
LEFT_ANKLE = 27
RIGHT_ANKLE = 28


class PoseFeatureExtractor:
    """
    MediaPipe Pose wrapper. Extracts: posture, joint angles, body center.

    Usage:
        extractor = PoseFeatureExtractor()
        extractor.start()
        features = extractor.extract(bgr_frame, timestamp)
        extractor.stop()
    """

    def __init__(self):
        self._confidence: float = config.MEDIAPIPE_POSE_CONFIDENCE
        self._pose = None
        self._ready: bool = False

    def start(self) -> None:
        try:
            import mediapipe as mp
            if hasattr(mp, 'solutions'):
                self._pose = mp.solutions.pose.Pose(
                    static_image_mode=False,
                    model_complexity=1,
                    smooth_landmarks=True,
                    enable_segmentation=False,
                    min_detection_confidence=self._confidence,
                    min_tracking_confidence=self._confidence,
                )
                self._ready = True
                logger.info("MediaPipe Pose initialized (complexity=1, confidence=%.2f)", self._confidence)
            else:
                logger.warning("MediaPipe %s lacks solutions module — pose features disabled", mp.__version__)
                self._ready = False
        except Exception as e:
            logger.warning("Pose init not available: %s", e)
            self._ready = False

    def stop(self) -> None:
        if self._pose:
            self._pose.close()
            self._pose = None
        self._ready = False

    @property
    def ready(self) -> bool:
        return self._ready

    def extract(self, bgr_frame: np.ndarray, timestamp: float) -> Dict[str, Any]:
        base = {
            "present": False,
            "confidence": 0.0,
            "torso_angle_deg": 0.0,
            "spine_angle_deg": 0.0,
            "shoulder_angle_deg": 0.0,
            "left_elbow_angle_deg": 0.0,
            "right_elbow_angle_deg": 0.0,
            "left_knee_angle_deg": 0.0,
            "right_knee_angle_deg": 0.0,
            "left_hip_angle_deg": 0.0,
            "right_hip_angle_deg": 0.0,
            "posture": "unknown",
            "body_center_x": -1.0,
            "body_center_y": -1.0,
        }

        if not self._ready or self._pose is None or bgr_frame is None:
            return base

        h, w = bgr_frame.shape[:2]
        rgb = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        results = self._pose.process(rgb)
        rgb.flags.writeable = True

        if not results.pose_landmarks:
            return base

        lm = results.pose_landmarks.landmark
        pts = np.array([[p.x * w, p.y * h, p.z * w] for p in lm])

        # ── Helper: angle between three points (degrees) ──────────
        def angle(a, b, c):
            ba = a[:2] - b[:2]
            bc = c[:2] - b[:2]
            cos_ang = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
            return float(np.degrees(np.arccos(np.clip(cos_ang, -1.0, 1.0))))

        # ── Joint Angles ──────────────────────────────────────────
        left_elbow_ang = angle(pts[LEFT_SHOULDER], pts[LEFT_ELBOW], pts[LEFT_WRIST])
        right_elbow_ang = angle(pts[RIGHT_SHOULDER], pts[RIGHT_ELBOW], pts[RIGHT_WRIST])
        left_knee_ang = angle(pts[LEFT_HIP], pts[LEFT_KNEE], pts[LEFT_ANKLE])
        right_knee_ang = angle(pts[RIGHT_HIP], pts[RIGHT_KNEE], pts[RIGHT_ANKLE])
        left_hip_ang = angle(pts[LEFT_SHOULDER], pts[LEFT_HIP], pts[LEFT_KNEE])
        right_hip_ang = angle(pts[RIGHT_SHOULDER], pts[RIGHT_HIP], pts[RIGHT_KNEE])

        # ── Torso / Spine / Shoulder ──────────────────────────────
        shoulder_mid = (pts[LEFT_SHOULDER] + pts[RIGHT_SHOULDER]) / 2.0
        hip_mid = (pts[LEFT_HIP] + pts[RIGHT_HIP]) / 2.0

        # Torso angle: deviation from vertical (measured from hip to shoulder midpoint)
        torso_vec = shoulder_mid[:2] - hip_mid[:2]
        torso_angle = float(np.degrees(np.arctan2(abs(torso_vec[0]), abs(torso_vec[1]) + 1e-8)))

        # Spine angle: upper (shoulder midpoint to nose) vs lower (shoulder mid to hip mid)
        upper_spine = pts[NOSE][:2] - shoulder_mid[:2]
        lower_spine = shoulder_mid[:2] - hip_mid[:2]
        spine_angle = float(abs(np.degrees(np.arctan2(upper_spine[0], abs(upper_spine[1]) + 1e-8) -
                                     np.arctan2(lower_spine[0], abs(lower_spine[1]) + 1e-8))))

        # Shoulder tilt
        shoulder_vec = pts[RIGHT_SHOULDER][:2] - pts[LEFT_SHOULDER][:2]
        shoulder_angle = float(np.degrees(np.arctan2(abs(shoulder_vec[1]), abs(shoulder_vec[0]) + 1e-8)))

        # ── Posture Classification ────────────────────────────────
        # Heuristics based on hip-knee-ankle angle and vertical alignment
        posture = "unknown"
        avg_knee_angle = (left_knee_ang + right_knee_ang) / 2.0

        if avg_knee_angle < 90 and abs(pts[LEFT_HIP][1] - pts[LEFT_KNEE][1]) < 0.15 * h:
            posture = "seated"
        elif avg_knee_angle > 150 and torso_angle < 15:
            posture = "standing"
        elif abs(pts[LEFT_KNEE][1] - pts[RIGHT_KNEE][1]) < 0.05 * h and avg_knee_angle < 60:
            posture = "seated"

        # ── Body Center (normalized 0–1) ──────────────────────────
        body_center = (shoulder_mid + hip_mid) / 2.0
        body_cx = body_center[0] / w
        body_cy = body_center[1] / h

        # ── Confidence ────────────────────────────────────────────
        # Estimate from MediaPipe visibility scores
        vis_scores = [lm[LEFT_SHOULDER].visibility, lm[RIGHT_SHOULDER].visibility,
                       lm[LEFT_HIP].visibility, lm[RIGHT_HIP].visibility,
                       lm[LEFT_KNEE].visibility, lm[RIGHT_KNEE].visibility]
        confidence = float(np.mean([v for v in vis_scores if v is not None and v > 0])) if any(v and v > 0 for v in vis_scores) else 0.0

        return {
            "present": True,
            "confidence": round(confidence, 3),
            "torso_angle_deg": round(torso_angle, 2),
            "spine_angle_deg": round(spine_angle, 2),
            "shoulder_angle_deg": round(shoulder_angle, 2),
            "left_elbow_angle_deg": round(left_elbow_ang, 2),
            "right_elbow_angle_deg": round(right_elbow_ang, 2),
            "left_knee_angle_deg": round(left_knee_ang, 2),
            "right_knee_angle_deg": round(right_knee_ang, 2),
            "left_hip_angle_deg": round(left_hip_ang, 2),
            "right_hip_angle_deg": round(right_hip_ang, 2),
            "posture": posture,
            "body_center_x": round(body_cx, 3),
            "body_center_y": round(body_cy, 3),
        }
