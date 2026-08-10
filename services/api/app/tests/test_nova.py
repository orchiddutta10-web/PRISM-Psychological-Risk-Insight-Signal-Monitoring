from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import httpx

from fastapi.testclient import TestClient

from app.config import settings
from app.services.nova_ai_service import NovaTurn, _build_prompt, generate_response

from app import models
from app.tests.conftest import TestingSessionLocal
from app.main import app

client = TestClient(app)


def test_nova_context_includes_owned_v2_risk_and_excludes_other_guardian():
    token, device_id = _setup_guardian()
    db = TestingSessionLocal()
    now = datetime.now(timezone.utc)
    owned_window = models.BehaviorWindow(
        subject_id=device_id,
        start_ts=now - timedelta(hours=24),
        end_ts=now,
        total_active_mins=120,
        sleep_hours_proxy=7,
    )
    owned_risk = models.RiskScoreV2(
        window=owned_window,
        score_value=72,
        risk_level="HIGH",
    )
    owned_risk.contributing_factors = ["sleep disruption", "reduced routine stability"]
    db.add_all([owned_window, owned_risk])
    db.commit()
    db.close()

    other_token, other_device_id = _setup_guardian(
        email="other-nova@example.com", device_token="other-nova-tok"
    )
    db = TestingSessionLocal()
    other_window = models.BehaviorWindow(
        subject_id=other_device_id,
        start_ts=now - timedelta(hours=24),
        end_ts=now,
        total_active_mins=40,
        sleep_hours_proxy=3,
    )
    other_risk = models.RiskScoreV2(
        window=other_window,
        score_value=99,
        risk_level="HIGH",
    )
    other_risk.contributing_factors = ["other guardian data"]
    db.add_all([other_window, other_risk])
    db.commit()
    db.close()

    captured = {}

    def fake_generate(history, context=None, persona_id="listener"):
        captured["context"] = context
        return "Report from authorized PRISM data."

    with patch("app.routes.companion.generate_response", side_effect=fake_generate):
        response = client.post(
            "/api/v1/nova/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"message": "Synthesize risk report"},
        )

    assert response.status_code == 200
    assert "score=72" in captured["context"]
    assert "sleep disruption" in captured["context"]
    assert "other guardian data" not in captured["context"]
    assert other_token != token


def test_nova_provider_uses_configured_gemini_model():
    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        return httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": "Live."}]}}]},
            request=httpx.Request("POST", url),
        )

    with patch.object(settings, "GEMINI_API_KEY", "configured-for-test"), patch.object(
        settings, "GEMINI_MODEL", "gemini-test-flash"
    ), patch("app.services.nova_ai_service.httpx.post", side_effect=fake_post):
        response = generate_response([NovaTurn(role="user", content="Hello")])

    assert response == "Live."
    assert "/models/gemini-test-flash:generateContent" in captured["url"]


def test_nova_prompt_includes_selected_persona_and_context():
    prompt = _build_prompt(
        [NovaTurn(role="user", content="How can I sleep better?")],
        "Recent sleep windows: confidence=0.9",
        "coach",
    )
    assert "ACTIVE NOVA PERSONA: The Direct Coach" in prompt
    assert "AUTHORIZED PRISM CONTEXT:" in prompt
    assert "Recent sleep windows: confidence=0.9" in prompt
    assert "PRISM observations" in prompt
    assert "General guidance" in prompt
    assert "Never invent" in prompt


def _setup_guardian(email="nova@example.com", device_token="nova-tok"):
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "NOVA Tester",
            "email": email,
            "password": "password123",
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "password123"},
    )
    token = login.json()["access_token"]
    device = client.post(
        "/api/v1/auth/device",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "NOVA Device", "platform": "android", "device_token": device_token},
    )
    return token, device.json()["device"]["id"]


def test_nova_new_existing_conversation_and_history():
    token, _ = _setup_guardian()
    headers = {"Authorization": f"Bearer {token}"}
    calls = []

    def fake_generate(history, context=None, persona_id="listener"):
        calls.append((history, context, persona_id))
        return "I hear that. How long has it been affecting your sleep?"

    with patch("app.routes.companion.generate_response", side_effect=fake_generate):
        first = client.post("/api/v1/nova/chat", headers=headers, json={"message": "I have been sleeping badly."})
        assert first.status_code == 200
        conversation_id = first.json()["conversation_id"]
        second = client.post(
            "/api/v1/nova/chat",
            headers=headers,
            json={"conversation_id": conversation_id, "message": "For two weeks."},
        )

    assert second.status_code == 200
    assert len(calls) == 2
    assert any(turn.content == "I have been sleeping badly." for turn in calls[1][0])
    assert calls[0][2] == "listener"
    assert calls[1][2] == "listener"
    history = client.get(f"/api/v1/nova/conversations/{conversation_id}", headers=headers)
    assert history.status_code == 200
    assert len(history.json()["messages"]) == 4


