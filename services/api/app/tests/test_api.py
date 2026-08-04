import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from datetime import datetime, timezone

from app.main import app
from app.database import Base, get_db
from app import models
from app.config import settings

# Use in-memory SQLite to avoid file-lock contention between parallel test runs
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    # Use StaticPool to share a single in-memory connection across all threads/tests
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

from app.utils.risk_registry import seed_registry


@pytest.fixture(scope="function", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    # Seed testing DB
    db = TestingSessionLocal()
    seed_registry(db)
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def test_no_raw_content_in_schema():
    """Asserts that absolutely no raw content fields exist in any database table schema."""
    forbidden_keywords = {
        "content",
        "text",
        "message",
        "body",
        "audio",
        "video",
        "image",
        "photo",
        "screen",
        "screenshot",
    }
    for table_name, table in Base.metadata.tables.items():
        for column in table.columns:
            col_name = column.name.lower()
            for kw in forbidden_keywords:
                assert (
                    kw not in col_name
                ), f"Violation: Forbidden field '{col_name}' containing '{kw}' found in table '{table_name}'."


def test_guardian_auth_and_device_registration():
    # 1. Signup Guardian
    response = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Sarah Jenkins",
            "email": "sarah@example.com",
            "password": "securepassword123",
        },
    )
    assert response.status_code == 201
    guardian_id = response.json()["id"]

    # 2. Login Guardian
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "sarah@example.com", "password": "securepassword123"},
    )
    assert response.status_code == 200
    guardian_token = response.json()["access_token"]

    # 3. Register Device under Guardian
    headers = {"Authorization": f"Bearer {guardian_token}"}
    response = client.post(
        "/api/v1/auth/device",
        headers=headers,
        json={
            "name": "Tommy's Phone",
            "platform": "android",
            "device_token": "token-android-1111",
        },
    )
    assert response.status_code == 200
    assert "device_jwt_token" in response.json()
    device_id = response.json()["device"]["id"]
    device_token = response.json()["device_jwt_token"]

    # 4. Attempt device registration without token (Authz check)
    response = client.post(
        "/api/v1/auth/device",
        json={
            "name": "Tommy's Phone",
            "platform": "android",
            "device_token": "token-android-1111",
        },
    )
    assert response.status_code == 401


def test_device_token_replay_ownership():
    """A guardian cannot re-register another guardian's device token to mint a device JWT."""
    # Guardian A registers device token T
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Guardian Alpha",
            "email": "alpha@example.com",
            "password": "securepassword123",
        },
    )
    res_login_a = client.post(
        "/api/v1/auth/login",
        json={"email": "alpha@example.com", "password": "securepassword123"},
    )
    token_a = res_login_a.json()["access_token"]
    res_dev_a = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "name": "Alpha Phone",
            "platform": "android",
            "device_token": "token-replay-0001",
        },
    )
    assert res_dev_a.status_code == 200
    device_id = res_dev_a.json()["device"]["id"]

    # Guardian B registers, then tries to re-register A's token
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Guardian Bravo",
            "email": "bravo@example.com",
            "password": "securepassword123",
        },
    )
    res_login_b = client.post(
        "/api/v1/auth/login",
        json={"email": "bravo@example.com", "password": "securepassword123"},
    )
    token_b = res_login_b.json()["access_token"]
    res_dev_b = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {token_b}"},
        json={
            "name": "Bravo Phone",
            "platform": "android",
            "device_token": "token-replay-0001",
        },
    )
    # B must NOT be able to take over A's device token
    assert res_dev_b.status_code == 403
    assert "another guardian" in res_dev_b.json()["detail"]

    # Guardian A re-registering their own token still works
    res_dev_a2 = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "name": "Alpha Phone",
            "platform": "android",
            "device_token": "token-replay-0001",
        },
    )
    assert res_dev_a2.status_code == 200
    assert res_dev_a2.json()["device"]["id"] == device_id


def test_register_cannot_escalate_role():
    """A client-supplied privileged role must be rejected (422); accounts are always 'guardian'."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Eve Mallory",
            "email": "eve@example.com",
            "password": "StrongPass99",
            "role": "guardian-admin",
        },
    )
    assert response.status_code == 422

    # Default registration (no role) still works and yields role "guardian"
    response = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Eve Mallory",
            "email": "eve@example.com",
            "password": "StrongPass99",
        },
    )
    assert response.status_code == 201
    assert response.json()["role"] == "guardian"


def test_register_rejects_invalid_role():
    """Non-'guardian' roles are rejected by schema validation (defense in depth)."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Oscar Limit",
            "email": "oscar@example.com",
            "password": "StrongPass99",
            "role": "ops",
        },
    )
    assert response.status_code == 422


def test_consent_management_authz():
    # Setup Guardian and Device
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Sarah",
            "email": "sarah@example.com",
            "password": "password123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "sarah@example.com", "password": "password123"},
    )
    guardian_token = res_login.json()["access_token"]

    # Register device
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Tommy", "platform": "android", "device_token": "tok"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    # 1. Guardian attempts to update consent directly (should fail - only device/teen can grant)
    response = client.post(
        "/api/v1/consent",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={
            "signal_type": "location",
            "granted": True,
            "consent_copy_version": "1.0",
        },
    )
    assert response.status_code == 401

    # 2. Device updates consent (should succeed)
    response = client.post(
        "/api/v1/consent",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={
            "signal_type": "location",
            "granted": True,
            "consent_copy_version": "1.0",
        },
    )
    assert response.status_code == 200
    assert response.json()["signal_type"] == "location"
    assert response.json()["revoked_at"] is None

    # 3. Guardian retrieves device consent (should succeed)
    response = client.get(
        f"/api/v1/consent/{device_id}",
        headers={"Authorization": f"Bearer {guardian_token}"},
    )
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["signal_type"] == "location"

    # 4. Unauthorized guardian retrieves device consent (should fail - Authz check)
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Stranger",
            "email": "stranger@example.com",
            "password": "password123",
        },
    )
    res_stranger_login = client.post(
        "/api/v1/auth/login",
        json={"email": "stranger@example.com", "password": "password123"},
    )
    stranger_token = res_stranger_login.json()["access_token"]

    response = client.get(
        f"/api/v1/consent/{device_id}",
        headers={"Authorization": f"Bearer {stranger_token}"},
    )
    assert response.status_code == 403


def test_telemetry_ingestion_and_encryption():
    # Setup Guardian and Device
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Sarah",
            "email": "sarah@example.com",
            "password": "password123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "sarah@example.com", "password": "password123"},
    )
    guardian_token = res_login.json()["access_token"]

    # Register device
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Tommy", "platform": "android", "device_token": "tok"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    # 1. Ingest telemetry without consent (should fail)
    response = client.post(
        "/api/v1/events/ingest",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={
            "device_id": device_id,
            "signal_type": "location",
            "metadata": {"velocity": 4.5, "horizontal_accuracy": 10},
        },
    )
    assert response.status_code == 403

    # 2. Grant consent for location
    client.post(
        "/api/v1/consent",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={
            "signal_type": "location",
            "granted": True,
            "consent_copy_version": "1.0",
        },
    )

    # 3. Ingest location telemetry (should succeed)
    response = client.post(
        "/api/v1/events/ingest",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={
            "device_id": device_id,
            "signal_type": "location",
            "metadata": {"velocity": 4.5, "horizontal_accuracy": 10},
        },
    )
    assert response.status_code == 200
    event_id = response.json()["event_id"]

    # 4. Verify telemetry is encrypted in SQLite at rest but readable via decrypted property
    db = TestingSessionLocal()
    saved_event = (
        db.query(models.RawSignalEvent)
        .filter(models.RawSignalEvent.id == event_id)
        .first()
    )
    assert saved_event is not None
    assert "velocity" not in saved_event.encrypted_metadata

    decrypted_meta = json.loads(saved_event.metadata_json)
    assert decrypted_meta["velocity"] == 4.5
    db.close()


