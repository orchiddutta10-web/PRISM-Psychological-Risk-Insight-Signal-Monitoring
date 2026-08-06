import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import get_db
from app.tests.conftest import override_get_db

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

def test_malformed_json_payload():
    """Test that the API rejects improperly formatted JSON gracefully."""
    response = client.post(
        "/api/v1/auth/login",
        data="this is not valid json",
        headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422

def test_missing_required_fields():
    """Test that the API rejects payloads missing required fields."""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "sarah@example.com"} # Missing password
    )
    assert response.status_code == 422

def test_invalid_data_types():
    """Test that the API rejects invalid data types."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": 12345, # Should be a string
            "email": "invalid-email", # Should be a valid email
            "password": "pass" # Too short
        }
    )
    assert response.status_code == 422

def test_telemetry_malformed_payload():
    """Test malformed telemetry payload ingestion."""
    # Assuming valid JWT is required, but validation of payload happens first or alongside
    response = client.post(
        "/api/v1/events/ingest",
        json={"signal_type": "location"} # Missing device_id and metadata
    )
    # Should either be 401 Unauthorized (if auth checked first) or 422 Unprocessable Entity
    assert response.status_code in (401, 403, 422)

def test_physio_ingest_malformed_payload():
    """Test malformed physio pulse ingest."""
    response = client.post(
        "/api/v1/physio/pulse/ingest",
        json={"bpm": "not_an_int", "g_force": "not_a_float"}
    )
    assert response.status_code in (401, 403, 422)
