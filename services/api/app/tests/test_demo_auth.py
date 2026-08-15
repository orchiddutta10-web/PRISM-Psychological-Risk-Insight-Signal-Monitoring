from fastapi.testclient import TestClient

from app import models
from app.demo_simulation_engine import ensure_demo_guardian
from app.main import app
from app.tests.conftest import TestingSessionLocal
from app.utils.auth import get_password_hash, verify_password


client = TestClient(app)


def test_demo_guardian_is_created_and_login_works():
    db = TestingSessionLocal()
    try:
        for index in range(4):
            db.add(
                models.Guardian(
                    full_name=f"Existing Guardian {index}",
                    email=f"existing-{index}@example.com",
                    password_hash=get_password_hash("password123"),
                    role="guardian",
                )
            )
        db.commit()

        guardian = ensure_demo_guardian(db)
        db.commit()

        assert guardian.email == "dev@example.com"
        assert verify_password("password", guardian.password_hash)
        assert db.query(models.Guardian).filter_by(email="dev@example.com").count() == 1
    finally:
        db.close()

    response = client.post(
        "/api/v1/auth/login",
        json={"email": " DEV@EXAMPLE.COM ", "password": "password"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["mfa_required"] is False
    assert payload["access_token"]
    assert payload["user"]["email"] == "dev@example.com"


def test_demo_guardian_stale_password_is_repaired_and_seeding_is_idempotent():
    db = TestingSessionLocal()
    try:
        stale = models.Guardian(
            full_name="Dev User",
            email="dev@example.com",
            password_hash=get_password_hash("different-password"),
            role="guardian",
        )
        db.add(stale)
        db.commit()

        first = ensure_demo_guardian(db)
        db.commit()
        second = ensure_demo_guardian(db)
        db.commit()

        assert first.id == second.id
        assert verify_password("password", second.password_hash)
        assert db.query(models.Guardian).filter_by(email="dev@example.com").count() == 1
    finally:
        db.close()
