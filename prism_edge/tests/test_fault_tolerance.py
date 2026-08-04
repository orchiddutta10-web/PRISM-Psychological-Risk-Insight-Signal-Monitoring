"""
Fault-tolerance tests for the ESP32 bridge.
Verifies that malformed JSON, missing fields, and extra fields
are handled without crashing the server.
"""

import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT.parent))

from prism_edge.bridge.esp32_bridge import start_bridge, shared_state, state_lock  # noqa


BRIDGE_URL = "http://127.0.0.1:8081"


def _post(payload, json_header=True):
    headers = {"Content-Type": "application/json"} if json_header else {}
    return requests.post(
        f"{BRIDGE_URL}/api/v1/physio/pulse/ingest",
        data=payload if not json_header else None,
        json=payload if json_header else None,
        headers=headers,
        timeout=2,
    )


def test_malformed_json():
    resp = _post("not-json")
    assert resp.status_code == 400
    assert resp.json()["status"] == "error"


def test_missing_required_field():
    resp = _post({"ts_ms": 12345, "pulse_raw": 1000})
    assert resp.status_code == 400
    assert "Missing field" in resp.json()["message"]


def test_extra_fields_ignored():
    resp = _post(
        {
            "ts_ms": 12345,
            "pulse_raw": 2048,
            "bpm": 72,
            "g_force": 1.05,
            "alert_status": "OK",
            "extra": "ignored",
        }
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "accepted"


def test_health_persists():
    resp = requests.get(f"{BRIDGE_URL}/health", timeout=2)
    assert resp.status_code == 200


def main():
    start_bridge(shared_state, state_lock)
    time.sleep(0.5)

    test_malformed_json()
    print("✅ Malformed JSON handled")

    test_missing_required_field()
    print("✅ Missing required field handled")

    test_extra_fields_ignored()
    print("✅ Extra fields ignored")

    test_health_persists()
    print("✅ Health endpoint still alive")

    print("✅ Fault tolerance tests passed")


if __name__ == "__main__":
    main()