def test_nova_creates_web_companion_for_guardian_without_device():
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "NOVA Web Tester",
            "email": "nova-web@example.com",
            "password": "password123",
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "nova-web@example.com", "password": "password123"},
    )
    token = login.json()["access_token"]
    with patch("app.routes.companion.generate_response", return_value="Hello from NOVA"):
        response = client.post(
            "/api/v1/nova/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"message": "Hello", "persona_id": "coach"},
        )
    assert response.status_code == 200
    assert response.json()["message"]["content"] == "Hello from NOVA"


def test_nova_rejects_empty_and_unauthorized():
    token, _ = _setup_guardian()
    headers = {"Authorization": f"Bearer {token}"}
    empty = client.post("/api/v1/nova/chat", headers=headers, json={"message": "   "})
    assert empty.status_code == 422
    missing_auth = client.post("/api/v1/nova/chat", json={"message": "Hello NOVA"})
    assert missing_auth.status_code == 401
    missing_conversation = client.get("/api/v1/nova/conversations/not-owned", headers=headers)
    assert missing_conversation.status_code in (404, 422)


def test_nova_provider_failure_does_not_persist_user_message():
    token, device_id = _setup_guardian()
    headers = {"Authorization": f"Bearer {token}"}
    with patch(
        "app.routes.companion.generate_response",
        side_effect=RuntimeError("provider unavailable"),
    ):
        response = client.post("/api/v1/nova/chat", headers=headers, json={"message": "Hello NOVA"})
    assert response.status_code == 502
    db = TestingSessionLocal()
    assert db.query(models.ConversationMemory).filter_by(subject_id=device_id).count() == 0
    db.close()


def test_nova_crisis_bypasses_provider():
    token, _ = _setup_guardian()
    with patch("app.routes.companion.generate_response") as generate:
        response = client.post(
            "/api/v1/nova/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"message": "I don't want to live anymore"},
        )
    assert response.status_code == 200
    assert response.json()["crisis_flag"] is True
    generate.assert_not_called()


def test_nova_provider_retries_transient_503_with_bounded_backoff():
    responses = [
        httpx.Response(503, json={"error": {"message": "temporarily unavailable"}}),
        httpx.Response(200, json={
            "candidates": [{"content": {"parts": [{"text": "Recovered."}]}}],
            "usageMetadata": {
                "promptTokenCount": 20,
                "candidatesTokenCount": 4,
                "totalTokenCount": 24,
            },
        }),
    ]
    with patch.object(settings, "GEMINI_API_KEY", "configured-for-test"), patch.object(
        settings, "NOVA_AI_MAX_ATTEMPTS", 3
    ), patch.object(settings, "NOVA_AI_BACKOFF_INITIAL_SECONDS", 1), patch.object(
        settings, "NOVA_AI_BACKOFF_MAX_SECONDS", 8
    ), patch("app.services.nova_ai_service.httpx.post", side_effect=responses), patch(
        "app.services.nova_ai_service.random.random", return_value=0.5
    ), patch("app.services.nova_ai_service.time.sleep") as sleep:
        assert generate_response([NovaTurn(role="user", content="Hello")]) == "Recovered."

    assert sleep.call_args.args == (1.0,)


def test_nova_provider_does_not_retry_billing_quota_exhaustion():
    response = httpx.Response(
        429,
        json={
            "error": {
                "code": 429,
                "status": "RESOURCE_EXHAUSTED",
                "message": "You exceeded your current quota, please check your plan and billing details.",
                "details": [{"@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": "QUOTA_EXHAUSTED"}],
            }
        },
        request=httpx.Request("POST", "https://example.test"),
    )
    with patch.object(settings, "GEMINI_API_KEY", "configured-for-test"), patch(
        "app.services.nova_ai_service.httpx.post", return_value=response
    ) as post, patch("app.services.nova_ai_service.time.sleep") as sleep:
        try:
            generate_response([NovaTurn(role="user", content="Hello")])
        except Exception as exc:
            assert type(exc).__name__ == "NovaProviderError"
        else:
            assert False, "expected NovaProviderError"

    post.assert_called_once()
    sleep.assert_not_called()


def test_nova_provider_honors_retry_after_for_transient_429():
    responses = [
        httpx.Response(
            429,
            headers={"Retry-After": "2"},
            json={"error": {"message": "rate limit exceeded"}},
            request=httpx.Request("POST", "https://example.test"),
        ),
        httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": "Ready."}]}}]},
            request=httpx.Request("POST", "https://example.test"),
        ),
    ]
    with patch.object(settings, "GEMINI_API_KEY", "configured-for-test"), patch(
        "app.services.nova_ai_service.httpx.post", side_effect=responses
    ), patch("app.services.nova_ai_service.random.random", return_value=0.5), patch(
        "app.services.nova_ai_service.time.sleep"
    ) as sleep:
        assert generate_response([NovaTurn(role="user", content="Hello")]) == "Ready."

    assert sleep.call_args.args == (2.0,)
