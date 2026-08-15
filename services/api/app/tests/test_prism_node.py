from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app import models
from app.database import get_db
from app.demo_simulation_engine import simulate_tick
from app.main import app
from app.tests.conftest import TestingSessionLocal, override_get_db
from app.utils.auth import create_access_token, get_password_hash


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def _create_guardian_device(email: str):
    db = TestingSessionLocal()
    guardian = models.Guardian(
        full_name="Node Test Guardian",
        email=email,
        password_hash=get_password_hash("password"),
        role="guardian",
    )
    db.add(guardian)
    db.flush()
    device = models.ChildDevice(
        guardian_id=guardian.id,
        name="Node Test Device",
        platform="android",
        device_token=f"node-test-{email}",
    )
    db.add(device)
    db.commit()
    device_id = device.id
    token = create_access_token({"sub": guardian.id, "type": "guardian"})
    return db, guardian, device_id, token


def test_demo_tick_populates_prism_node_read_endpoints():
    db, guardian, device, token = _create_guardian_device("node-owner@example.com")
    now = datetime.now(timezone.utc)
    try:
        assert simulate_tick(db, now=now) == 1
    finally:
        db.close()

    headers = {"Authorization": f"Bearer {token}"}
    pulse = client.get(f"/api/v1/physio/pulse/readings/{device}", headers=headers)
    ppg = client.get(
        f"/api/v1/physio/readings/{device}?sensor_type=ppg", headers=headers
    )
    sleep = client.get(f"/api/v1/physio/sleep/{device}", headers=headers)
    node_status = client.get(f"/api/v1/physio/status/{device}", headers=headers)

    assert pulse.status_code == 200
    assert pulse.json()[0]["bpm"] > 0
    assert ppg.status_code == 200
    assert ppg.json()[0]["sensor_type"] == "ppg"
    assert sleep.status_code == 200
    assert sleep.json()[0]["confidence"] == 0.82
    assert node_status.status_code == 200
    assert node_status.json()["connected"] is True


def test_prism_node_reads_enforce_guardian_ownership():
    owner_db, _, device, _ = _create_guardian_device("node-owner-two@example.com")
    owner_db.close()
    other_db, _, _, other_token = _create_guardian_device("node-other@example.com")
    other_db.close()

    response = client.get(
        f"/api/v1/physio/pulse/readings/{device}",
        headers={"Authorization": f"Bearer {other_token}"},
    )

    assert response.status_code == 403


def test_demo_scenarios_route_is_registered():
    response = client.get("/demo/scenarios")

    assert response.status_code == 200
    assert response.json()["active"] == "1"
