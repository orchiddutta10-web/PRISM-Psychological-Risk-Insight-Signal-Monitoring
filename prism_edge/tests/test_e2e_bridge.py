"""
End-to-end smoke test for the ESP32 bridge pipeline.
Starts the Flask bridge, posts a pulse reading, and verifies
the /latest endpoint returns it.
"""

import json
import sys
import threading
import time
from pathlib import Path

import requests

# Ensure prism_edge is on the path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT.parent))

from prism_edge.bridge.esp32_bridge import start_bridge, shared_state, state_lock  # noqa


from prism_edge import config

def get_bridge_url():
    return f"http://127.0.0.1:{config.ESP32_BRIDGE_PORT}"
TEST_PAYLOAD = {
    "ts_ms": 12345,
    "pulse_raw": 2048,
    "bpm": 72,
    "g_force": 1.05,
    "alert_status": "OK",
}


def test_bridge_e2e():
    """Run a full end-to-end pulse reading through the bridge."""
    # Start bridge with a fresh shared state
    start_bridge(shared_state, state_lock)
    time.sleep(0.5)  # Allow server to start

    # Verify health endpoint
    health = requests.get(f"{get_bridge_url()}/health", timeout=2)
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    # Simulate ESP32 sending a pulse reading
    resp = requests.post(
        f"{get_bridge_url()}/api/v1/physio/pulse/ingest",
        json=TEST_PAYLOAD,
        timeout=2,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "accepted"

    # Verify latest endpoint reflects the stored reading
    latest = requests.get(f"{get_bridge_url()}/latest", timeout=2)
    assert latest.status_code == 200, latest.text
    data = latest.json()
    assert data["status"] == "ok"
    assert data["data"]["bpm"] == TEST_PAYLOAD["bpm"]
    assert data["data"]["g_force"] == TEST_PAYLOAD["g_force"]
    assert data["data"]["alert_status"] == TEST_PAYLOAD["alert_status"]

    print("✅ E2E bridge test passed")


if __name__ == "__main__":
    test_bridge_e2e()