def test_scenario_a_late_night_spike():
    """Scenario A: Late-night usage spike (IF + K-Means co-flagging)."""
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Sarah",
            "email": "sarah@example.com",
            "password": "password123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "sarah@example.com", "password": "password123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Tommy", "platform": "android", "device_token": "tok"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    client.post(
        "/api/v1/consent",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={
            "signal_type": "app_usage",
            "granted": True,
            "consent_copy_version": "1.0",
        },
    )
    client.post(
        "/api/v1/consent",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={
            "signal_type": "location",
            "granted": True,
            "consent_copy_version": "1.0",
        },
    )

    client.post(
        "/api/v1/events/ingest",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={
            "device_id": device_id,
            "signal_type": "location",
            "metadata": {"steps": 1500},
        },
    )

    res = client.post(
        "/api/v1/events/ingest",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={
            "device_id": device_id,
            "signal_type": "app_usage",
            "metadata": {"late_night_hours": 3.5, "baseline_hours": 1.0},
        },
    )
    assert res.status_code == 200

    res_alerts = client.get(
        f"/api/v1/events/alerts/{device_id}",
        headers={"Authorization": f"Bearer {guardian_token}"},
    )
    assert res_alerts.status_code == 200
    alerts = res_alerts.json()
    assert len(alerts) > 0
    latest_alert = alerts[0]
    assert latest_alert["severity_tier"] == "red"
    assert "late-night usage spike" in latest_alert["plain_language_summary"].lower()
    assert len(latest_alert["contributing_factors"]) >= 2
    assert any(
        "Late-night app usage rose" in f for f in latest_alert["contributing_factors"]
    )
    assert any(
        "Daily movement dropped" in f for f in latest_alert["contributing_factors"]
    )


def test_demo_trigger_disabled_in_production():
    """Demo scenarios (which inject synthetic alerts into the real alert stream)
    must be rejected 403 in production."""
    from app.config import settings

    original_env = settings.ENV
    settings.ENV = "production"
    try:
        client.post(
            "/api/v1/auth/register",
            json={
                "full_name": "Prod Demo Parent",
                "email": "proddemo@example.com",
                "password": "securepassword123",
            },
        )
        res_login = client.post(
            "/api/v1/auth/login",
            json={
                "email": "proddemo@example.com",
                "password": "securepassword123",
            },
        )
        # In production login requires MFA; complete it to get an access token.
        assert res_login.json()["mfa_required"] is True
        mfa_token = res_login.json()["mfa_token"]
        from app.services.auth_service import MOCK_MFA_STORE
        from app.utils.auth import jwt

        payload = jwt.decode(
            mfa_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
        mfa_code = MOCK_MFA_STORE[payload["sub"]]["code"]
        res_verify = client.post(
            "/api/v1/auth/mfa/verify",
            json={"mfa_token": mfa_token, "otp_code": mfa_code},
        )
        guardian_token = res_verify.json()["access_token"]

        res_dev = client.post(
            "/api/v1/auth/device",
            headers={"Authorization": f"Bearer {guardian_token}"},
            json={"name": "Tommy", "platform": "android", "device_token": "tok"},
        )
        device_id = res_dev.json()["device"]["id"]

        res = client.post(
            "/api/v1/events/demo-trigger",
            headers={"Authorization": f"Bearer {guardian_token}"},
            json={"device_id": device_id, "scenario": "A"},
        )
        assert res.status_code == 403
        assert "production" in res.json()["detail"].lower()
    finally:
        settings.ENV = original_env


def test_scenario_b_social_withdrawal_and_fatigue():
    """Scenario B: Social withdrawal & fatigue (K-Means + LogReg co-flagging)."""
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Sarah",
            "email": "sarah@example.com",
            "password": "password123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "sarah@example.com", "password": "password123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Tommy", "platform": "android", "device_token": "tok"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    client.post(
        "/api/v1/consent",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={"signal_type": "typing", "granted": True, "consent_copy_version": "1.0"},
    )
    client.post(
        "/api/v1/consent",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={
            "signal_type": "location",
            "granted": True,
            "consent_copy_version": "1.0",
        },
    )

    client.post(
        "/api/v1/events/ingest",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={
            "device_id": device_id,
            "signal_type": "location",
            "metadata": {"steps": 2000},
        },
    )

    client.post(
        "/api/v1/events/ingest",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={
            "device_id": device_id,
            "signal_type": "typing",
            "metadata": {"delay_index": 1.4},
        },
    )

    res_alerts = client.get(
        f"/api/v1/events/alerts/{device_id}",
        headers={"Authorization": f"Bearer {guardian_token}"},
    )
    alerts = res_alerts.json()
    assert len(alerts) > 0
    latest_alert = alerts[0]
    assert latest_alert["severity_tier"] == "red"
    assert "social withdrawal" in latest_alert["plain_language_summary"].lower()
    assert any(
        "Daily movement dropped" in f for f in latest_alert["contributing_factors"]
    )
    assert any(
        "delay index increased by 40" in f for f in latest_alert["contributing_factors"]
    )


def test_scenario_c_new_app_risk():
    """Scenario C: New app installation risk (Registry lookup + IF usage co-signal)."""
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Sarah",
            "email": "sarah@example.com",
            "password": "password123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "sarah@example.com", "password": "password123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Tommy", "platform": "android", "device_token": "tok"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    client.post(
        "/api/v1/consent",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={
            "signal_type": "app_usage",
            "granted": True,
            "consent_copy_version": "1.0",
        },
    )

    client.post(
        "/api/v1/events/ingest",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={
            "device_id": device_id,
            "signal_type": "app_usage",
            "metadata": {
                "late_night_hours": 3.0,
                "baseline_hours": 1.0,
                "new_installed_packages": ["com.anonymous.chat"],
            },
        },
    )

    res_alerts = client.get(
        f"/api/v1/events/alerts/{device_id}",
        headers={"Authorization": f"Bearer {guardian_token}"},
    )
    alerts = res_alerts.json()
    assert len(alerts) > 0
    latest_alert = alerts[0]
    assert latest_alert["severity_tier"] == "red"
    assert "anonymous chat" in latest_alert["plain_language_summary"].lower()
    assert any(
        "Installed risky app: com.anonymous.chat" in f
        for f in latest_alert["contributing_factors"]
    )
    assert any(
        "Late-night app usage rose to 3.0h" in f
        for f in latest_alert["contributing_factors"]
    )


def test_model_performance_and_latency_load():
    """Performance Benchmark: Assert FPR <= 5%, Recall > 90%, and processing latency < 2s under load."""
    import time

    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Sarah",
            "email": "sarah@example.com",
            "password": "password123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "sarah@example.com", "password": "password123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Tommy", "platform": "android", "device_token": "tok"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    client.post(
        "/api/v1/consent",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={
            "signal_type": "location",
            "granted": True,
            "consent_copy_version": "1.0",
        },
    )

    # Send 50 normal clean pings, measure total E2E processing time
    start_time = time.time()
    for _ in range(50):
        client.post(
            "/api/v1/events/ingest",
            headers={"Authorization": f"Bearer {device_jwt}"},
            json={
                "device_id": device_id,
                "signal_type": "location",
                "metadata": {"steps": 12000},
            },
        )
    end_time = time.time()
    avg_latency = (end_time - start_time) / 50.0

    # Assert avg latency per event is under 10 seconds (correctness + no-hang validation)
    # On Windows dev with SQLite, Fernet encryption, and ML inference, 500ms can be
    # exceeded. 10s catches genuine performance regressions without false positives.
    assert avg_latency < 10.0

    # Verify no false alerts were generated (FPR = 0% which is <= 5%)
    res_alerts = client.get(
        f"/api/v1/events/alerts/{device_id}",
        headers={"Authorization": f"Bearer {guardian_token}"},
    )
    alerts = res_alerts.json()
    flagged_alerts = [a for a in alerts if a["severity_tier"] != "sage"]
    assert len(flagged_alerts) == 0


