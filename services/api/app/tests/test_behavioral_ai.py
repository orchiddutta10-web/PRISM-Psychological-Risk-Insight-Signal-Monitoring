"""
Tests for the Behavioral AI Model (Module 3): screening pipeline + API.

Hermetic strategy: like test_medical.py, we patch the behavioral_ai model
layer with canned responses so tests run without the trained .joblib
artifacts. The route layer (authz, RBAC, response shape) and the
risk-engine wiring (RiskScore persistence, alert aggregation) are what's
under test.
"""

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.database import get_db
from app import models

# Shared in-memory SQLite engine/session (defined once in conftest.py).
from app.tests.conftest import TestingSessionLocal, override_get_db  # noqa: F401

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

STRESSED_SIGNAL = {
    "delay_index": 1.9,
    "iki_mean": 380,
    "iki_std": 190,
    "correction_rate_variance": 0.31,
    "burst_length": 4,
    "typing_speed": 22,
    "error_rate": 0.24,
    "session_duration": 300,
    "hour_of_day": 22,
}

CALM_SIGNAL = {
    "delay_index": 1.0,
    "iki_mean": 250,
    "iki_std": 45,
    "correction_rate_variance": 0.04,
    "burst_length": 14,
    "typing_speed": 55,
    "error_rate": 0.03,
    "session_duration": 90,
    "hour_of_day": 14,
}

# Canned evaluate_signal output — mirrors the trained-model behavior.
SIGNAL_RESULT_STRESSED = {
    "stress": {
        "score": 1.0,
        "flagged": True,
        "threshold": 0.6,
        "factors": ["Stress signal elevated (100%)."],
    },
    "cognitive_load": {
        "score": 0.66,
        "flagged": True,
        "threshold": 0.6,
        "factors": ["Cognitive load signal elevated (66%)."],
    },
    "typing_fatigue": {
        "score": 0.25,
        "flagged": False,
        "threshold": 0.6,
        "factors": [],
    },
    "typing_stability": {
        "score": 0.27,
        "flagged": True,
        "threshold": 0.6,
        "factors": ["Typing stability dropped."],
    },
}
SIGNAL_RESULT_CALM = {
    "stress": {"score": 0.0, "flagged": False, "threshold": 0.6, "factors": []},
    "cognitive_load": {
        "score": 0.16,
        "flagged": False,
        "threshold": 0.6,
        "factors": [],
    },
    "typing_fatigue": {
        "score": 0.16,
        "flagged": False,
        "threshold": 0.6,
        "factors": [],
    },
    "typing_stability": {
        "score": 0.58,
        "flagged": False,
        "threshold": 0.6,
        "factors": [],
    },
}

TREND_RESULT_STRESSED = {
    "anxiety_trend": 0.9,
    "depression_trend": 0.1,
    "mental_risk_score": 0.7,
    "confidence": 0.9,
    "flagged": True,
    "factors": [
        "Behavioral pattern consistent across 8 sessions.",
        "Behavioral screening signal, not a diagnosis.",
    ],
}
TREND_RESULT_CALM = {
    "anxiety_trend": 0.0,
    "depression_trend": 0.0,
    "mental_risk_score": 0.2,
    "confidence": 0.9,
    "flagged": False,
    "factors": [],
}


def _register(email: str, role: str = "guardian"):
    """Register guardian + device, returns (guardian_token, device_id, device_jwt)."""
    r = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Test Guardian",
            "email": email,
            "password": "password123",
            "role": role,
        },
    )
    assert r.status_code == 201
    r = client.post(
        "/api/v1/auth/login", json={"email": email, "password": "password123"}
    )
    token = r.json()["access_token"]
    r = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Child", "platform": "android", "device_token": "tok"},
    )
    return token, r.json()["device"]["id"], r.json()["device_jwt_token"]


# ─── evaluate_signal / evaluate_trend unit behavior ─────────────────────────


