"""
Regression tests for the PRISM Edge vision pipeline.

Guards against:
  - FaceFeatureExtractor referencing the undefined `_max_faces` attribute
    (would raise AttributeError inside start() when MediaPipe is installed,
    permanently disabling the face pipeline).
  - PoseFeatureExtractor using `cv2` without importing it
    (would raise NameError on every extract() call, killing pose features).
"""

import sys
from pathlib import Path

import pytest

# Add prism_edge to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from prism_edge.vision.face_features import FaceFeatureExtractor
from prism_edge.vision.motion_features import MotionFeatureExtractor


class TestFaceFeatureExtractor:
    def test_init_defines_max_faces(self):
        """Regression: start() must not reference an undefined attribute."""
        fx = FaceFeatureExtractor()
        assert hasattr(fx, "_max_faces"), (
            "FaceFeatureExtractor.start() uses self._max_faces but __init__ "
            "never defined it — AttributeError kills the face pipeline."
        )

    def test_start_graceful_without_mediapipe(self):
        """When MediaPipe is absent, start() must degrade to ready=False, not raise."""
        fx = FaceFeatureExtractor()
        try:
            fx.start()
        except AttributeError as e:
            pytest.fail(f"start() raised AttributeError: {e}")
        # ready may be True or False depending on env, but never raise
        assert isinstance(fx.ready, bool)

    def test_extract_returns_full_base_on_empty_input(self):
        fx = FaceFeatureExtractor()
        base = fx.extract(None, 0)
        assert base["present"] is False
        assert "confidence" in base
        assert "blink_ratio" in base


class TestPoseFeatureExtractor:
    def test_cv2_importable_in_module(self):
        """Regression: extract() calls cv2.cvtColor — cv2 must be importable."""
        try:
            import prism_edge.vision.pose_features as pose_mod
        except ImportError as e:
            # On a dev box without OpenCV the module import itself will fail;
            # that's expected (requirements.txt installs opencv on the Pi).
            if "cv2" in str(e):
                pytest.skip("OpenCV not installed — cannot import pose module")
            raise
        assert hasattr(pose_mod, "cv2"), (
            "pose_features.extract() calls cv2.cvtColor but the module never "
            "imported cv2 — NameError kills the pose pipeline."
        )

    def _load_pose(self):
        try:
            from prism_edge.vision.pose_features import PoseFeatureExtractor

            return PoseFeatureExtractor
        except ImportError as e:
            if "cv2" in str(e):
                pytest.skip("OpenCV not installed — cannot import pose module")
            raise

    def test_start_graceful_without_mediapipe(self):
        PoseFeatureExtractor = self._load_pose()
        px = PoseFeatureExtractor()
        try:
            px.start()
        except Exception as e:
            pytest.fail(f"start() raised unexpected exception: {e}")
        assert isinstance(px.ready, bool)

    def test_extract_returns_full_base_on_empty_input(self):
        PoseFeatureExtractor = self._load_pose()
        px = PoseFeatureExtractor()
        base = px.extract(None, 0)
        assert base["present"] is False
        assert "torso_angle_deg" in base
        assert "posture" in base


class TestMotionFeatureExtractor:
    def test_extract_returns_full_base_on_empty_input(self):
        mx = MotionFeatureExtractor()
        base = mx.extract(None, 0)
        assert base["motion_magnitude"] == 0.0
        assert "is_idle" in base
        assert "frame_diff_mean" in base


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
