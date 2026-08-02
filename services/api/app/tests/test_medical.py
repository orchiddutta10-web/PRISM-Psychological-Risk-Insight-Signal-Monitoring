"""
Tests for the Medical AI Healthcare Assistant (RAG chatbot + typing insights).

Hermetic strategy: the LangChain/chromadb stack is optional and NOT installed
in CI for these tests, so we patch app.utils.medical_rag.medical_query and
app.utils.medical_rag.kb_stats with canned responses — the same way conftest
mocks Redis. The route layer (authz, RBAC, crisis gate, response shape) is
what's actually under test here.
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch

from app.main import app
from app.database import get_db
from app import models
from app.config import settings

# Shared in-memory SQLite engine/session (defined once in conftest.py so all
# test files see the same tables instead of fighting over Base.metadata).
from app.tests.conftest import TestingSessionLocal, override_get_db  # noqa: F401

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

# The chat route gates on MEDICAL_RAG_ENABLED, so enable it for these tests
# (the RAG/LLM call itself is patched or short-circuited by the crisis gate).
settings.MEDICAL_RAG_ENABLED = True

CANONICAL_ANSWER = {
    "answer": "A mild fever is usually managed with rest and fluids.",
    "evidence": [
        {
            "source": "who_fever.pdf",
            "page": 2,
            "chunk": "Rest and hydration are the first-line approach for a mild fever.",
            "score": 0.91,
        }
    ],
    "sources": ["who_fever.pdf#page=2"],
    "confidence": 0.91,
    "disclaimer": (
        "This information is for general health education only and is not a "
        "substitute for professional medical advice, diagnosis, or treatment."
    ),
    "crisis": False,
}


def _register_guardian_and_device(email: str, role: str = "guardian"):
    """Register a guardian + device, returns (guardian_token, device_id, device_jwt)."""
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
        "/api/v1/auth/login",
        json={"email": email, "password": "password123"},
    )
    guardian_token = r.json()["access_token"]
    r = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {guardian_token}"},
        json={"name": "Child", "platform": "android", "device_token": "tok"},
    )
    device_id = r.json()["device"]["id"]
    device_jwt = r.json()["device_jwt_token"]
    return guardian_token, device_id, device_jwt


# ─── Medical chat ───────────────────────────────────────────────────────────


def test_medical_chat_requires_guardian_auth():
    """No token → 401 (AGENTS.md: every guardian route requires JWT)."""
    r = client.post("/api/v1/medical/chat", json={"prompt": "What is a fever?"})
    assert r.status_code == 401


def test_medical_chat_returns_answer_evidence_disclaimer():
    """Guardian token → 200 with answer, evidence, sources, confidence, disclaimer."""
    token, _, _ = _register_guardian_and_device("med1@example.com")
    with patch("app.routes.medical.medical_query", return_value=CANONICAL_ANSWER):
        r = client.post(
            "/api/v1/medical/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"prompt": "How should I treat a mild fever?"},
        )
    assert r.status_code == 200
    body = r.json()
    assert "fever" in body["answer"].lower()
    assert len(body["evidence"]) >= 1
    assert body["evidence"][0]["source"] == "who_fever.pdf"
    assert body["sources"] == ["who_fever.pdf#page=2"]
    assert 0 <= body["confidence"] <= 1
    assert "not a substitute for professional medical advice" in body["disclaimer"]
    assert body["crisis"] is False


def test_medical_chat_empty_prompt_400():
    token, _, _ = _register_guardian_and_device("med2@example.com")
    r = client.post(
        "/api/v1/medical/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"prompt": "   "},
    )
    assert r.status_code == 400


def test_medical_chat_disabled_flag_graceful():
    """MEDICAL_RAG_ENABLED=false → graceful 'not enabled' answer, no RAG call."""
    token, _, _ = _register_guardian_and_device("med2b@example.com")
    original = settings.MEDICAL_RAG_ENABLED
    settings.MEDICAL_RAG_ENABLED = False
    try:
        with patch(
            "app.routes.medical.medical_query",
            side_effect=AssertionError("RAG must not run when disabled"),
        ) as mock_query:
            r = client.post(
                "/api/v1/medical/chat",
                headers={"Authorization": f"Bearer {token}"},
                json={"prompt": "What is a fever?"},
            )
        mock_query.assert_not_called()
    finally:
        settings.MEDICAL_RAG_ENABLED = original
    assert r.status_code == 200
    body = r.json()
    assert body["crisis"] is False
    assert "not currently enabled" in body["answer"]
    assert body["evidence"] == []
    assert body["confidence"] == 0.0


def test_medical_chat_crisis_gate():
    """Crisis prompt returns crisis response with crisis=True, no LLM call."""
    token, _, _ = _register_guardian_and_device("med3@example.com")
    # If the crisis gate fails, medical_query WOULD be called (and fail to
    # import langchain) → the route would 500. So a 200 with crisis=True
    # proves the gate fired before any RAG/LLM path.
    r = client.post(
        "/api/v1/medical/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"prompt": "I want to end it all"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["crisis"] is True
    assert "741741" in body["answer"]


# ─── KB management RBAC ─────────────────────────────────────────────────────


def test_medical_ingest_requires_admin():
    """Non-admin guardian → 403 on ingest."""
    token, _, _ = _register_guardian_and_device("med4@example.com")
    r = client.post(
        "/api/v1/medical/ingest",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


def test_medical_ingest_admin_allowed():
    """guardian-admin → 200 with kb stats."""
    token, _, _ = _register_guardian_and_device("med5@example.com", role="guardian-admin")
    with patch(
        "app.routes.medical.rebuild_kb",
        return_value={"docs": 3, "chunks": 42, "vector_ready": True},
    ):
        r = client.post(
            "/api/v1/medical/ingest",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == 200
    assert r.json()["chunks"] == 42


def test_medical_status_requires_auth():
    r = client.get("/api/v1/medical/status")
    assert r.status_code == 401


def test_medical_status_returns_config():
    token, _, _ = _register_guardian_and_device("med6@example.com")
    with patch(
        "app.routes.medical.kb_stats",
        return_value={"docs": 2, "chunks": 10, "vector_ready": False},
    ):
        r = client.get(
            "/api/v1/medical/status",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == 200
    body = r.json()
    assert "provider" in body
    assert body["docs"] == 2


# ─── Typing insights ────────────────────────────────────────────────────────


def test_typing_insights_requires_guardian_auth():
    r = client.get("/api/v1/events/typing/insights/some-device")
    assert r.status_code == 401


def test_typing_insights_authz_cross_guardian_403():
    """Guardian A cannot read guardian B's device typing insights (403)."""
    _, dev_a, _ = _register_guardian_and_device("med7a@example.com")
    token_b, _, _ = _register_guardian_and_device("med7b@example.com")
    r = client.get(
        f"/api/v1/events/typing/insights/{dev_a}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert r.status_code == 403


def test_typing_insights_returns_scores_and_baseline():
    """A guardian can read their own device's typing insights."""
    token, device_id, device_jwt = _register_guardian_and_device("med8@example.com")

    # Insert a typing risk score + baseline directly (matches test_api pattern)
    db = TestingSessionLocal()
    baseline = models.BaselineProfile(
        device_id=device_id,
        signal_type="typing",
        rolling_mean=0.31,
        rolling_variance=0.0036,
        source="on_device",
    )
    db.add(baseline)
    score = models.RiskScore(
        device_id=device_id,
        model_name="typing_rhythm",
        score=0.6,
        threshold=2.0,
        flagged=True,
    )
    score.contributing_factors = [
        "Typing delay z-score of +2.3 vs personal baseline (mean 0.31, σ 0.06)."
    ]
    db.add(score)
    db.commit()
    db.close()

    r = client.get(
        f"/api/v1/events/typing/insights/{device_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["baseline"]["mean"] == 0.31
    assert len(body["scores"]) == 1
    assert body["scores"][0]["model_name"] == "typing_rhythm"
    assert body["scores"][0]["flagged"] is True
    assert "z-score" in body["scores"][0]["contributing_factors"][0]