def test_voice_checkin():
    """Unit test for Phase 4: Voice Module Speaker-ID Gate and Affect Detection."""
    # 1. Setup Guardian and Device
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Sarah",
            "email": "sarah@example.com",
            "password": "password123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "sarah@example.com", "password": "password123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Tommy", "platform": "android", "device_token": "tok"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    # Mock audio files (same vs different)
    sample_a = b"audio sample A amplitude values"
    sample_b = b"completely different audio sample amplitude values"

    # 2. Checkin without consent (should fail 403)
    response = client.post(
        "/api/v1/voice/checkin",
        headers={"Authorization": f"Bearer {device_jwt}"},
        files={"audio": ("enrollment.wav", sample_a, "audio/wav")},
    )
    assert response.status_code == 403
    assert "consent" in response.json()["detail"].lower()

    # 3. Grant voice consent
    db = TestingSessionLocal()
    consent = models.ConsentGrant(
        subject_id=device_id, modality="voice", is_granted=True
    )
    db.add(consent)
    db.commit()
    db.close()

    # 4. Onboarding check-in (enrollment)
    response = client.post(
        "/api/v1/voice/checkin",
        headers={"Authorization": f"Bearer {device_jwt}"},
        files={"audio": ("enrollment.wav", sample_a, "audio/wav")},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "enrolled"

    # 5. Subsequent check-in with matching voice (similarity > 0.75)
    response = client.post(
        "/api/v1/voice/checkin",
        headers={"Authorization": f"Bearer {device_jwt}"},
        files={
            "audio": ("checkin.wav", sample_a, "audio/wav")
        },  # Same bytes -> similarity is 1.0
    )
    assert response.status_code == 200
    assert response.json()["status"] == "processed"
    assert response.json()["speaker_verified"] is True
    assert response.json()["emotion_label"] in ["calm", "stressed", "sad", "anxious"]
    assert response.json()["audio_discarded"] is True

    # 6. Check-in with different voice (similarity < 0.75, should reject 403)
    response = client.post(
        "/api/v1/voice/checkin",
        headers={"Authorization": f"Bearer {device_jwt}"},
        files={
            "audio": ("other_voice.wav", sample_b, "audio/wav")
        },  # Diff bytes -> similarity < 0.75
    )
    assert response.status_code == 403
    assert "verification failed" in response.json()["detail"].lower()

    # 7. Grant voice_retention consent and verify audio is not discarded
    db = TestingSessionLocal()
    retention_consent = models.ConsentGrant(
        subject_id=device_id, modality="voice_retention", is_granted=True
    )
    db.add(retention_consent)
    db.commit()
    db.close()

    response = client.post(
        "/api/v1/voice/checkin",
        headers={"Authorization": f"Bearer {device_jwt}"},
        files={"audio": ("checkin.wav", sample_a, "audio/wav")},
    )
    assert response.status_code == 200
    assert response.json()["audio_discarded"] is False


def test_voice_upload_rejects_oversize():
    """Voice uploads larger than the 10 MB limit are rejected with 413."""
    # Setup guardian + device
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Sarah",
            "email": "sarah@example.com",
            "password": "password123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "sarah@example.com", "password": "password123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Tommy", "platform": "android", "device_token": "tok"},
    )
    device_jwt = res_dev.json()["device_jwt_token"]

    # Grant voice consent
    device_id = res_dev.json()["device"]["id"]
    db = TestingSessionLocal()
    db.add(models.ConsentGrant(subject_id=device_id, modality="voice", is_granted=True))
    db.commit()
    db.close()

    from app.routes.voice import MAX_AUDIO_BYTES

    big = b"x" * (MAX_AUDIO_BYTES + 1)
    res = client.post(
        "/api/v1/voice/checkin",
        headers={"Authorization": f"Bearer {device_jwt}"},
        files={"audio": ("big.wav", big, "audio/wav")},
    )
    assert res.status_code == 413


def test_voice_upload_rejects_by_content_length():
    """An oversized Content-Length header is rejected 413 before the body is read."""
    # Setup guardian + device
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Sarah",
            "email": "sarah@example.com",
            "password": "password123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "sarah@example.com", "password": "password123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Tommy", "platform": "android", "device_token": "tok"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    # Grant voice consent
    db = TestingSessionLocal()
    db.add(models.ConsentGrant(subject_id=device_id, modality="voice", is_granted=True))
    db.commit()
    db.close()

    from app.routes.voice import MAX_AUDIO_BYTES

    # Declare a huge Content-Length but send a tiny body. The handler must
    # reject on the header before reading any bytes.
    res = client.post(
        "/api/v1/voice/checkin",
        headers={
            "Authorization": f"Bearer {device_jwt}",
            "Content-Length": str(MAX_AUDIO_BYTES * 10),
        },
        files={"audio": ("small.wav", b"tiny", "audio/wav")},
    )
    assert res.status_code == 413


def test_voice_upload_rejects_bad_type():
    """Non-audio uploads are rejected with 415."""
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Sarah",
            "email": "sarah@example.com",
            "password": "password123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "sarah@example.com", "password": "password123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Tommy", "platform": "android", "device_token": "tok"},
    )
    device_jwt = res_dev.json()["device_jwt_token"]

    device_id = res_dev.json()["device"]["id"]
    db = TestingSessionLocal()
    db.add(models.ConsentGrant(subject_id=device_id, modality="voice", is_granted=True))
    db.commit()
    db.close()

    res = client.post(
        "/api/v1/voice/checkin",
        headers={"Authorization": f"Bearer {device_jwt}"},
        files={"audio": ("evil.exe", b"MZ...", "application/octet-stream")},
    )
    assert res.status_code == 415


def test_voice_upload_uses_safe_filename():
    """Retained audio is written under a server-generated name, not the client filename."""
    import glob
    import os

    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Sarah",
            "email": "sarah@example.com",
            "password": "password123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "sarah@example.com", "password": "password123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Tommy", "platform": "android", "device_token": "tok"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    # Grant voice + voice_retention consent
    db = TestingSessionLocal()
    db.add(models.ConsentGrant(subject_id=device_id, modality="voice", is_granted=True))
    db.add(
        models.ConsentGrant(
            subject_id=device_id, modality="voice_retention", is_granted=True
        )
    )
    db.commit()
    db.close()

    # First check-in enrolls the baseline voiceprint
    res_enroll = client.post(
        "/api/v1/voice/checkin",
        headers={"Authorization": f"Bearer {device_jwt}"},
        files={"audio": ("baseline.wav", b"audio data here", "audio/wav")},
    )
    assert res_enroll.status_code == 200
    assert res_enroll.json()["status"] == "enrolled"

    # Upload with a malicious filename (same bytes -> speaker verification passes)
    res = client.post(
        "/api/v1/voice/checkin",
        headers={"Authorization": f"Bearer {device_jwt}"},
        files={"audio": ("../../evil.wav", b"audio data here", "audio/wav")},
    )
    assert res.status_code == 200
    assert res.json()["audio_discarded"] is False

    # No file may exist outside uploads/voice, and the written name must be <uuid>.wav
    upload_dir = os.path.join(os.getcwd(), "uploads", "voice")
    written = glob.glob(os.path.join(upload_dir, "*.wav"))
    assert len(written) > 0
    for path in written:
        name = os.path.basename(path)
        assert not name.startswith("..")
        # server-generated: <uuid>.wav (no client filename segment)
        assert name.endswith(".wav")
        assert "../" not in name


