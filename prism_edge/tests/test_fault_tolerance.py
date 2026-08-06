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


from prism_edge import config

def get_bridge_url():
    return f"http://127.0.0.1:{config.ESP32_BRIDGE_PORT}"

def _post(payload, json_header=True):
    headers = {"Content-Type": "application/json"} if json_header else {}
    return requests.post(
        f"{get_bridge_url()}/api/v1/physio/pulse/ingest",
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
    resp = requests.get(f"{get_bridge_url()}/health", timeout=2)
    assert resp.status_code == 200


def test_invalid_bpm_range():
    resp = _post({"ts_ms": 12345, "pulse_raw": 1000, "bpm": 400, "g_force": 1.0, "alert_status": "OK"})
    assert resp.status_code == 400


def test_invalid_g_force_range():
    resp = _post({"ts_ms": 12345, "pulse_raw": 1000, "bpm": 80, "g_force": -5, "alert_status": "OK"})
    assert resp.status_code == 400


def test_invalid_field_types():
    resp = _post({"ts_ms": 12345, "pulse_raw": 1000, "bpm": "high", "g_force": 1.0, "alert_status": "OK"})
    assert resp.status_code == 400


def test_auth_required():
    # Use a fresh bridge on a different port with a token set
    import threading
    from prism_edge import config as _config

    original_token = _config.ESP32_BRIDGE_TOKEN
    original_port = _config.ESP32_BRIDGE_PORT
    _config.ESP32_BRIDGE_TOKEN = "secret-token"
    _config.ESP32_BRIDGE_PORT = 18082
    try:
        from prism_edge.bridge import esp32_bridge as _bridge
        state = {}
        lock = threading.Lock()
        _bridge.start_bridge(state, lock)
        import time
        time.sleep(0.3)

        # Missing auth
        resp = requests.post(
            f"http://127.0.0.1:{_config.ESP32_BRIDGE_PORT}/api/v1/physio/pulse/ingest",
            json={"ts_ms": 1, "pulse_raw": 1, "bpm": 70, "g_force": 1.0, "alert_status": "OK"},
            timeout=2,
        )
        assert resp.status_code == 401

        # Wrong token
        resp = requests.post(
            f"http://127.0.0.1:{_config.ESP32_BRIDGE_PORT}/api/v1/physio/pulse/ingest",
            json={"ts_ms": 1, "pulse_raw": 1, "bpm": 70, "g_force": 1.0, "alert_status": "OK"},
            headers={"Authorization": "Bearer wrong"},
            timeout=2,
        )
        assert resp.status_code == 403

        # Correct token
        resp = requests.post(
            f"http://127.0.0.1:{_config.ESP32_BRIDGE_PORT}/api/v1/physio/pulse/ingest",
            json={"ts_ms": 1, "pulse_raw": 1, "bpm": 70, "g_force": 1.0, "alert_status": "OK"},
            headers={"Authorization": "Bearer secret-token"},
            timeout=2,
        )
        assert resp.status_code == 200
    finally:
        _config.ESP32_BRIDGE_TOKEN = original_token
        _config.ESP32_BRIDGE_PORT = original_port


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

    test_invalid_bpm_range()
    print("✅ Invalid BPM range rejected")

    test_invalid_g_force_range()
    print("✅ Invalid g_force range rejected")

    test_invalid_field_types()
    print("✅ Invalid field types rejected")

    test_auth_required()
    print("✅ Optional bridge auth works")

    print("✅ Fault tolerance tests passed")


if __name__ == "__main__":
    main()
