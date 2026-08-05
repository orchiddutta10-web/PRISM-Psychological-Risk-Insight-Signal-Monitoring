"""
Tests for the offline batch ingestion endpoint.
"""
import json
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import ChildDevice
from app.utils.auth import get_current_device


@pytest.fixture(autouse=True)
def mock_auth_device():
    """Override get_current_device to return a test device for all tests."""
    mock_device = MagicMock(spec=ChildDevice)
    mock_device.id = "dev-001"
    mock_device.guardian_id = str(uuid.uuid4())
    mock_device.name = "Test Device"
    mock_device.platform = "android"

    original = app.dependency_overrides.get(get_current_device)
    app.dependency_overrides[get_current_device] = lambda: mock_device
    yield mock_device
    if original:
        app.dependency_overrides[get_current_device] = original
    else:
        app.dependency_overrides.pop(get_current_device, None)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


class TestBatchIngestion:
    def test_batch_ingest_single_event(self, client):
        response = client.post(
            "/api/v1/events/ingest/batch",
            json={
                "batch_id": str(uuid.uuid4()),
                "device_id": "dev-001",
                "events": [
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "source": "esp32_pulse",
                        "payload": {"bpm": 72, "g_force": 1.05},
                    }
                ],
            },
        )
        assert response.status_code in (200, 201)
        data = response.json()
        assert data["accepted"] == 1
        assert data["rejected"] == 0
        assert len(data["results"]) == 1
        assert data["results"][0]["status"] == "synced"

    def test_batch_ingest_multiple_events(self, client):
        batch_id = str(uuid.uuid4())
        response = client.post(
            "/api/v1/events/ingest/batch",
            json={
                "batch_id": batch_id,
                "device_id": "dev-001",
                "events": [
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "source": "esp32_pulse",
                        "payload": {"bpm": 72},
                    },
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "source": "esp32_pulse",
                        "payload": {"bpm": 74},
                    },
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "source": "edge_behaviour",
                        "payload": {"motion": 0.1},
                    },
                ],
            },
        )
        assert response.status_code in (200, 201)
        data = response.json()
        assert data["accepted"] == 3
        assert data["rejected"] == 0

    def test_batch_requires_auth(self):
        """Without device auth, batch endpoint rejects (disabled override)."""
        app.dependency_overrides.pop(get_current_device, None)
        try:
            with TestClient(app) as c:
                response = c.post(
                    "/api/v1/events/ingest/batch",
                    json={
                        "batch_id": str(uuid.uuid4()),
                        "device_id": "dev-001",
                        "events": [{"timestamp": datetime.now(timezone.utc).isoformat(), "source": "test", "payload": {}}],
                    },
                )
                assert response.status_code == 401
        finally:
            mock_device = MagicMock(spec=ChildDevice)
            mock_device.id = "dev-001"
            mock_device.guardian_id = str(uuid.uuid4())
            mock_device.name = "Test Device"
            mock_device.platform = "android"
            app.dependency_overrides[get_current_device] = lambda: mock_device

    def test_batch_rejects_empty_events(self, client):
        response = client.post(
            "/api/v1/events/ingest/batch",
            json={
                "batch_id": str(uuid.uuid4()),
                "device_id": "dev-001",
                "events": [],
            },
        )
        assert response.status_code == 422

    def test_batch_rejects_too_many_events(self, client):
        events = [
            {"timestamp": datetime.now(timezone.utc).isoformat(), "source": "esp32_pulse", "payload": {"i": i}}
            for i in range(101)
        ]
        response = client.post(
            "/api/v1/events/ingest/batch",
            json={
                "batch_id": str(uuid.uuid4()),
                "device_id": "dev-001",
                "events": events,
            },
        )
        assert response.status_code == 422

    def test_batch_handles_invalid_json(self, client):
        response = client.post(
            "/api/v1/events/ingest/batch",
            json={
                "batch_id": str(uuid.uuid4()),
                "device_id": "dev-001",
                "events": [
                    {
                        "timestamp": "not-a-date",
                        "source": "test",
                        "payload": {},
                    }
                ],
            },
        )
        assert response.status_code == 422

    def test_batch_missing_batch_id(self, client):
        response = client.post(
            "/api/v1/events/ingest/batch",
            json={
                "device_id": "dev-001",
                "events": [{"timestamp": datetime.now(timezone.utc).isoformat(), "source": "test", "payload": {}}],
            },
        )
        assert response.status_code == 422

    def test_batch_idempotency_cache(self, client):
        """Repeating the same batch_id returns the cached result.

        Regression: the cache read/write used a coroutine + setex() that never
        worked on the lazy Redis client — the idempotency guarantee was dead.
        """
        from app.utils.redis_client import _mem_db

        batch_id = str(uuid.uuid4())
        events = [
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "source": "esp32_pulse",
                "payload": {"bpm": 72},
            }
        ]
        body = {"batch_id": batch_id, "device_id": "dev-001", "events": events}

        first = client.post("/api/v1/events/ingest/batch", json=body)
        assert first.status_code in (200, 201)
        first_data = first.json()
        assert first_data["accepted"] == 1

        # The idempotency key must now be present in the mock cache.
        key = f"prism:batch:{batch_id}"
        assert key in _mem_db, "idempotency cache key was not written"

        # A repeat with the same batch_id returns the cached result.
        second = client.post("/api/v1/events/ingest/batch", json=body)
        assert second.status_code in (200, 201)
        second_data = second.json()
        assert second_data["accepted"] == first_data["accepted"]
        assert second_data["batch_id"] == batch_id


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