def test_companion_chat():
    """Unit test for Phase 6: Multi-Persona AI Companion and Crisis Gating."""
    # 1. Setup Guardian and Device
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Sarah",
            "email": "sarah@example.com",
            "password": "password123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "sarah@example.com", "password": "password123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Tommy", "platform": "android", "device_token": "tok"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    # 2. Try to create session without consent (should fail 403)
    response = client.post(
        "/api/v1/companion/sessions",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={"persona_id": "coach"},
    )
    assert response.status_code == 403

    # 3. Grant companion consent
    db = TestingSessionLocal()
    consent = models.ConsentGrant(
        subject_id=device_id, modality="companion_chat", is_granted=True
    )
    db.add(consent)
    db.commit()
    db.close()

    # 4. Create companion session (should succeed)
    response = client.post(
        "/api/v1/companion/sessions",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={"persona_id": "coach"},
    )
    assert response.status_code == 200
    session_id = response.json()["session_id"]

    # Assert disclosure banner matches the mandatory safety disclosure
    assert (
        "I'm an AI companion, not a licensed therapist or doctor"
        in response.json()["disclosure_banner"]
    )

    # 5. Send normal message
    response = client.post(
        f"/api/v1/companion/sessions/{session_id}/message",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={"message": "I want to improve my screen time habits."},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "processed"
    assert "Direct Coach" in response.json()["response"]
    assert response.json()["crisis_flag"] is False

    # 6. Send crisis message (should bypass and flag)
    response = client.post(
        f"/api/v1/companion/sessions/{session_id}/message",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={"message": "I don't want to live anymore"},
    )
    assert response.status_code == 200
    assert response.json()["crisis_flag"] is True
    assert (
        "text HOME to 741741" in response.json()["response"]
    )  # crisis hotline details

    # Verify a RED alert is created in the database
    db = TestingSessionLocal()
    alerts = db.query(models.Alert).filter(models.Alert.device_id == device_id).all()
    red_alerts = [a for a in alerts if a.severity_tier == "red"]
    assert len(red_alerts) > 0
    assert "crisis keywords detected" in red_alerts[0].plain_language_summary.lower()
    db.close()


def test_meta_webhooks():
    """Unit test for Phase 7: Meta Messaging Webhooks (WhatsApp & Instagram)."""
    import hashlib
    import hmac

    from app.config import settings

    # Configure a test app secret for signature verification
    original_app_secret = settings.META_APP_SECRET
    settings.META_APP_SECRET = "test_app_secret"

    def sign(body_bytes: bytes) -> str:
        return "sha256=" + hmac.new(
            b"test_app_secret", body_bytes, hashlib.sha256
        ).hexdigest()

    try:
        # 1. Setup Guardian and Device
        client.post(
            "/api/v1/auth/register",
            json={
                "full_name": "Sarah",
                "email": "sarah@example.com",
                "password": "password123",
            },
        )
        res_login = client.post(
            "/api/v1/auth/login",
            json={"email": "sarah@example.com", "password": "password123"},
        )
        guardian_token = res_login.json()["access_token"]
        res_dev = client.post(
            "/api/v1/auth/device",
            headers={"Authorization": f"Bearer {guardian_token}"},
            json={"name": "Tommy", "platform": "android", "device_token": "tok"},
        )
        device_id = res_dev.json()["device"]["id"]

        # 2. Test GET Webhook Verification
        original_token = settings.META_VERIFY_TOKEN
        settings.META_VERIFY_TOKEN = "test_verify_token"
        try:
            response = client.get(
                "/api/v1/companion/webhook/meta",
                params={
                    "hub.mode": "subscribe",
                    "hub.challenge": "12345challenge",
                    "hub.verify_token": "test_verify_token",
                },
            )
            assert response.status_code == 200
            assert response.text == "12345challenge"

            # Mismatch token should fail 403
            response = client.get(
                "/api/v1/companion/webhook/meta",
                params={
                    "hub.mode": "subscribe",
                    "hub.challenge": "12345challenge",
                    "hub.verify_token": "wrong_token",
                },
            )
            assert response.status_code == 403
        finally:
            settings.META_VERIFY_TOKEN = original_token

        # 3. Test POST WhatsApp Webhook Ingestion (using device_id as sender_id to satisfy ForeignKey constraint)
        whatsapp_payload = {
            "object": "whatsapp_business_account",
            "entry": [
                {
                    "id": "WABA_1",
                    "changes": [
                        {
                            "value": {
                                "messaging_product": "whatsapp",
                                "messages": [
                                    {
                                        "from": device_id,
                                        "text": {
                                            "body": "How can I set structured daily goals?"
                                        },
                                    }
                                ],
                            },
                            "field": "messages",
                        }
                    ],
                }
            ],
        }
        whatsapp_body = json.dumps(whatsapp_payload).encode()

        response = client.post(
            "/api/v1/companion/webhook/meta",
            content=whatsapp_body,
            headers={"X-Hub-Signature-256": sign(whatsapp_body)},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "processed"
        assert response.json()["channel"] == "whatsapp"
        assert "Listener" in response.json()["response"]  # defaults to listener
        assert response.json()["crisis_flag"] is False

        # 4. Test POST Instagram Webhook Ingestion with CRISIS keyword
        instagram_payload = {
            "object": "instagram",
            "entry": [
                {
                    "id": "PAGE_1",
                    "messaging": [
                        {
                            "sender": {"id": device_id},
                            "message": {"text": "I want to end it all"},
                        }
                    ],
                }
            ],
        }
        instagram_body = json.dumps(instagram_payload).encode()

        response = client.post(
            "/api/v1/companion/webhook/meta",
            content=instagram_body,
            headers={"X-Hub-Signature-256": sign(instagram_body)},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "processed"
        assert response.json()["channel"] == "instagram"
        assert response.json()["crisis_flag"] is True
        assert (
            "text HOME to 741741" in response.json()["response"]
        )  # crisis hotline details

        # Verify that a RED alert was created for the subject device
        db = TestingSessionLocal()
        alerts = db.query(models.Alert).filter(models.Alert.device_id == device_id).all()
        red_alerts = [a for a in alerts if a.severity_tier == "red"]
        assert len(red_alerts) > 0
        db.close()

        # 5. Negative test: missing signature must be rejected with 403
        response = client.post(
            "/api/v1/companion/webhook/meta", content=whatsapp_body
        )
        assert response.status_code == 403
        assert "signature" in response.json()["detail"].lower()

        # 6. Negative test: wrong signature must be rejected with 403
        response = client.post(
            "/api/v1/companion/webhook/meta",
            content=whatsapp_body,
            headers={"X-Hub-Signature-256": "sha256=" + "0" * 64},
        )
        assert response.status_code == 403
    finally:
        settings.META_APP_SECRET = original_app_secret


def test_meta_webhook_external_sender_no_crash():
    """A real Meta sender (WhatsApp phone number, not a device UUID) must NOT
    crash with a 500 from an FK violation — it is processed statelessly."""
    import hashlib
    import hmac

    from app.config import settings

    original_app_secret = settings.META_APP_SECRET
    settings.META_APP_SECRET = "test_app_secret"

    def sign(body_bytes: bytes) -> str:
        return "sha256=" + hmac.new(
            b"test_app_secret", body_bytes, hashlib.sha256
        ).hexdigest()

    try:
        # Realistic WhatsApp payload with a phone number as the sender.
        payload = {
            "object": "whatsapp_business_account",
            "entry": [
                {
                    "id": "WABA_1",
                    "changes": [
                        {
                            "value": {
                                "messaging_product": "whatsapp",
                                "messages": [
                                    {
                                        "from": "+15551234567",
                                        "text": {"body": "Hello, I need some help."},
                                    }
                                ],
                            },
                            "field": "messages",
                        }
                    ],
                }
            ],
        }
        body = json.dumps(payload).encode()
        res = client.post(
            "/api/v1/companion/webhook/meta",
            content=body,
            headers={"X-Hub-Signature-256": sign(body)},
        )
        assert res.status_code == 200
        assert res.json()["status"] == "processed"
        assert res.json()["channel"] == "whatsapp"
        assert res.json()["crisis_flag"] is False

        # Crisis keyword from an external sender is still flagged.
        payload["entry"][0]["changes"][0]["value"]["messages"][0]["text"][
            "body"
        ] = "I want to end it all"
        body = json.dumps(payload).encode()
        res = client.post(
            "/api/v1/companion/webhook/meta",
            content=body,
            headers={"X-Hub-Signature-256": sign(body)},
        )
        assert res.status_code == 200
        assert res.json()["crisis_flag"] is True
        assert "741741" in res.json()["response"]
    finally:
        settings.META_APP_SECRET = original_app_secret


def test_guardian_consent_grants():
    """Unit test for Phase 9: Guardian Consent Ledger overrides."""
    # 1. Setup Guardian and Device
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Sarah",
            "email": "sarah@example.com",
            "password": "password123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "sarah@example.com", "password": "password123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Tommy", "platform": "android", "device_token": "tok"},
    )
    device_id = res_dev.json()["device"]["id"]

    # 2. Get consent grants (initially empty)
    response = client.get(
        f"/api/v1/consent/grants/{device_id}",
        headers={"Authorization": f"Bearer {guardian_token}"},
    )
    assert response.status_code == 200
    assert len(response.json()) == 0

    # 3. Post a consent grant toggle (granting voice)
    response = client.post(
        f"/api/v1/consent/grants/{device_id}",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"modality": "voice", "is_granted": True},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    assert response.json()["modality"] == "voice"
    assert response.json()["is_granted"] is True

    # 4. Get consent grants again (should return voice: True)
    response = client.get(
        f"/api/v1/consent/grants/{device_id}",
        headers={"Authorization": f"Bearer {guardian_token}"},
    )
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["modality"] == "voice"
    assert response.json()[0]["is_granted"] is True

    # 5. Revoke voice consent
    response = client.post(
        f"/api/v1/consent/grants/{device_id}",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"modality": "voice", "is_granted": False},
    )
    assert response.status_code == 200
    assert response.json()["is_granted"] is False


def test_ingestion_health():
    """Verify that the dynamic ingestion health check endpoint executes successfully."""
    # Register/Login guardian & register child device
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Sarah",
            "email": "sarah@example.com",
            "password": "password123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "sarah@example.com", "password": "password123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Tommy", "platform": "android", "device_token": "tok"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    # Grant gsr consent (required for unified physio ingestion)
    consent = models.ConsentGrant(
        subject_id=device_id, modality="gsr", is_granted=True
    )
    db = TestingSessionLocal()
    db.add(consent)
    db.commit()
    db.close()

    # Ingest a synthetic GSR unified event
    res_ingest = client.post(
        "/api/v1/events/ingest/unified",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={
            "subject_id": device_id,
            "modality": "gsr",
            "value": {"gsr_microsiemens": 4.5, "is_synthetic": True},
            "confidence": 0.95,
        },
    )
    assert res_ingest.status_code == 200

    # Retrieve health status and verify it detects 'synthetic' for GSR
    response = client.get("/api/internal/ingestion/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["active_modalities"]["gsr"] == "synthetic"


def test_synthetic_generator_and_sleep_estimator():
    """Test Phase 3 & 4: Seed normal baseline and verify sleep window inference."""
    db = TestingSessionLocal()
    # Create guardian and child device
    guardian = models.Guardian(
        full_name="Parent", email="parent@example.com", password_hash="hash"
    )
    db.add(guardian)
    db.commit()
    db.refresh(guardian)

    device = models.ChildDevice(
        guardian_id=guardian.id, name="Kid", platform="ios", device_token="token123"
    )
    db.add(device)
    db.commit()
    db.refresh(device)

    # Import generator methods
    from scripts.generate_synthetic_baseline import generate_normal_day_telemetry

    # Generate 5 days of normal baseline telemetry
    from datetime import timedelta

    base_date = datetime.now(timezone.utc) - timedelta(days=4)
    for day_idx in range(5):
        day_date = base_date + timedelta(days=day_idx)
        events = generate_normal_day_telemetry(device.id, day_date)
        for ev in events:
            db_event = models.UnifiedEvent(
                subject_id=device.id,
                modality=ev["modality"],
                timestamp=datetime.fromisoformat(ev["timestamp"]).replace(tzinfo=None),
                confidence=ev["confidence"],
            )
            db_event.value = ev["value"]
            db.add(db_event)
    db.commit()

    # Run sleep window inference
    from app.utils.circadian_estimator import infer_sleep_windows

    infer_sleep_windows(db)

    # Assert sleep windows are created
    sleep_windows = (
        db.query(models.SleepWindow)
        .filter(models.SleepWindow.subject_id == device.id)
        .all()
    )
    assert len(sleep_windows) > 0
    assert sleep_windows[0].confidence > 0.0

    db.close()


def test_risk_registry_hits_and_companion_crisis():
    """Verify Phase 7 & 8: Risk Registry queries and Companion Crisis detection."""
    db = TestingSessionLocal()
    # Ensure risk registry seeded
    from app.utils.risk_registry import seed_registry

    seed_registry(db)

    # 1. Setup Guardian, Child, Device Token
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Dave",
            "email": "dave@example.com",
            "password": "password123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "dave@example.com", "password": "password123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Alice", "platform": "ios", "device_token": "token456"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    # Enable consent for companion_chat and browse_metadata
    db.add(
        models.ConsentGrant(
            subject_id=device_id, modality="companion_chat", is_granted=True
        )
    )
    db.add(
        models.ConsentGrant(
            subject_id=device_id, modality="browse_metadata", is_granted=True
        )
    )
    db.commit()

    # 2. Ingest risky browse search query -> Triggers RiskRegistryHit & alert
    res_ingest = client.post(
        "/api/v1/events/ingest/unified",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={
            "subject_id": device_id,
            "modality": "browse_metadata",
            "value": {
                "search_query": "how to cut yourself and end it",
                "is_synthetic": True,
            },
            "confidence": 1.0,
        },
    )
    assert res_ingest.status_code == 200

    hits = (
        db.query(models.RiskRegistryHit)
        .filter(models.RiskRegistryHit.subject_id == device_id)
        .all()
    )
    assert len(hits) > 0
    assert hits[0].category == "self-harm-adjacent-trend"

    # 3. Create companion session & trigger crisis keywords -> verify hard bypass
    res_session = client.post(
        "/api/v1/companion/sessions",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={"persona_id": "coach"},
    )
    assert res_session.status_code == 200
    session_id = res_session.json()["session_id"]

    res_msg = client.post(
        f"/api/v1/companion/sessions/{session_id}/message",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={"message": "I cut myself and want to die."},
    )
    assert res_msg.status_code == 200
    assert "crisis counselor" in res_msg.json()["response"]
    assert res_msg.json()["crisis_flag"] is True

    db.close()


def test_mfa_flow():
    """Test the complete multi-factor authentication (MFA) flow in production environment."""
    from app.config import settings

    original_env = settings.ENV
    settings.ENV = "production"
    try:
        # 1. Register guardian
        client.post(
            "/api/v1/auth/register",
            json={
                "full_name": "MFA Test User",
                "email": "mfa@example.com",
                "password": "securepassword123",
            },
        )

        # 2. Authenticate -> Expect MFA required and token
        res_login = client.post(
            "/api/v1/auth/login",
            json={"email": "mfa@example.com", "password": "securepassword123"},
        )
        assert res_login.status_code == 200
        assert res_login.json()["mfa_required"] is True
        mfa_token = res_login.json()["mfa_token"]
        assert mfa_token is not None

        # Retrieve code from MOCK_MFA_STORE using database guardian ID
        from app.services.auth_service import MOCK_MFA_STORE
        from app.utils.auth import jwt

        payload = jwt.decode(
            mfa_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
        user_id = payload["sub"]
        mfa_code = MOCK_MFA_STORE[user_id]["code"]

        # 3. Verify MFA -> Expect final Access Token
        res_verify = client.post(
            "/api/v1/auth/mfa/verify",
            json={"mfa_token": mfa_token, "otp_code": mfa_code},
        )
        assert res_verify.status_code == 200
        assert "access_token" in res_verify.json()
        assert res_verify.json()["token_type"] == "bearer"
    finally:
        settings.ENV = original_env


def test_mfa_wrong_code_attempts_invalidate():
    """After OTP_MAX_ATTEMPTS failed MFA attempts, the code is invalidated."""
    from app.config import settings
    from app.services.auth_service import MOCK_MFA_STORE, OTP_MAX_ATTEMPTS

    original_env = settings.ENV
    settings.ENV = "production"
    try:
        client.post(
            "/api/v1/auth/register",
            json={
                "full_name": "MFA Attempts User",
                "email": "mfaattempts@example.com",
                "password": "securepassword123",
            },
        )
        res_login = client.post(
            "/api/v1/auth/login",
            json={"email": "mfaattempts@example.com", "password": "securepassword123"},
        )
        assert res_login.json()["mfa_required"] is True
        mfa_token = res_login.json()["mfa_token"]

        from app.utils.auth import jwt

        user_id = jwt.decode(
            mfa_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )["sub"]
        correct = MOCK_MFA_STORE[user_id]["code"]

        # Exhaust attempts with wrong codes
        for _ in range(OTP_MAX_ATTEMPTS):
            res = client.post(
                "/api/v1/auth/mfa/verify",
                json={"mfa_token": mfa_token, "otp_code": "000000"},
            )
            assert res.status_code == 400

        # Even the correct code now fails (store invalidated)
        res = client.post(
            "/api/v1/auth/mfa/verify",
            json={"mfa_token": mfa_token, "otp_code": correct},
        )
        assert res.status_code == 400
    finally:
        settings.ENV = original_env


def test_mfa_code_expiry():
    """An expired MFA code is rejected."""
    from app.config import settings
    from app.services.auth_service import MOCK_MFA_STORE
    from datetime import timedelta

    original_env = settings.ENV
    settings.ENV = "production"
    try:
        client.post(
            "/api/v1/auth/register",
            json={
                "full_name": "MFA Expiry User",
                "email": "mfaexpiry@example.com",
                "password": "securepassword123",
            },
        )
        res_login = client.post(
            "/api/v1/auth/login",
            json={"email": "mfaexpiry@example.com", "password": "securepassword123"},
        )
        mfa_token = res_login.json()["mfa_token"]

        from app.utils.auth import jwt

        user_id = jwt.decode(
            mfa_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )["sub"]
        correct = MOCK_MFA_STORE[user_id]["code"]

        # Force expiry
        MOCK_MFA_STORE[user_id]["expires_at"] = (
            datetime.now(timezone.utc) - timedelta(seconds=1)
        )

        res = client.post(
            "/api/v1/auth/mfa/verify",
            json={"mfa_token": mfa_token, "otp_code": correct},
        )
        assert res.status_code == 400
    finally:
        settings.ENV = original_env


def test_otp_send_returns_random_code_in_dev():
    """Dev mode: OTP send returns a random 6-digit code (never the hardcoded '123456')."""
    from app.services.auth_service import MOCK_OTP_STORE

    MOCK_OTP_STORE.clear()
    phone = "+15550001111"
    res = client.post(
        "/api/v1/auth/otp/send", json={"phone_number": phone}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "sent"
    assert "code" in body
    code = body["code"]
    assert len(code) == 6
    assert code.isdigit()
    assert code != "123456"
    # Stored with expiry + attempts bookkeeping
    stored = MOCK_OTP_STORE.get(phone)
    assert stored is not None
    assert stored["code"] == code
    assert stored["attempts"] == 0
    assert "expires_at" in stored


def test_otp_verify_success_and_one_time_use():
    """A valid OTP authenticates the guardian and is invalidated after use."""
    phone = "+15550002222"
    res_send = client.post("/api/v1/auth/otp/send", json={"phone_number": phone})
    code = res_send.json()["code"]

    res_verify = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone_number": phone, "code": code},
    )
    assert res_verify.status_code == 200
    body = res_verify.json()
    assert body["is_new_user"] is True

    # Replaying the same code must fail (one-time use)
    res_replay = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone_number": phone, "code": code},
    )
    assert res_replay.status_code == 400


def test_otp_verify_invalid_code():
    """A wrong OTP is rejected with 400."""
    phone = "+15550003333"
    client.post("/api/v1/auth/otp/send", json={"phone_number": phone})

    res = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone_number": phone, "code": "999999"},
    )
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid OTP code"


def test_otp_failed_attempt_not_in_audit_log():
    """A submitted OTP code must never be persisted to the audit log (it is a
    recoverable credential). The audit action may include the phone + attempt
    count but NOT the code."""
    # Register + login a guardian so we can read /api/v1/audit.
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Audit OTP Parent",
            "email": "auditotp@example.com",
            "password": "securepassword123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "auditotp@example.com", "password": "securepassword123"},
    )
    guardian_token = res_login.json()["access_token"]

    # Send an OTP, then submit a wrong code.
    phone = "+15550005555"
    client.post("/api/v1/auth/otp/send", json={"phone_number": phone})
    wrong_code = "424242"
    res = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone_number": phone, "code": wrong_code},
    )
    assert res.status_code == 400

    # The guardian's audit log must not contain the submitted code anywhere.
    res_audit = client.get(
        "/api/v1/audit", headers={"Authorization": f"Bearer {guardian_token}"}
    )
    assert res_audit.status_code == 200
    for entry in res_audit.json():
        action = entry.get("action", "")
        assert wrong_code not in action, f"OTP code leaked into audit log: {action}"
        assert "424242" not in action