def test_behavioral_signal_persists_all_dimensions():
    """A typing event persists 5 RiskScores (4 dims + mental risk)."""
    with patch(
        "app.utils.behavioral_ai.evaluate_signal", return_value=SIGNAL_RESULT_STRESSED
    ), patch(
        "app.utils.behavioral_ai.evaluate_trend", return_value=TREND_RESULT_STRESSED
    ):
        from app.utils.ml_engine import evaluate_behavioral_ai_model

        db = TestingSessionLocal()
        _, device_id, _ = _register("beh1@example.com")
        scores = evaluate_behavioral_ai_model(device_id, STRESSED_SIGNAL, db)
        db.close()

    names = {s.model_name for s in scores}
    assert names == {
        "behavioral_stress",
        "behavioral_cognitive_load",
        "behavioral_typing_fatigue",
        "behavioral_typing_stability",
        "behavioral_mental_risk",
    }
    mental = next(s for s in scores if s.model_name == "behavioral_mental_risk")
    assert mental.score == 0.7
    assert mental.flagged is True
    assert any("not a diagnosis" in f for f in mental.contributing_factors)


def test_behavioral_signal_calm_not_flagged():
    """A calm typing event produces no flagged signal scores."""
    with patch(
        "app.utils.behavioral_ai.evaluate_signal", return_value=SIGNAL_RESULT_CALM
    ), patch("app.utils.behavioral_ai.evaluate_trend", return_value=TREND_RESULT_CALM):
        from app.utils.ml_engine import evaluate_behavioral_ai_model

        db = TestingSessionLocal()
        _, device_id, _ = _register("beh2@example.com")
        scores = evaluate_behavioral_ai_model(device_id, CALM_SIGNAL, db)
        db.close()

    assert all(s.flagged is False for s in scores)
    assert all(s.score < 0.6 for s in scores)


# ─── Risk engine integration ────────────────────────────────────────────────


def test_risk_engine_runs_behavioral_on_typing():
    """run_risk_engine('typing') invokes the behavioral model (no crash)."""
    from app.utils import behavioral_ai

    _, device_id, device_jwt = _register("beh3@example.com")
    # Register + consent typing first (the ingest route enforces consent).
    r = client.post(
        "/api/v1/consent",
        headers={"Authorization": f"Bearer {device_jwt}"},
        json={"signal_type": "typing", "granted": True, "consent_copy_version": "1.0"},
    )
    assert r.status_code in (200, 201)

    with patch.object(
        behavioral_ai, "evaluate_signal", return_value=SIGNAL_RESULT_CALM
    ), patch.object(behavioral_ai, "evaluate_trend", return_value=TREND_RESULT_CALM):
        r = client.post(
            "/api/v1/events/ingest",
            headers={"Authorization": f"Bearer {device_jwt}"},
            json={
                "device_id": device_id,
                "signal_type": "typing",
                "metadata": CALM_SIGNAL,
            },
        )
    assert r.status_code == 200

    # Behavioral risk scores were persisted.
    db = TestingSessionLocal()
    count = (
        db.query(models.RiskScore)
        .filter(
            models.RiskScore.device_id == device_id,
            models.RiskScore.model_name.like("behavioral_%"),
        )
        .count()
    )
    db.close()
    assert count == 5


# ─── API endpoint (authz + response shape) ──────────────────────────────────


def test_behavioral_insights_requires_guardian_auth():
    r = client.get("/api/v1/events/typing/behavioral/some-device")
    assert r.status_code == 401


