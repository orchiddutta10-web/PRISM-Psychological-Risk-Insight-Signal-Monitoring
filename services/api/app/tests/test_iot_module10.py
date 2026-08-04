"""
Tests for Module 10: Future IoT Integration.

Covers the unified vitals ingestion endpoint (consent gate, device-match,
persistence, MQTT graceful fallback) and the multimodal fusion contract.
Uses the shared in-memory SQLite engine from conftest.
"""
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.database import get_db
from app import models

from app.tests.conftest import TestingSessionLocal, override_get_db  # noqa: F401

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def _register(email: str):
    """Register guardian + device with gsr consent, returns (token, device_id, device_jwt)."""
    r = client.post(
        "/api/v1/auth/register",
        json={"full_name": "IoT Test Guardian", "email": email,
              "password": "password123", "role": "guardian"},
    )
    assert r.status_code == 201
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = r.json()["access_token"]
    r = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "ESP32 Node", "platform": "android", "device_token": f"tok-{email}"},
    )
    device_id = r.json()["device"]["id"]
    device_jwt = r.json()["device_jwt_token"]
    # Grant gsr consent (physio gate checks ConsentGrant modality 'gsr').
    r = client.post(
        "/api/v1/consent/grants/" + device_id,
        headers={"Authorization": f"Bearer {token}"},
        json={"modality": "gsr", "is_granted": True},
    )
    assert r.status_code in (200, 201)
    return token, device_id, device_jwt


# ─── Vitals ingestion ───────────────────────────────────────────────────────


def test_vitals_ingest_requires_device_auth():
    r = client.post("/api/v1/physio/vitals/ingest", json={"device_id": "x"})
    assert r.status_code == 401


def test_vitals_ingest_persists_scalars():
    """A vitals sample is stored with derived scalars (no raw waveforms)."""
    _, device_id, device_jwt = _register("iot1@example.com")
    r = client.post(
        "/api/v1/physio/vitals/ingest",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={
            "device_id": device_id,
            "heart_rate_bpm": 78,
            "spo2_percent": 97.5,
            "temperature_c": 36.7,
            "ecg_mv": 0.4,
            "gsr_microsiemens": 5.2,
            "source": "http",
            "device_meta": {"firmware": "esp32-v1", "sensors": ["max30102"]},
        },
    )
    assert r.status_code == 200
    assert r.json()["status"] == "accepted"

    db = TestingSessionLocal()
    reading = (
        db.query(models.VitalsReading)
        .filter(models.VitalsReading.subject_id == device_id)
        .first()
    )
    db.close()
    assert reading is not None
    assert reading.heart_rate_bpm == 78
    assert reading.spo2_percent == 97.5
    assert reading.temperature_c == 36.7
    assert reading.ecg_mv == 0.4
    assert reading.gsr_microsiemens == 5.2
    assert reading.source == "http"
    assert reading.device_meta.get("firmware") == "esp32-v1"


def test_vitals_ingest_mismatched_device_403():
    """Payload device_id must match the authenticated device."""
    _, device_id, device_jwt = _register("iot2@example.com")
    r = client.post(
        "/api/v1/physio/vitals/ingest",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={"device_id": "some-other-device", "heart_rate_bpm": 80},
    )
    assert r.status_code == 403


def test_vitals_ingest_requires_consent():
    """Without consent grant, vitals ingestion is rejected."""
    r = client.post(
        "/api/v1/auth/register",
        json={"full_name": "No Consent", "email": "iot3@example.com",
              "password": "password123"},
    )
    r = client.post("/api/v1/auth/login", json={"email": "iot3@example.com", "password": "password123"})
    token = r.json()["access_token"]
    r = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "No Consent Node", "platform": "android", "device_token": "tok-iot3"},
    )
    device_id = r.json()["device"]["id"]
    device_jwt = r.json()["device_jwt_token"]
    # No consent granted → reject.
    r = client.post(
        "/api/v1/physio/vitals/ingest",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={"device_id": device_id, "heart_rate_bpm": 80},
    )
    assert r.status_code == 403
    assert "consent" in r.json()["detail"].lower()


def test_vitals_mqtt_source_falls_back_gracefully():
    """MQTT-sourced vitals still persist even when no broker is available."""
    _, device_id, device_jwt = _register("iot4@example.com")
    with patch("app.utils.mqtt_bridge.publish_vitals_mqtt", return_value=False):
        r = client.post(
            "/api/v1/physio/vitals/ingest",
            headers={"Authorization": f"Bearer {device_jwt}"},
            json={"device_id": device_id, "source": "mqtt", "heart_rate_bpm": 82},
        )
    assert r.status_code == 200
    assert r.json()["status"] == "accepted"


def test_vitals_readings_guardian_authz():
    """Guardian can read own device vitals; cross-guardian 403."""
    token, device_id, _ = _register("iot5@example.com")
    r = client.get(
        f"/api/v1/physio/vitals/{device_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_vitals_readings_cross_guardian_403():
    _, dev_a, _ = _register("iot6a@example.com")
    token_b, _, _ = _register("iot6b@example.com")
    r = client.get(
        f"/api/v1/physio/vitals/{dev_a}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert r.status_code == 403


# ─── MQTT bridge adapter ────────────────────────────────────────────────────


def test_mqtt_available_false_without_client():
    """Without aiomqtt/paho installed, mqtt_available() is False (HTTP fallback)."""
    from app.utils import mqtt_bridge

    with patch("app.utils.mqtt_bridge._broker_available", None), \
         patch.dict("sys.modules", {"aiomqtt": None, "paho.mqtt.client": None}):
        # Force re-discovery by clearing the cached flag.
        mqtt_bridge._broker_available = None
        assert mqtt_bridge.mqtt_available() is False


# ─── Module 10 fusion contract ──────────────────────────────────────────────


def test_fusion_contract_exists():
    """The multimodal fusion ABC defines the future-AI contract."""
    from app.utils.future_stubs import MultimodalWellbeingFusion
    from abc import ABC

    assert issubclass(MultimodalWellbeingFusion, ABC)
    methods = [m for m in dir(MultimodalWellbeingFusion) if not m.startswith("_")]
    assert "fuse_signals" in methods
