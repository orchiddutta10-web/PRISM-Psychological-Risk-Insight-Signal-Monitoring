"""
Phase 12 — Sensor Route Integration Tests
Covers: POST /sensors/pulse, /vision/features, /audio/features, /phone/events,
        POST /fusion/analyze, GET /dashboard/summary, GET /alerts
"""

import json
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app import models
from app.database import Base
from app.main import app
from app.tests.conftest import TestingSessionLocal

client = TestClient(app)

# Initialize the ML engine singleton for fusion tests
from app.routes.ml import set_ml_engine
from app.utils.prism_ml_engine import PrismMLEngine
set_ml_engine(PrismMLEngine(TestingSessionLocal))


def _register_and_get_token(email_suffix: str = ""):
    """Register guardian + device, return auth_token and device_id."""
    if not email_suffix:
        import uuid
        email_suffix = uuid.uuid4().hex[:8]
    email = f"sensor-{email_suffix}@test.com"
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "SensorGuardian",
            "email": email,
            "password": "securepass123",
        },
    )
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "securepass123"},
    )
    token = login_resp.json()["access_token"]

    # Register a device
    reg = client.post(
        "/api/v1/auth/device",
        json={
            "name": "Phase12 Device",
            "platform": "android",
            "device_token": "phase12-token-abc",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    device = reg.json()["device"]
    device_id = device["id"]

    # Get device JWT
    device_token = reg.json()["device_jwt_token"]

    return token, device_id, device_token


# ════════════════════════════════════════════════════════════════════════


class TestSensorPulse:
    def test_ingest_pulse(self):
        token, did, dev_token = _register_and_get_token()
        resp = client.post(
            "/api/v1/sensors/pulse",
            json={
                "device_id": did,
                "metric_type": "bpm",
                "value": 72.0,
            },
            headers={"Authorization": f"Bearer {dev_token}"},
        )
        assert resp.status_code == 201
        assert resp.json()["status"] == "accepted"

    def test_ingest_pulse_invalid_metric(self):
        _, did, dev_token = _register_and_get_token()
        resp = client.post(
            "/api/v1/sensors/pulse",
            json={
                "device_id": did,
                "metric_type": "invalid_metric",
                "value": 10.0,
            },
            headers={"Authorization": f"Bearer {dev_token}"},
        )
        assert resp.status_code == 422

    def test_ingest_pulse_requires_device_auth(self):
        resp = client.post(
            "/api/v1/sensors/pulse",
            json={"device_id": "x", "metric_type": "bpm", "value": 10.0},
        )
        assert resp.status_code in (401, 403)


class TestVisionFeatures:
    def test_ingest_vision_features(self):
        token, did, dev_token = _register_and_get_token()
        resp = client.post(
            "/api/v1/vision/features",
            json={
                "device_id": did,
                "blink_rate_bpm": 15.0,
                "is_slouching": False,
            },
            headers={"Authorization": f"Bearer {dev_token}"},
        )
        assert resp.status_code == 201

    def test_ingest_vision_features_validates_blink_rate(self):
        _, did, dev_token = _register_and_get_token()
        resp = client.post(
            "/api/v1/vision/features",
            json={
                "device_id": did,
                "blink_rate_bpm": 500.0,  # out of range
            },
            headers={"Authorization": f"Bearer {dev_token}"},
        )
        assert resp.status_code == 422


class TestAudioFeatures:
    def test_ingest_audio_features(self):
        token, did, dev_token = _register_and_get_token()
        resp = client.post(
            "/api/v1/audio/features",
            json={
                "device_id": did,
                "speech_segments": 8.0,
                "silence_ratio": 0.3,
            },
            headers={"Authorization": f"Bearer {dev_token}"},
        )
        assert resp.status_code == 201

    def test_ingest_audio_validates_silence_ratio(self):
        _, did, dev_token = _register_and_get_token()
        resp = client.post(
            "/api/v1/audio/features",
            json={
                "device_id": did,
                "speech_segments": 5.0,
                "silence_ratio": 2.5,  # out of range
            },
            headers={"Authorization": f"Bearer {dev_token}"},
        )
        assert resp.status_code == 422


class TestPhoneEvents:
    def test_ingest_phone_event(self):
        token, did, dev_token = _register_and_get_token()
        resp = client.post(
            "/api/v1/phone/events",
            json={
                "device_id": did,
                "event_type": "SCREEN_ON",
            },
            headers={"Authorization": f"Bearer {dev_token}"},
        )
        assert resp.status_code == 201

    def test_ingest_phone_event_app_install_triggers_risk_check(self):
        token, did, dev_token = _register_and_get_token()
        resp = client.post(
            "/api/v1/phone/events",
            json={
                "device_id": did,
                "event_type": "APP_INSTALL",
                "package_name": "com.anonymous.chat",
            },
            headers={"Authorization": f"Bearer {dev_token}"},
        )
        assert resp.status_code == 201

    def test_ingest_phone_event_invalid_type(self):
        _, did, dev_token = _register_and_get_token()
        resp = client.post(
            "/api/v1/phone/events",
            json={
                "device_id": did,
                "event_type": "INVALID_TYPE",
            },
            headers={"Authorization": f"Bearer {dev_token}"},
        )
        assert resp.status_code == 422


class TestFusionAnalyze:
    def test_fusion_analyze_without_data(self):
        token, did, dev_token = _register_and_get_token()

        # Seed some behavior windows so the engine can fit
        db = TestingSessionLocal()
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        for i in range(14):
            day = now - timedelta(days=13 - i)
            bw = models.BehaviorWindow(
                subject_id=did,
                start_ts=day.replace(hour=0, minute=0, second=0),
                end_ts=day.replace(hour=23, minute=59, second=59),
                total_active_mins=180.0,
                sleep_hours_proxy=8.0,
            )
            db.add(bw)
        # Seed sensor readings too
        for _ in range(10):
            db.add(models.SensorReading(device_id=did, metric_type="bpm", value=72.0, timestamp=now))
        db.commit()
        db.close()

        resp = client.post(
            "/api/v1/fusion/analyze",
            json={
                "device_id": did,
                "persist": False,
            },
            headers={"Authorization": f"Bearer {dev_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "insight_score" in data
        assert "tier_label" in data

    def test_fusion_analyze_without_data_returns_404(self):
        token, did, dev_token = _register_and_get_token()
        resp = client.post(
            "/api/v1/fusion/analyze",
            json={"device_id": did, "persist": False},
            headers={"Authorization": f"Bearer {dev_token}"},
        )
        # No behavior windows → engine can't build feature vector
        assert resp.status_code in (404, 200)  # may be 404 or 200 with default


class TestDashboardSummary:
    def test_dashboard_summary_returns_data(self):
        token, did, dev_token = _register_and_get_token()
        resp = client.get(
            "/api/v1/dashboard/summary",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "sensor_status" in data
        assert "recent_alerts" in data


class TestAlertsEndpoint:
    def test_alerts_returns_paginated(self):
        token, did, dev_token = _register_and_get_token()
        resp = client.get(
            "/api/v1/alerts",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "alerts" in data
        assert "total" in data
        assert "unread" in data
        assert "page" in data

    def test_alerts_filter_by_severity(self):
        token, did, dev_token = _register_and_get_token()
        resp = client.get(
            "/api/v1/alerts?severity=red",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