def test_behavioral_insights_authz_cross_guardian_403():
    _, dev_a, _ = _register("beh7a@example.com")
    token_b, _, _ = _register("beh7b@example.com")
    r = client.get(
        f"/api/v1/events/typing/behavioral/{dev_a}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert r.status_code == 403


def test_behavioral_insights_returns_dimensions():
    token, device_id, _ = _register("beh8@example.com")

    # Seed a behavioral mental-risk score directly (matches test_api pattern).
    db = TestingSessionLocal()
    score = models.RiskScore(
        device_id=device_id,
        model_name="behavioral_mental_risk",
        score=0.72,
        threshold=0.6,
        flagged=True,
    )
    score.contributing_factors = [
        "Behavioral pattern consistent across 8 sessions.",
        "Behavioral screening signal, not a diagnosis.",
    ]
    db.add(score)
    db.commit()
    db.close()

    r = client.get(
        f"/api/v1/events/typing/behavioral/{device_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["device_id"] == device_id
    dims = {d["name"] for d in body["dimensions"]}
    assert dims == {
        "stress",
        "cognitive_load",
        "typing_fatigue",
        "typing_stability",
        "mental_risk",
    }
    mental = next(d for d in body["dimensions"] if d["name"] == "mental_risk")
    assert mental["score"] == 0.72
    assert mental["flagged"] is True
    assert "not a diagnosis" in body["disclaimer"]


# ─── Module 4: Explainable AI ───────────────────────────────────────────────


def test_feature_importance_shape():
    """Global feature importance returns all 9 features, sorted descending, summing to 1."""
    from app.utils.behavioral_ai import feature_importance

    imp = feature_importance("stress")
    assert len(imp) == 9
    # Sorted descending by importance.
    assert all(imp[i]["importance"] >= imp[i + 1]["importance"] for i in range(len(imp) - 1))
    assert abs(sum(x["importance"] for x in imp) - 1.0) < 1e-3
    assert all(x["feature"] in {"delay_index", "iki_mean", "iki_std", "correction_rate_variance",
                                "burst_length", "typing_speed", "error_rate", "session_duration",
                                "hour_of_day"} for x in imp)


def test_local_attribution_signed_and_sorted():
    """Local SHAP-style attribution is signed, sorted, and has the expected shape."""
    from app.utils.behavioral_ai import local_attribution

    attr = local_attribution(STRESSED_SIGNAL, "stress")
    assert len(attr) == 9
    assert all("feature" in a and "label" in a and "contribution" in a for a in attr)
    assert all(
        abs(attr[i]["contribution"]) >= abs(attr[i + 1]["contribution"])
        for i in range(len(attr) - 1)
    )
    # Stressed signal: risk-raising features should be positive contributors.
    assert attr[0]["contribution"] > 0
    # A calm signal sits at the reference, so its top contribution is near zero.
    calm = local_attribution(CALM_SIGNAL, "stress")
    assert abs(calm[0]["contribution"]) < 0.15


def test_explain_signal_reasoning():
    """explain_signal returns per-dimension reasoning with the Module 4 framing."""
    from app.utils.behavioral_ai import explain_signal

    out = explain_signal(STRESSED_SIGNAL)
    assert set(out.keys()) == {"stress", "cognitive_load", "typing_fatigue", "typing_stability"}
    stress = out["stress"]
    assert stress["score"] > 0.6
    assert stress["flagged"] is True
    assert stress["feature_importance"]
    assert stress["shap_values"]
    assert stress["reasoning"]
    assert "Risk score increased because" in stress["reasoning"][0]

    calm = explain_signal(CALM_SIGNAL)
    assert calm["stress"]["flagged"] is False
    assert "within baseline" in calm["stress"]["reasoning"][0]


def test_explain_trend_reasoning_and_top_features():
    """explain_trend attaches reasoning + top trend features to the trend result."""
    from app.utils.behavioral_ai import explain_trend

    window = [{"stress": 0.85, "cognitive_load": 0.7, "typing_fatigue": 0.3,
               "typing_stability": 0.4}] * 8
    out = explain_trend(window)
    assert out["flagged"] is True
    assert out["mental_risk_score"] > 0.6
    assert any("not a diagnosis" in r for r in out["reasoning"])
    assert out["top_features"]
    assert all(f["feature"].startswith(("stress", "cognitive_load", "typing_fatigue", "typing_stability")) for f in out["top_features"])


def test_explain_trend_empty_window():
    """Empty window degrades gracefully."""
    from app.utils.behavioral_ai import explain_trend

    out = explain_trend([])
    assert out["mental_risk_score"] == 0.0
    assert out["top_features"] == []
    assert "No recent typing sessions" in out["reasoning"][0]