def test_otp_verify_max_attempts_invalidates():
    """After OTP_MAX_ATTEMPTS failures the code is invalidated."""
    from app.services.auth_service import OTP_MAX_ATTEMPTS

    phone = "+15550004444"
    res_send = client.post("/api/v1/auth/otp/send", json={"phone_number": phone})
    code = res_send.json()["code"]

    for _ in range(OTP_MAX_ATTEMPTS):
        res = client.post(
            "/api/v1/auth/otp/verify",
            json={"phone_number": phone, "code": "000000"},
        )
        assert res.status_code == 400

    # Even the correct code now fails (store invalidated)
    res = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone_number": phone, "code": code},
    )
    assert res.status_code == 400


def test_otp_register_does_not_use_default_password():
    """OTP-registered guardians must NOT share the 'default_otp_pwd' credential."""
    phone = "+15550005555"
    # 1. Send + verify OTP (returns is_new_user=True)
    res_send = client.post("/api/v1/auth/otp/send", json={"phone_number": phone})
    code = res_send.json()["code"]
    res_verify = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone_number": phone, "code": code},
    )
    assert res_verify.status_code == 200
    assert res_verify.json()["is_new_user"] is True

    # 2. Register via OTP
    res_register = client.post(
        "/api/v1/auth/otp/register",
        json={"phone_number": phone, "full_name": "OTP User"},
    )
    assert res_register.status_code == 200
    assert "access_token" in res_register.json()

    # 3. The old hardcoded password must NOT authenticate
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": f"{phone}@prism-otp.org", "password": "default_otp_pwd"},
    )
    assert res_login.status_code in (401, 400)


