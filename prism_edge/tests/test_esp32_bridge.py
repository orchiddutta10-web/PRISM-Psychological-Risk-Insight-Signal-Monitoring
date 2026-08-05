"""
Tests for the ESP32 bridge HTTP server (esp32_bridge.py).

Verifies:
  - pulse ingestion stores telemetry in shared state
  - auth is disabled when ESP32_BRIDGE_TOKEN is empty (backward compatible)
  - auth is enforced (401) when ESP32_BRIDGE_TOKEN is set and a wrong/missing
    bearer token is presented
  - the correct token is accepted when auth is enabled
"""
import sys
import threading
from pathlib import Path

import pytest

# Add prism_edge to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from prism_edge import config
from prism_edge.bridge.esp32_bridge import start_bridge

PULSE_URL = "/api/v1/physio/pulse/ingest"


@pytest.fixture
def bridge_app():
    """Start the bridge app with a fresh module-global shared state."""
    import prism_edge.bridge.esp32_bridge as bridge_mod
    from prism_edge.bridge.esp32_bridge import _create_app

    # The route handlers read the module-global shared_state/state_lock.
    fresh_state = {}
    fresh_lock = threading.Lock()
    bridge_mod.shared_state = fresh_state
    bridge_mod.state_lock = fresh_lock

    app = _create_app()
    app.config["TESTING"] = True
    yield app, fresh_state


def test_pulse_ingest_no_auth_configured(bridge_app):
    """When no token is configured, ingestion succeeds (backward compatible)."""
    config.ESP32_BRIDGE_TOKEN = ""
    app, shared_state = bridge_app
    client = app.test_client()

    resp = client.post(
        PULSE_URL,
        json={"ts_ms": 45000, "pulse_raw": 1950, "bpm": 72, "g_force": 1.02, "alert_status": "OK"},
    )
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "accepted"
    assert shared_state["esp32_pulse"]["bpm"] == 72


def test_pulse_ingest_rejects_missing_token(bridge_app):
    """When a token is configured, a request without it is rejected with 401."""
    config.ESP32_BRIDGE_TOKEN = "super-secret-token"
    app, _ = bridge_app
    client = app.test_client()

    resp = client.post(
        PULSE_URL,
        json={"ts_ms": 1, "pulse_raw": 1900, "bpm": 70, "g_force": 1.0, "alert_status": "OK"},
    )
    assert resp.status_code == 401
    assert resp.get_json()["status"] == "error"


def test_pulse_ingest_accepts_valid_token(bridge_app):
    """When a token is configured, the correct bearer token is accepted."""
    config.ESP32_BRIDGE_TOKEN = "super-secret-token"
    app, shared_state = bridge_app
    client = app.test_client()

    resp = client.post(
        PULSE_URL,
        headers={"Authorization": "Bearer super-secret-token"},
        json={"ts_ms": 2, "pulse_raw": 1910, "bpm": 71, "g_force": 1.01, "alert_status": "OK"},
    )
    assert resp.status_code == 200
    assert shared_state["esp32_pulse"]["bpm"] == 71


def test_pulse_ingest_rejects_wrong_token(bridge_app):
    """A wrong bearer token is rejected with 401."""
    config.ESP32_BRIDGE_TOKEN = "super-secret-token"
    app, shared_state = bridge_app
    client = app.test_client()

    resp = client.post(
        PULSE_URL,
        headers={"Authorization": "Bearer wrong-token"},
        json={"ts_ms": 3, "pulse_raw": 1920, "bpm": 73, "g_force": 1.0, "alert_status": "OK"},
    )
    assert resp.status_code == 401
    assert "esp32_pulse" not in shared_state


def test_pulse_ingest_missing_fields(bridge_app):
    """Malformed payloads return 400 regardless of auth state."""
    config.ESP32_BRIDGE_TOKEN = ""
    app, _ = bridge_app
    client = app.test_client()

    resp = client.post(PULSE_URL, json={"ts_ms": 4})  # missing fields
    assert resp.status_code == 400


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
