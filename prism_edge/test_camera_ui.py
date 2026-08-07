try:
    import cv2
except ImportError:
    cv2 = None

import pytest

# Skip all tests in this file if OpenCV is not available
pytestmark = pytest.mark.skipif(cv2 is None, reason="OpenCV not installed")
import time
import numpy as np
import threading
from prism_edge.camera.camera_capture import CameraCapture
from prism_edge.vision.motion_features import MotionFeatureExtractor
from prism_edge.audio.voice_features import VoiceFeatureExtractor


def main():
    print("Starting PRISM Edge Visualizer...")

    # 1. Start Camera
    cam = CameraCapture()
    if not cam.start():
        print("Error: Could not start camera.")
        return

    # 2. Start Motion Tracker (as an example of CV)
    motion = MotionFeatureExtractor()
    motion.start()

    # 3. Start Voice Tracker
    voice = VoiceFeatureExtractor()
    voice.start()

    print("Pipelines started. Opening visualizer window (Press 'q' to quit)...")

    try:
        while True:
            frame, timestamp = cam.read()
            if frame is None:
                time.sleep(0.01)
                continue

            # Process CV
            motion_data = motion.extract(frame, timestamp) if motion.ready else {}

            # Process Audio
            voice_data = voice._empty_features()
            if hasattr(voice, "_empty_features"):
                # We can't directly call extract() on voice as it runs in its own thread,
                # but we can simulate the visual overlay of its status.
                pass

            # Draw overlays
            display_frame = frame.copy()

            # Text config
            font = cv2.FONT_HERSHEY_SIMPLEX
            color = (0, 255, 0)

            cv2.putText(
                display_frame,
                "PRISM Edge Phase 5/6 Test",
                (10, 30),
                font,
                0.7,
                (255, 255, 255),
                2,
            )

            # Motion Overlay
            motion_mag = motion_data.get("motion_magnitude", 0)
            is_idle = motion_data.get("is_idle", True)
            status_text = "IDLE" if is_idle else "ACTIVE"
            cv2.putText(
                display_frame,
                f"Motion Mag: {motion_mag:.3f}",
                (10, 70),
                font,
                0.6,
                color,
                2,
            )
            cv2.putText(
                display_frame,
                f"Status: {status_text}",
                (10, 100),
                font,
                0.6,
                (0, 0, 255) if is_idle else color,
                2,
            )

            cv2.imshow("PRISM Edge Live Feed", display_frame)

            # Quit on 'q'
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    except KeyboardInterrupt:
        pass
    finally:
        print("Shutting down...")
        cam.stop()
        motion.stop()
        voice.stop()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