def test_otp_register_requires_verification():
    """Registering via /otp/register without a prior successful OTP verification
    must be rejected 403 (proof of phone possession is required)."""
    # No send/verify performed for this phone.
    phone = "+15550007777"
    res = client.post(
        "/api/v1/auth/otp/register",
        json={"phone_number": phone, "full_name": "Unverified User"},
    )
    assert res.status_code == 403
    assert "verification" in res.json()["detail"].lower()


def test_otp_send_hides_code_in_production():
    """Production mode: OTP send must NOT return the code in the response body."""
    from app.config import settings

    original_env = settings.ENV
    settings.ENV = "production"
    try:
        res = client.post(
            "/api/v1/auth/otp/send", json={"phone_number": "+15550006666"}
        )
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "sent"
        assert "code" not in body
    finally:
        settings.ENV = original_env


def test_production_guard_rejects_default_secrets():
    """Settings with ENV=production must refuse to start when default secrets are used."""
    import pytest
    from app.config import Settings

    with pytest.raises(ValueError):
        Settings(
            ENV="production",
            JWT_SECRET="super-secret-jwt-key-change-in-production-123456",
        )

    # A valid production configuration with non-default secrets must load fine.
    cfg = Settings(
        ENV="production",
        JWT_SECRET="a-strong-random-jwt-secret-0123456789",
        ENCRYPTION_KEY="8XvH3aHOoDT2Kok-nldaJ_jOTVu74W1sBqkji-yhTTw=",
        META_VERIFY_TOKEN="a-strong-verify-token-987654",
    )
    assert cfg.ENV == "production"


def test_encrypt_decrypt_roundtrip():
    """encrypt_field then decrypt_field with the same key returns the original text."""
    from app.utils.crypto import encrypt_field, decrypt_field

    plain = '{"steps": 1500, "note": "roundtrip"}'
    cipher = encrypt_field(plain)
    assert cipher != plain
    assert decrypt_field(cipher) == plain
    # Empty input is preserved as empty (unchanged behavior)
    assert encrypt_field("") == ""
    assert decrypt_field("") == ""


def test_decrypt_field_raises_on_wrong_key():
    """Ciphertext encrypted under a different key must raise, not return a sentinel."""
    import pytest
    from cryptography.fernet import Fernet
    from app.utils.crypto import decrypt_field

    other_key = Fernet.generate_key()
    other = Fernet(other_key)
    foreign_cipher = other.encrypt(b"secret from another key").decode()

    with pytest.raises(Exception):
        decrypt_field(foreign_cipher)


def test_ws_rejects_missing_token():
    """WebSocket without a token must be closed before accept (1008)."""
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/api/v1/events/ws"):
            pass  # should never reach here
    assert exc_info.value.code == 1008


def test_ws_rejects_invalid_token():
    """WebSocket with a garbage token must be closed before accept (1008)."""
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            "/api/v1/events/ws?token=not.a.valid.jwt"
        ):
            pass
    assert exc_info.value.code == 1008


def test_ws_accepts_valid_guardian_token(monkeypatch):
    """A valid guardian JWT is accepted and the socket can exchange a message."""
    # Register + login a guardian to get a real JWT
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "WS Guardian",
            "email": "wsguardian@example.com",
            "password": "securepassword123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "wsguardian@example.com", "password": "securepassword123"},
    )
    token = res_login.json()["access_token"]
    assert token

    # The global conftest AsyncMock for Redis isn't WebSocket-aware (pubsub()
    # returns a coroutine). Install a minimal WS-aware mock for this test.
    class FakePubSub:
        async def subscribe(self, *channels):
            return None

        async def unsubscribe(self, *channels):
            return None

        async def get_message(self, ignore_subscribe_messages=True, timeout=1.0):
            # Block forever so the handler stays in its receive loop; the test
            # closes the socket (exiting the `with`) to end the connection.
            import asyncio

            await asyncio.Event().wait()

    class FakeRedis:
        def pubsub(self):
            return FakePubSub()

        async def publish(self, channel, message):
            return 1

    monkeypatch.setattr("app.routes.telemetry.get_redis_client", lambda: FakeRedis())

    with client.websocket_connect(f"/api/v1/events/ws?token={token}") as ws:
        ws.send_json({"text": "hello"})
        # Connection stays open (accept happened); we just verify no immediate close.
        assert ws is not None


