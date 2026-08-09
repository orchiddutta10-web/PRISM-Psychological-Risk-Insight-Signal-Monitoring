import json
import pytest
from prism_edge.bridge.esp32_bridge import _create_app
import tempfile
from pathlib import Path
from prism_edge import config
from prism_edge import db

@pytest.fixture
def client():
    # Use a temporary directory for the DB during tests
    with tempfile.TemporaryDirectory() as tmpdir:
        db.DB_PATH = Path(tmpdir) / "test_edge.db"
        if hasattr(db._local_local, "conn"):
            del db._local_local.conn
            
        app = _create_app()
        app.config["TESTING"] = True
        with app.test_client() as client:
            yield client

def test_health_endpoint(client):
    rv = client.get("/health")
    assert rv.status_code == 200
    assert json.loads(rv.data)["status"] == "ok"

def test_device_pairing(client):
    payload = {
        "device_id": "test_mobile_001",
        "device_type": "mobile",
        "guardian_id": "guard_xyz"
    }
    rv = client.post("/api/v1/pair", json=payload)
    assert rv.status_code == 200
    resp = json.loads(rv.data)
    assert resp["status"] == "success"
    
    # Verify device was registered via GET /api/v1/devices
    rv_dev = client.get("/api/v1/devices")
    devices = json.loads(rv_dev.data)["devices"]
    assert any(d["device_id"] == "test_mobile_001" for d in devices)

def test_mobile_telemetry(client):
    # First pair
    client.post("/api/v1/pair", json={
        "device_id": "test_mobile_002",
        "device_type": "mobile",
        "guardian_id": "guard_xyz"
    })
    
    # Then send telemetry
    payload = {
        "device_id": "test_mobile_002",
        "battery_level": 88,
        "screen_time_minutes": 120,
        "risk_events": []
    }
    rv = client.post("/api/v1/mobile/telemetry", json=payload)
    assert rv.status_code == 200
    resp = json.loads(rv.data)
    assert resp["status"] == "accepted"
    
    # Verify battery level updated in devices
    rv_dev = client.get("/api/v1/devices")
    devices = json.loads(rv_dev.data)["devices"]
    device = next(d for d in devices if d["device_id"] == "test_mobile_002")
    assert device["battery_level"] == 88

def test_esp32_pulse_ingest(client):
    payload = {
        "ts_ms": 1700000000000,
        "pulse_raw": 512,
        "bpm": 85.5,
        "g_force": 1.1,
        "alert_status": "OK"
    }
    rv = client.post("/api/v1/physio/pulse/ingest", json=payload)
    assert rv.status_code == 200
    resp = json.loads(rv.data)
    assert resp["status"] == "accepted"
