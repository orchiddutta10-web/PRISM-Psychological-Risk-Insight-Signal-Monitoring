"""
End-to-end integration test for PRISM Edge Node pipeline.
Runs: ESP32 bridge -> feature packer -> API client -> PRISM API ingestion.
"""

import json
import queue
import threading
import time
import sys
import os

sys.path.insert(
    0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)

from prism_edge import config
from prism_edge.utils.logging_setup import setup_logging

setup_logging()


def test_pipeline_integration():
    orig_host = config.ESP32_BRIDGE_HOST
    orig_port = config.ESP32_BRIDGE_PORT
    orig_interval = config.FEATURE_INTERVAL_SEC

    config.ESP32_BRIDGE_HOST = "127.0.0.1"
    config.ESP32_BRIDGE_PORT = 18081
    config.FEATURE_INTERVAL_SEC = 2.0
    config.LOG_LEVEL = "WARNING"

    passed = 0
    failed = 0

    def check(label, condition):
        nonlocal passed, failed
        if condition:
            print(f"  [PASS] {label}")
            passed += 1
        else:
            print(f"  [FAIL] {label}")
            failed += 1

    try:
        print("=" * 60)
        print("PRISM Edge Pipeline Integration Test")
        print("=" * 60)

        # ---- Stage 1: ESP32 Bridge ----
        print("\n[1] ESP32 Bridge")
        from prism_edge.bridge.esp32_bridge import start_bridge

        shared_state = {
            "face": {"present": False},
            "pose": {"present": False},
            "motion": {"motion_magnitude": 0.0},
            "voice": {"voice_active": False},
            "esp32_pulse": {},
        }
        state_lock = threading.Lock()
        bridge_thread = start_bridge(shared_state, state_lock)
        time.sleep(1)

        import requests

        pulse_data = {
            "ts_ms": 45000,
            "pulse_raw": 1950,
            "bpm": 72,
            "g_force": 1.02,
            "alert_status": "OK",
        }
        resp = requests.post(
            f"http://127.0.0.1:{config.ESP32_BRIDGE_PORT}/api/v1/physio/pulse/ingest",
            json=pulse_data,
            timeout=5,
        )
        check("Bridge returns 200", resp.status_code == 200)
        check("Bridge accepts payload", resp.json().get("status") == "accepted")
        with state_lock:
            check("Pulse stored in shared state", shared_state["esp32_pulse"]["bpm"] == 72)

        # ---- Stage 2: Feature Packer ----
        print("\n[2] Feature Packer")
        from prism_edge.packer.feature_packer import FeaturePacker

        tx_queue = queue.Queue(maxsize=5)
        packer = FeaturePacker(shared_state, state_lock, tx_queue)
        packer.start()
        time.sleep(2.5)

        try:
            payload = tx_queue.get(timeout=3)
            check("Payload has subject_id", "subject_id" in payload)
            check("Modality is edge_behaviour", payload["modality"] == "edge_behaviour")
            check("ESP32 pulse in payload", payload["value"]["esp32_pulse"]["bpm"] == 72)
            check("System health in payload", "system_health" in payload["value"])
            print(
                f"  Payload size: {len(json.dumps(payload))} bytes, seq={payload['sequence']}"
            )
        except queue.Empty:
            check("Payload produced by packer", False)
            payload = None

        packer.stop()

        # ---- Stage 3: API Client + PRISM API ----
        print("\n[3] PRISM API Ingestion")
        try:
            requests.get(f"{config.API_BASE_URL}/", timeout=3)
            api_online = True
        except Exception:
            api_online = False
            print("  (API offline - skipping Stage 3 live API checks)")

        if api_online and payload is not None:
            reg = requests.post(
                f"{config.API_BASE_URL}/api/v1/auth/register",
                json={
                    "full_name": "EdgeTest",
                    "email": "pipeline@example.com",
                    "password": "test12345678",
                },
                timeout=5,
            )

            login = requests.post(
                f"{config.API_BASE_URL}/api/v1/auth/login",
                json={"email": "pipeline@example.com", "password": "test12345678"},
                timeout=5,
            )
            guardian_jwt = login.json().get("access_token", "")

            dev = requests.post(
                f"{config.API_BASE_URL}/api/v1/auth/device",
                headers={"Authorization": f"Bearer {guardian_jwt}"},
                json={
                    "name": "Edge Pi",
                    "platform": "android",
                    "device_token": "edge-pipeline-01",
                },
                timeout=5,
            )
            device_jwt = dev.json()["device_jwt_token"]
            device_uuid = dev.json()["device"]["id"]

            # Update payload subject_id to match device UUID
            payload["subject_id"] = device_uuid

            check("Device registered and JWT obtained", bool(device_jwt) and bool(device_uuid))

            # Grant consent for the edge_behaviour modality so unified ingestion is authorized
            grant = requests.post(
                f"{config.API_BASE_URL}/api/v1/consent/grants/{device_uuid}",
                headers={"Authorization": f"Bearer {guardian_jwt}"},
                json={"modality": "edge_behaviour", "is_granted": True},
                timeout=5,
            )
            check(
                "Consent granted for edge_behaviour",
                grant.status_code == 200 or grant.status_code == 201,
            )

            # Send via ApiClient
            from prism_edge.api.client import ApiClient

            test_q = queue.Queue()
            test_q.put(payload)
            client = ApiClient(test_q)
            client._running = True
            client._jwt = device_jwt
            client._session = requests.Session()
            client._session.headers.update(
                {"Content-Type": "application/json", "Authorization": f"Bearer {device_jwt}"}
            )
            client._send(payload)
            check("API ingestion successful", client.consecutive_failures == 0)

            # Verify stored
            readings = requests.get(
                f"{config.API_BASE_URL}/api/v1/physio/pulse/readings/{device_uuid}?limit=1",
                headers={"Authorization": f"Bearer {guardian_jwt}"},
                timeout=5,
            )
            check(
                "Pulse readings retrievable",
                readings.status_code == 200 and len(readings.json()) > 0,
            )

            # Verify the ESP32 pulse relay landed in the pulse readings table
            pulse_relayed = any(
                r.get("bpm") == pulse_data["bpm"]
                and r.get("alert_status") == pulse_data["alert_status"]
                for r in readings.json()
            )
            check("ESP32 pulse relayed to PulseMultiFactorReading", pulse_relayed)

            client._session.close()

        # ---- Stage 4: Audio module loads ----
        print("\n[4] Audio Module")
        from prism_edge.audio.voice_features import VoiceFeatureExtractor

        v = VoiceFeatureExtractor()
        check("VoiceFeatureExtractor constructs", v is not None)
        check("Empty features structure", len(v._empty_features()) >= 12)

        # ---- Stage 5: Vision modules load (graceful when no OpenCV) ----
        print("\n[5] Vision Modules (graceful degradation)")
        from prism_edge.camera.camera_capture import CameraCapture
        from prism_edge.vision.face_features import FaceFeatureExtractor
        from prism_edge.vision.pose_features import PoseFeatureExtractor
        from prism_edge.vision.motion_features import MotionFeatureExtractor

        cam = CameraCapture()
        cam.start()
        check("CameraCapture loads (hardware may be absent)", cam is not None)

        f = FaceFeatureExtractor()
        f.start()
        check("FaceFeatureExtractor loads", f is not None)
        check("Face empty extract returns dict", len(f.extract(None, 0)) >= 12)

        p = PoseFeatureExtractor()
        p.start()
        check("PoseFeatureExtractor loads", p is not None)
        check("Pose empty extract returns dict", len(p.extract(None, 0)) >= 12)

        m = MotionFeatureExtractor()
        m.start()
        check("MotionFeatureExtractor loads", m is not None)
        check("Motion empty extract returns dict", len(m.extract(None, 0)) >= 7)

        cam.stop()

        # ---- Summary ----
        print("\n" + "=" * 60)
        total = passed + failed
        print(f"RESULTS: {passed}/{total} passed" + (f", {failed} failed" if failed else ""))
        print("=" * 60)
        assert failed == 0, f"{failed} integration checks failed"
    finally:
        config.ESP32_BRIDGE_HOST = orig_host
        config.ESP32_BRIDGE_PORT = orig_port
        config.FEATURE_INTERVAL_SEC = orig_interval


if __name__ == "__main__":
    test_pipeline_integration()