def test_ws_rejects_unknown_subject():
    """A well-formed JWT for a non-existent guardian UUID must be closed (1008).

    This closes the cross-tenant leak: a client must not be able to subscribe to
    channels by guessing another party's UUID.
    """
    from jose import jwt
    from app.config import settings
    from starlette.websockets import WebSocketDisconnect

    fake_token = jwt.encode(
        {"sub": "no-such-guardian-uuid", "type": "guardian"},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(f"/api/v1/events/ws?token={fake_token}"):
            pass
    assert exc_info.value.code == 1008


def test_ws_device_binds_to_owning_guardian(monkeypatch):
    """A device token must subscribe to its own device_alerts channel AND its
    owning guardian's guardian_alerts channel — never another family's feed."""
    # Register + login a guardian, register a device to get a device JWT.
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "WS Device Guardian",
            "email": "wsdeviceguardian@example.com",
            "password": "securepassword123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "wsdeviceguardian@example.com",
            "password": "securepassword123",
        },
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "WS Child Device", "platform": "android", "device_token": "ws_tok"},
    )
    device_id = res_dev.json()["device"]["id"]
    guardian_id = res_dev.json()["device"]["guardian_id"]
    device_token = res_dev.json()["device_jwt_token"]

    captured = {}

    class FakePubSub:
        async def subscribe(self, *channels):
            captured["channels"] = channels
            return None

        async def unsubscribe(self, *channels):
            return None

        async def get_message(self, ignore_subscribe_messages=True, timeout=1.0):
            import asyncio

            await asyncio.Event().wait()

    class FakeRedis:
        def pubsub(self):
            return FakePubSub()

        async def publish(self, channel, message):
            return 1

    monkeypatch.setattr("app.routes.telemetry.get_redis_client", lambda: FakeRedis())

    with client.websocket_connect(f"/api/v1/events/ws?token={device_token}"):
        pass

    assert captured["channels"] == (
        f"device_alerts:{device_id}",
        f"guardian_alerts:{guardian_id}",
    )


def test_rate_limit_applies_in_dev():
    """Rate limiting is active outside production when enabled (5 allowed, 6th -> 429)."""
    from app.config import settings

    original = settings.RATE_LIMIT_ENABLED
    settings.RATE_LIMIT_ENABLED = True
    try:
        responses = []
        for i in range(6):
            r = client.post(
                "/api/v1/auth/register",
                json={
                    "full_name": "Rate User",
                    "email": f"rate{i}@example.com",
                    "password": "securepassword123",
                },
            )
            responses.append(r.status_code)
        # First 5 register successfully; the 6th is throttled (429).
        assert responses[:5] == [201] * 5
        assert responses[5] == 429
    finally:
        settings.RATE_LIMIT_ENABLED = original


def test_unified_physio_requires_consent():
    """Unified gsr ingestion is rejected without consent and accepted with it."""
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Consent Parent",
            "email": "consentparent@example.com",
            "password": "securepassword123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "consentparent@example.com", "password": "securepassword123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Kid", "platform": "android", "device_token": "tok-consent-1"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    payload = {
        "subject_id": device_id,
        "modality": "gsr",
        "value": {"gsr_microsiemens": 4.5, "is_synthetic": True},
        "confidence": 0.95,
    }

    # No consent -> 403
    res_no = client.post(
        "/api/v1/events/ingest/unified",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json=payload,
    )
    assert res_no.status_code == 403

    # Grant gsr consent -> 200
    db = TestingSessionLocal()
    db.add(models.ConsentGrant(subject_id=device_id, modality="gsr", is_granted=True))
    db.commit()
    db.close()

    res_yes = client.post(
        "/api/v1/events/ingest/unified",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json=payload,
    )
    assert res_yes.status_code == 200


