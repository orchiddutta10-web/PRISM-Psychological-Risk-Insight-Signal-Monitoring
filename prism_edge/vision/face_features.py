"""
Face feature extraction using MediaPipe Face Mesh (468 landmarks).

Extracts numerical features only — NO identity recognition, NO emotion classification.
Output is a flat dict of biometric measurements: eye openness, head pose, mouth state.
"""

import logging
import time
from typing import Optional, Dict, Any

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

import numpy as np

from prism_edge import config

logger = logging.getLogger(__name__)

# MediaPipe indices for key landmarks (https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/face_mesh.md)
# Eye contours (left / right)
LEFT_EYE = [33, 133, 157, 158, 159, 160, 161, 173]       # upper + lower left eye
RIGHT_EYE = [362, 263, 387, 386, 385, 384, 398, 466]      # upper + lower right eye
LEFT_EYE_TOP = 159
LEFT_EYE_BOTTOM = 145
RIGHT_EYE_TOP = 386
RIGHT_EYE_BOTTOM = 374
# Mouth
MOUTH_TOP = 13
MOUTH_BOTTOM = 14
MOUTH_LEFT = 61
MOUTH_RIGHT = 291
# Face boundary for bbox
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]


class FaceFeatureExtractor:
    """
    MediaPipe Face Mesh wrapper that extracts only structured numerical features.

    Usage:
        extractor = FaceFeatureExtractor()
        extractor.start()
        features = extractor.extract(bgr_frame, timestamp)
        extractor.stop()
    """

    def __init__(self):
        self._confidence: float = config.MEDIAPIPE_FACE_CONFIDENCE
        self._model_selection: int = config.MEDIAPIPE_FACE_MODEL
        self._face_mesh = None
        self._scale: float = config.FACE_SCALE
        self._ready: bool = False
        self._tracking_id: int = 0
        self._last_present: bool = False

    def start(self) -> None:
        """Initialize MediaPipe Face Mesh."""
        try:
            import mediapipe.python.solutions.face_mesh as mp_face_mesh
            self._mp_face = mp_face_mesh
            self._face_mesh = self._mp_face.FaceMesh(
                static_image_mode=False,
                max_num_faces=self._max_faces,
                refine_landmarks=True,    # enables iris + lip detail landmarks
                min_detection_confidence=self._confidence,
                min_tracking_confidence=self._confidence,
                model_selection=self._model_selection,
            )
            self._ready = True
            logger.info("MediaPipe Face Mesh initialized (model=%d, confidence=%.2f)", self._model_selection, self._confidence)
        except Exception as e:
            logger.error("Failed to initialize MediaPipe Face Mesh: %s", e)
            self._ready = False

    def stop(self) -> None:
        if self._face_mesh:
            self._face_mesh.close()
            self._face_mesh = None
        self._ready = False

    @property
    def ready(self) -> bool:
        return self._ready

    def extract(self, bgr_frame: np.ndarray, timestamp: float) -> Dict[str, Any]:
        """
        Extract face features from a BGR frame.

        Returns a dict with keys:
            present, confidence, eye_openness_left, eye_openness_right,
            blink_ratio, head_yaw_deg, head_pitch_deg, head_roll_deg,
            mouth_openness, smile_coefficient, face_center_x, face_center_y,
            face_bbox, tracking_id
        """
        base = {
            "present": False,
            "confidence": 0.0,
            "eye_openness_left": 0.0,
            "eye_openness_right": 0.0,
            "blink_ratio": 0.0,
            "head_yaw_deg": 0.0,
            "head_pitch_deg": 0.0,
            "head_roll_deg": 0.0,
            "mouth_openness": 0.0,
            "smile_coefficient": 0.0,
            "face_center_x": -1.0,
            "face_center_y": -1.0,
            "face_bbox": None,
            "tracking_id": 0,
        }

        if not self._ready or self._face_mesh is None or bgr_frame is None:
            return base

        h, w = bgr_frame.shape[:2]

        # Optional downscale for performance
        if self._scale < 1.0:
            small = cv2.resize(bgr_frame, (int(w * self._scale), int(h * self._scale)))
        else:
            small = bgr_frame

        rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        results = self._face_mesh.process(rgb)
        rgb.flags.writeable = True

        if not results.multi_face_landmarks:
            if self._last_present:
                self._tracking_id += 1  # lost tracking
            self._last_present = False
            return base

        self._last_present = True
        landmarks = results.multi_face_landmarks[0]
        n_landmarks = len(landmarks.landmark)

        # Scale landmarks back to original resolution
        scale_x = 1.0 / self._scale
        scale_y = 1.0 / self._scale

        # Extract landmark coordinates as (N, 3) numpy array
        pts = np.array([[lm.x * w * scale_x, lm.y * h * scale_y, lm.z * w * scale_x] for lm in landmarks.landmark])

        # ── Eye Openness ──────────────────────────────────────────
        left_eye_height = self._distance(pts[LEFT_EYE_TOP], pts[LEFT_EYE_BOTTOM])
        left_eye_width = self._distance(pts[LEFT_EYE[0]], pts[LEFT_EYE[4]])
        right_eye_height = self._distance(pts[RIGHT_EYE_TOP], pts[RIGHT_EYE_BOTTOM])
        right_eye_width = self._distance(pts[RIGHT_EYE[0]], pts[RIGHT_EYE[4]])

        left_ear = left_eye_height / max(left_eye_width, 0.001)
        right_ear = right_eye_height / max(right_eye_width, 0.001)

        # Normalize to typical open-eye ratio (~0.35)
        eye_open_left = min(left_ear / 0.35, 1.0)
        eye_open_right = min(right_ear / 0.35, 1.0)
        blink_ratio_left = 1.0 - eye_open_left
        blink_ratio_right = 1.0 - eye_open_right
        blink_ratio = max(blink_ratio_left, blink_ratio_right)

        # ── Head Pose (approximate from landmark geometry) ────────
        # Using nose tip (1), forehead (10), chin (152), and face sides
        nose_tip = pts[1]
        forehead = pts[10]
        chin = pts[152]
        left_face = pts[234]
        right_face = pts[454]

        # Vertical face center line midpoint
        face_mid = (left_face + right_face) / 2.0

        # Heuristic head angles using landmark ratios
        face_height = self._distance(forehead, chin)
        face_width = self._distance(left_face, right_face)

        head_yaw = np.degrees(np.arctan2(nose_tip[0] - face_mid[0], nose_tip[2] - face_mid[2]))
        head_pitch = np.degrees(np.arctan2(nose_tip[1] - face_mid[1], face_height))
        head_roll = np.degrees(np.arctan2(right_face[1] - left_face[1], right_face[0] - left_face[0]))

        # ── Mouth Openness ────────────────────────────────────────
        mouth_height = self._distance(pts[MOUTH_TOP], pts[MOUTH_BOTTOM])
        mouth_width = self._distance(pts[MOUTH_LEFT], pts[MOUTH_RIGHT])
        mouth_openness = mouth_height / max(mouth_width, 0.001)

        # ── Smile Coefficient ─────────────────────────────────────
        # smile = ratio of mouth width to resting width; wider = more smile-like
        # Also check lip corner pull-up (landmarks 61, 291 vs face baseline)
        lip_corner_left_y = pts[61][1]
        lip_corner_right_y = pts[291][1]
        lip_center_y = pts[13][1]
        lip_pull = (lip_center_y - (lip_corner_left_y + lip_corner_right_y) / 2.0) / max(face_height, 1.0)
        smile_coefficient = max(0.0, min(lip_pull * 5.0, 1.0))

        # ── Face Bounding Box ─────────────────────────────────────
        face_xs = [pts[i][0] for i in FACE_OVAL if i < n_landmarks]
        face_ys = [pts[i][1] for i in FACE_OVAL if i < n_landmarks]
        if face_xs and face_ys:
            x_min, x_max = int(min(face_xs)), int(max(face_xs))
            y_min, y_max = int(min(face_ys)), int(max(face_ys))
            # Enforce minimum bbox of 10px
            if x_max - x_min < 10:
                x_max = x_min + 10
            if y_max - y_min < 10:
                y_max = y_min + 10
            face_bbox = (x_min, y_min, x_max - x_min, y_max - y_min)
        else:
            face_bbox = None

        # ── Face Center (normalized 0-1) ──────────────────────────
        face_center_x = (pts[1][0] + face_mid[0]) / (2.0 * w)
        face_center_y = (pts[1][1] + face_mid[1]) / (2.0 * h)

        # ── Approximate Gaze Direction (using Iris Landmarks) ──────
        # Iris centers are 468 (left) and 473 (right) when refine_landmarks=True
        approx_gaze = "center"
        if n_landmarks > 473:
            left_iris_x = pts[468][0]
            left_eye_inner_x = pts[133][0]
            left_eye_outer_x = pts[33][0]
            # Ratio of iris position between corners (0 = left, 1 = right roughly)
            eye_width = abs(left_eye_inner_x - left_eye_outer_x) + 1e-6
            gaze_ratio = abs(left_iris_x - left_eye_outer_x) / eye_width
            
            if gaze_ratio < 0.35:
                approx_gaze = "left"
            elif gaze_ratio > 0.65:
                approx_gaze = "right"

        # ── Confidence & Face Count ───────────────────────────────
        confidence = 0.95 if n_landmarks >= 468 else 0.8
        face_count = 1 if self._last_present else 0

        return {
            "present": True,
            "face_count": face_count,
            "confidence": round(confidence, 3),
            "eye_openness_left": round(eye_open_left, 3),
            "eye_openness_right": round(eye_open_right, 3),
            "blink_ratio": round(blink_ratio, 3),
            "approximate_gaze": approx_gaze,
            "head_yaw_deg": round(head_yaw, 2),
            "head_pitch_deg": round(head_pitch, 2),
            "head_roll_deg": round(head_roll, 2),
            "mouth_openness": round(mouth_openness, 3),
            "smile_coefficient": round(smile_coefficient, 3),
            "face_center_x": round(face_center_x, 3),
            "face_center_y": round(face_center_y, 3),
            "face_bbox": face_bbox,
            "tracking_id": self._tracking_id,
        }

    @staticmethod
    def _distance(a: np.ndarray, b: np.ndarray) -> float:
        return float(np.linalg.norm(a[:2] - b[:2]))
