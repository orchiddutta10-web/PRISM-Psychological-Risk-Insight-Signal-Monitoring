"""
Tests for Module 6: Long-Term Behaviour Tracking.

Covers the TrendSnapshot aggregation (period bucketing, wellness composite,
idempotent upsert) and the /trends endpoint (authz, RBAC, response shape).
Uses the shared in-memory SQLite engine from conftest.
"""
from fastapi.testclient import TestClient
from datetime import datetime, timedelta, timezone

from app.main import app
from app.database import get_db
from app import models

from app.tests.conftest import TestingSessionLocal, override_get_db  # noqa: F401

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def _register(email: str):
    """Register guardian + device, returns (token, device_id)."""
    r = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Test Guardian", "email": email,
              "password": "password123", "role": "guardian"},
    )
    assert r.status_code == 201
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = r.json()["access_token"]
    r = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Child", "platform": "android", "device_token": f"tok-{email}"},
    )
    return token, r.json()["device"]["id"]


def _seed_behavioral_scores(db, device_id: str, days: int = 5, base: float = 0.5):
    """Insert daily behavioral RiskScore rows for the device."""
    now = datetime.now(timezone.utc)
    dims = ["behavioral_stress", "behavioral_cognitive_load",
            "behavioral_typing_fatigue", "behavioral_typing_stability"]
    for d in range(days):
        ts = now - timedelta(days=d)
        for i, dim in enumerate(dims):
            score = models.RiskScore(
                device_id=device_id, model_name=dim,
                score=base + (i * 0.05), threshold=0.6, flagged=False,
                timestamp=ts,
            )
            score.contributing_factors = []
            db.add(score)
    db.commit()


# ─── Aggregation ────────────────────────────────────────────────────────────


def test_compute_snapshots_creates_daily_weekly_monthly():
    """compute_snapshots upserts daily/weekly/monthly rows with wellness composite."""
    from app.utils.tracking import compute_snapshots, get_trends

    _, device_id = _register("trk1@example.com")
    db = TestingSessionLocal()
    _seed_behavioral_scores(db, device_id, days=5, base=0.8)

    count = compute_snapshots(db, device_id)
    db.close()

    assert count >= 3  # at least one daily, one weekly, one monthly

    db = TestingSessionLocal()
    rows = db.query(models.TrendSnapshot).filter(
        models.TrendSnapshot.device_id == device_id
    ).all()
    granularities = {r.granularity for r in rows}
    assert granularities == {"daily", "weekly", "monthly"}
    db.close()

    # Daily snapshot wellness is a weighted composite of the seeded scores.
    db = TestingSessionLocal()
    daily = get_trends(db, device_id, granularity="daily")
    db.close()
    assert daily["granularity"] == "daily"
    assert len(daily["points"]) >= 1
    assert 0 <= daily["points"][0]["wellness"] <= 1
    assert "stress" in daily["points"][0]["scores"]


def test_compute_snapshots_is_idempotent():
    """Running compute_snapshots twice upserts rather than duplicating rows."""
    from app.utils.tracking import compute_snapshots

    _, device_id = _register("trk2@example.com")
    db = TestingSessionLocal()
    _seed_behavioral_scores(db, device_id, days=3)
    compute_snapshots(db, device_id)
    db.close()

    db = TestingSessionLocal()
    count_first = db.query(models.TrendSnapshot).filter(
        models.TrendSnapshot.device_id == device_id
    ).count()
    db.close()

    # Second run must not create new rows (upsert semantics).
    db = TestingSessionLocal()
    compute_snapshots(db, device_id)
    db.close()
    db = TestingSessionLocal()
    count_second = db.query(models.TrendSnapshot).filter(
        models.TrendSnapshot.device_id == device_id
    ).count()
    db.close()

    assert count_first >= 3  # 3 dailies + at least 1 weekly + 1 monthly
    assert count_second == count_first


def test_wellness_composite_direction():
    """Higher stress/load scores push the wellness composite up."""
    from app.utils.tracking import _wellness_from_scores

    calm = _wellness_from_scores(
        {"stress": 0.1, "cognitive_load": 0.1, "typing_fatigue": 0.1, "typing_stability": 0.9}
    )
    stressed = _wellness_from_scores(
        {"stress": 0.9, "cognitive_load": 0.8, "typing_fatigue": 0.6, "typing_stability": 0.2}
    )
    assert calm < 0.3
    assert stressed > 0.6
    assert stressed > calm


# ─── Trends endpoint ────────────────────────────────────────────────────────


def test_trends_requires_guardian_auth():
    r = client.get("/api/v1/events/trends/some-device")
    assert r.status_code == 401


def test_trends_authz_cross_guardian_403():
    _, dev_a = _register("trk3a@example.com")
    token_b, _ = _register("trk3b@example.com")
    r = client.get(
        f"/api/v1/events/trends/{dev_a}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert r.status_code == 403


def test_trends_returns_points_and_trend():
    """Guardian reads their own device's trend snapshots."""
    token, device_id = _register("trk4@example.com")
    db = TestingSessionLocal()
    _seed_behavioral_scores(db, device_id, days=4, base=0.6)
    from app.utils.tracking import compute_snapshots
    compute_snapshots(db, device_id)
    db.close()

    r = client.get(
        f"/api/v1/events/trends/{device_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["device_id"] == device_id
    assert body["granularity"] == "daily"
    assert isinstance(body["points"], list)
    assert len(body["points"]) >= 1
    assert "trend" in body
    assert all("wellness" in p and "scores" in p and "period_start" in p for p in body["points"])


def test_trends_invalid_granularity_400():
    token, device_id = _register("trk5@example.com")
    r = client.get(
        f"/api/v1/events/trends/{device_id}?granularity=hourly",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 400