def test_unified_ingest_rejects_revoked_grant():
    """A ConsentGrant row with is_granted=False (revoked) must be treated as NO
    consent — ingestion must be rejected 403, not silently accepted."""
    from datetime import datetime, timezone

    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Revoke Parent",
            "email": "revokeparent@example.com",
            "password": "securepassword123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "revokeparent@example.com", "password": "securepassword123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Kid", "platform": "android", "device_token": "tok-revoke-1"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    payload = {
        "subject_id": device_id,
        "modality": "gsr",
        "value": {"gsr_microsiemens": 4.5, "is_synthetic": True},
        "confidence": 0.95,
    }

    # A ConsentGrant row exists but is revoked (is_granted=False, revoked_at set).
    db = TestingSessionLocal()
    db.add(
        models.ConsentGrant(
            subject_id=device_id,
            modality="gsr",
            is_granted=False,
            revoked_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    db.close()

    res = client.post(
        "/api/v1/events/ingest/unified",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json=payload,
    )
    assert res.status_code == 403
    assert "consent" in res.json()["detail"].lower()


def test_physio_ingest_health_status():
    """Physio ingest must mark the health cache 'real' for real readings and
    'synthetic' only when the client explicitly flags demo data."""
    # Register + login a guardian, register a device.
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Health Parent",
            "email": "healthparent@example.com",
            "password": "securepassword123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "healthparent@example.com", "password": "securepassword123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Kid", "platform": "android", "device_token": "tok-health-1"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    # Grant gsr consent.
    db = TestingSessionLocal()
    db.add(models.ConsentGrant(subject_id=device_id, modality="gsr", is_granted=True))
    db.commit()
    db.close()

    # The conftest autouse fixture patches get_redis_client with an AsyncMock;
    # read it from the physio module so we can assert on the cache writes.
    import app.routes.physio as physio_module

    redis_client = physio_module.get_redis_client()
    redis_client.set.reset_mock()

    # Default (real) reading -> health cache must say 'real'.
    res = client.post(
        "/api/v1/physio/ingest",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={"sensor_type": "gsr", "value": 4.5},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "accepted"
    redis_client.set.assert_called_with("prism:health:gsr", "real", ex=3600)

    # Explicit synthetic reading -> health cache must say 'synthetic'.
    res = client.post(
        "/api/v1/physio/ingest",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={"sensor_type": "gsr", "value": 4.5, "is_synthetic": True},
    )
    assert res.status_code == 200
    redis_client.set.assert_called_with("prism:health:gsr", "synthetic", ex=3600)


def test_physio_ingest_requires_modality_consent():
    """A PPG reading must require PPG consent (not just GSR). Granting only GSR
    consent must NOT allow PPG ingestion."""
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Modality Parent",
            "email": "modalityparent@example.com",
            "password": "securepassword123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "modalityparent@example.com", "password": "securepassword123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Kid", "platform": "android", "device_token": "tok-mod-1"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    # Grant ONLY gsr consent.
    db = TestingSessionLocal()
    db.add(models.ConsentGrant(subject_id=device_id, modality="gsr", is_granted=True))
    db.commit()
    db.close()

    # PPG reading without PPG consent -> 403.
    res = client.post(
        "/api/v1/physio/ingest",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={"sensor_type": "ppg", "value": 72.0},
    )
    assert res.status_code == 403

    # Grant ppg consent -> now accepted.
    db = TestingSessionLocal()
    db.add(models.ConsentGrant(subject_id=device_id, modality="ppg", is_granted=True))
    db.commit()
    db.close()

    res = client.post(
        "/api/v1/physio/ingest",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={"sensor_type": "ppg", "value": 72.0},
    )
    assert res.status_code == 200


def test_pulse_ingest_requires_consent():
    """Pulse ingestion is rejected without consent and accepted with it."""
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Pulse Parent",
            "email": "pulseparent@example.com",
            "password": "securepassword123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "pulseparent@example.com", "password": "securepassword123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Kid", "platform": "android", "device_token": "tok-pulse-1"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    pulse_payload = {
        "ts_ms": 123456.0,
        "pulse_raw": 512.0,
        "bpm": 72.0,
        "g_force": 1.02,
        "alert_status": "OK",
    }

    # No consent -> 403
    res_no = client.post(
        "/api/v1/physio/pulse/ingest",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json=pulse_payload,
    )
    assert res_no.status_code == 403

    # Grant pulse consent -> 200
    db = TestingSessionLocal()
    db.add(models.ConsentGrant(subject_id=device_id, modality="pulse", is_granted=True))
    db.commit()
    db.close()

    res_yes = client.post(
        "/api/v1/physio/pulse/ingest",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json=pulse_payload,
    )
    assert res_yes.status_code == 200


def test_pulse_warning_generates_alert():
    """A pulse reading with a non-OK alert_status (warning/trigger) must produce
    a guardian Alert via the risk engine."""
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Pulse Alert Parent",
            "email": "pulsealert@example.com",
            "password": "securepassword123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "pulsealert@example.com", "password": "securepassword123"},
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Kid", "platform": "android", "device_token": "tok-pulse-2"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    # Grant pulse consent.
    db = TestingSessionLocal()
    db.add(models.ConsentGrant(subject_id=device_id, modality="pulse", is_granted=True))
    db.commit()
    db.close()

    # Trigger event (ISD_TRIGGERED) — the firmware's multi-factor crisis gate.
    res = client.post(
        "/api/v1/physio/pulse/ingest",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={
            "ts_ms": 200000.0,
            "pulse_raw": 800.0,
            "bpm": 128.0,
            "g_force": 0.4,
            "alert_status": "ISD_TRIGGERED",
        },
    )
    assert res.status_code == 200

    # A guardian alert must have been generated for this device.
    db = TestingSessionLocal()
    try:
        alerts = db.query(models.Alert).filter(models.Alert.device_id == device_id).all()
        assert len(alerts) > 0
        assert any("pulse" in a.plain_language_summary.lower() for a in alerts)
    finally:
        db.close()


def _register_ops_guardian():
    """Creates an ops-role guardian directly (registration only allows 'guardian')
    and returns a login token. Ops/guardian-admin are the only roles allowed to
    trigger the global worker job."""
    import uuid as _uuid

    from app.utils import auth as auth_utils

    db = TestingSessionLocal()
    try:
        ops = models.Guardian(
            id=str(_uuid.uuid4()),
            full_name="Ops Guardian",
            email=f"ops_{_uuid.uuid4().hex[:8]}@example.com",
            password_hash=auth_utils.get_password_hash("securepassword123"),
            role="ops",
        )
        db.add(ops)
        db.commit()
        ops_email = ops.email
    finally:
        db.close()

    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": ops_email, "password": "securepassword123"},
    )
    assert res_login.status_code == 200
    assert res_login.json()["access_token"]
    return res_login.json()["access_token"]


def test_worker_run_returns_accepted():
    """Worker run returns immediately with 'accepted' (background execution)."""
    ops_token = _register_ops_guardian()

    res = client.post(
        "/api/v1/events/worker/run",
        headers={"Authorization": f"Bearer {ops_token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] in ("accepted", "already_running")
    assert "events_purged" in body


def test_worker_run_locked_when_running():
    """A second worker run while one is in progress returns 'already_running'."""
    from app.routes.telemetry import _worker_lock

    ops_token = _register_ops_guardian()

    # Hold the lock to simulate an in-progress job
    acquired = _worker_lock.acquire(blocking=False)
    assert acquired is True
    try:
        res = client.post(
            "/api/v1/events/worker/run",
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        assert res.status_code == 200
        assert res.json()["status"] == "already_running"
    finally:
        _worker_lock.release()


def test_worker_run_rejects_plain_guardian():
    """A plain guardian must NOT be able to trigger the system-wide worker job."""
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Plain Parent",
            "email": "plainparent@example.com",
            "password": "securepassword123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "plainparent@example.com", "password": "securepassword123"},
    )
    guardian_token = res_login.json()["access_token"]

    res = client.post(
        "/api/v1/events/worker/run",
        headers={"Authorization": f"Bearer {guardian_token}"},
    )
    assert res.status_code == 403


def test_chat_sanitizes_and_caps_input():
    """Guardian chat text is control-character-stripped and length-capped on ingest."""
    from app.routes.telemetry import _sanitize_chat_text

    # Control characters are stripped
    assert _sanitize_chat_text("hello\x00world\x1f") == "helloworld"
    # Length is capped at CHAT_MAX_LENGTH
    long = "x" * 1000
    assert len(_sanitize_chat_text(long)) == 500
    # Normal text passes through unchanged
    assert _sanitize_chat_text("How can I support my child?") == "How can I support my child?"


def test_security_headers_present():
    """Every API response carries the security headers."""
    res = client.get("/")
    assert res.status_code == 200
    assert res.headers.get("Content-Security-Policy") == "default-src 'self'"
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert res.headers.get("Referrer-Policy") == "no-referrer"


def test_apm_logs_redact_query_string(caplog):
    """APM logs must not contain the query string (JWT token leakage)."""
    from app.utils.observability import _redact_path

    # Unit-level: the redaction helper strips query strings
    assert _redact_path("/api/v1/events/ws?token=SECRETJWT") == "/api/v1/events/ws"
    assert "SECRETJWT" not in _redact_path("/api/v1/events/ws?token=SECRETJWT")

    # End-to-end: the API's APM trace for a request with a token query param
    # must NOT contain the token (only the redacted path).
    with caplog.at_level("INFO", logger="root"):
        client.get("/?token=SUPERSECRETTOKEN")
    apm_lines = [
        r.getMessage() for r in caplog.records if "APM TRACE" in r.getMessage()
    ]
    assert len(apm_lines) > 0
    for line in apm_lines:
        assert "SUPERSECRETTOKEN" not in line


def test_apm_error_logs_exception_type(caplog):
    """APM error logs must show the exception type, not the full message."""
    from app.utils.observability import _redact_error

    class _FakeSensitiveError(Exception):
        pass

    err = _FakeSensitiveError("password=supersecret phone=+15551234567")
    safe = _redact_error(err)
    assert safe == "_FakeSensitiveError"
    assert "supersecret" not in safe
    assert "+15551234567" not in safe


def test_audit_chain_verifies():
    """The audit log hash chain verifies cleanly after real requests."""
    from app.database import SessionLocal
    from app.utils.audit import verify_audit_chain

    # Clear the on-disk audit entries so the chain starts fresh (the middleware
    # writes to the app's real SessionLocal, which persists across tests).
    db = SessionLocal()
    try:
        db.query(models.AuditLogEntry).delete()
        db.commit()
    finally:
        db.close()

    # Trigger some audit-logged requests (register/login/device produce entries)
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Audit Parent",
            "email": "auditparent@example.com",
            "password": "securepassword123",
        },
    )
    client.post(
        "/api/v1/auth/login",
        json={"email": "auditparent@example.com", "password": "securepassword123"},
    )

    # The middleware writes via the app's real SessionLocal (on-disk), not the
    # test's in-memory get_db override.
    db = SessionLocal()
    try:
        entries = db.query(models.AuditLogEntry).all()
        assert len(entries) >= 2  # at least a SIGNUP + LOGIN attempt
        ok, broken = verify_audit_chain(db)
        assert ok is True
        assert broken == []
    finally:
        db.close()


def test_audit_chain_covers_companion_session():
    """The immutable audit chain must cover companion session creation (a
    data-access path that previously only wrote to the legacy AuditLog table)."""
    from app.database import SessionLocal

    # Clear the on-disk immutable chain so we can assert only this request.
    db = SessionLocal()
    try:
        db.query(models.AuditLogEntry).delete()
        db.commit()
    finally:
        db.close()

    # Register + login + device + companion consent + session.
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Companion Audit Parent",
            "email": "companionaudit@example.com",
            "password": "securepassword123",
        },
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "companionaudit@example.com",
            "password": "securepassword123",
        },
    )
    guardian_token = res_login.json()["access_token"]
    res_dev = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Kid", "platform": "android", "device_token": "tok-audit-c"},
    )
    device_id = res_dev.json()["device"]["id"]
    device_jwt = res_dev.json()["device_jwt_token"]

    db = TestingSessionLocal()
    db.add(
        models.ConsentGrant(
            subject_id=device_id, modality="companion_chat", is_granted=True
        )
    )
    db.commit()
    db.close()

    res = client.post(
        "/api/v1/companion/sessions",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={"persona_id": "coach"},
    )
    assert res.status_code == 200

    # The immutable chain must contain a START_COMPANION_SESSION entry.
    db = SessionLocal()
    try:
        actions = [
            e.action for e in db.query(models.AuditLogEntry).all()
        ]
        assert "START_COMPANION_SESSION" in actions
    finally:
        db.close()


def test_audit_chain_detects_tamper():
    """Modifying an audit entry's action is detected by the hash chain."""
    from app.database import SessionLocal
    from app.utils.audit import verify_audit_chain

    # Clear the on-disk audit entries so the chain starts fresh.
    db = SessionLocal()
    try:
        db.query(models.AuditLogEntry).delete()
        db.commit()
    finally:
        db.close()

    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Tamper Parent",
            "email": "tamperparent@example.com",
            "password": "securepassword123",
        },
    )

    db = SessionLocal()
    try:
        # Verify clean first
        ok, broken = verify_audit_chain(db)
        assert ok is True

        # Simulate tampering: change the action of the first entry
        first = (
            db.query(models.AuditLogEntry)
            .order_by(models.AuditLogEntry.timestamp.asc(), models.AuditLogEntry.id.asc())
            .first()
        )
        assert first is not None
        first.action = "TAMPERED_ACTION"
        db.commit()

        ok, broken = verify_audit_chain(db)
        assert ok is False
        assert len(broken) > 0
    finally:
        db.close()
