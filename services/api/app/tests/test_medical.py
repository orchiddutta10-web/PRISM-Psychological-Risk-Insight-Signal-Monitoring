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
    assert body["context"] == {}  # no device → no fused context


# ─── Module 5: RAG Context Fusion ───────────────────────────────────────────


def test_medical_chat_fuses_behavioral_context():
    """device_id + history → medical_query receives fused context (patch verifies pass-through)."""
    token, device_id, _ = _register_guardian_and_device("med9@example.com")

    with patch(
        "app.routes.medical.medical_query",
        return_value={**CANONICAL_ANSWER, "context": {"behavioral": {"stress": {"score": 0.85}}}},
    ) as mock_query:
        r = client.post(
            "/api/v1/medical/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "prompt": "My child feels tired",
                "device_id": device_id,
                "history": [{"role": "user", "utterance": "My child feels tired"}],
            },
        )
    assert r.status_code == 200
    # medical_query was called with the device_id + history (context fusion inputs).
    assert mock_query.call_args.kwargs["device_id"] == device_id
    assert mock_query.call_args.kwargs["history"] == [
        {"role": "user", "utterance": "My child feels tired"}
    ]
    assert mock_query.call_args.kwargs["db"] is not None
    # The response carries the fused context back to the dashboard.
    assert r.json()["context"]["behavioral"]["stress"]["score"] == 0.85


def test_medical_chat_fusion_cross_guardian_403():
    """Guardian B cannot fuse guardian A's device context (403)."""
    _, dev_a, _ = _register_guardian_and_device("med9a@example.com")
    token_b, _, _ = _register_guardian_and_device("med9b@example.com")
    r = client.post(
        "/api/v1/medical/chat",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"prompt": "How is my child?", "device_id": dev_a},
    )
    assert r.status_code == 403


# ─── Module 9: AI pipeline — session persistence ────────────────────────────


def test_medical_chat_stores_session_turns():
    """The chat route persists guardian + assistant turns to chat_messages."""
    token, _, _ = _register_guardian_and_device("med12@example.com")
    with patch("app.routes.medical.medical_query", return_value=CANONICAL_ANSWER):
        r = client.post(
            "/api/v1/medical/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"prompt": "What is a fever?"},
        )
    assert r.status_code == 200

    db = TestingSessionLocal()
    turns = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.sender.in_(["guardian", "aria"]))
        .all()
    )
    db.close()
    senders = {t.sender for t in turns}
    assert senders == {"guardian", "aria"}
    guardian_turn = next(t for t in turns if t.sender == "guardian")
    assert "fever" in guardian_turn.aria_utterance.lower()


def test_medical_chat_empty_prompt_400():
    token, _, _ = _register_guardian_and_device("med2@example.com")
    r = client.post(
        "/api/v1/medical/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"prompt": "   "},
    )
    assert r.status_code == 400


def test_medical_chat_disabled_flag_still_answers():
    """Even with MEDICAL_RAG_ENABLED=false the chatbot answers via the
    retrieval-based fallback engine (no LLM required) — it never refuses."""
    token, _, _ = _register_guardian_and_device("med2b@example.com")
    original = settings.MEDICAL_RAG_ENABLED
    settings.MEDICAL_RAG_ENABLED = False
    try:
        with patch(
            "app.routes.medical.medical_query",
            return_value={
                **CANONICAL_ANSWER,
                "answer": "Here's what the medical library says about fever.",
            },
        ) as mock_query:
            r = client.post(
                "/api/v1/medical/chat",
                headers={"Authorization": f"Bearer {token}"},
                json={"prompt": "What is a fever?"},
            )
        # The route now always calls medical_query (the fallback engine runs
        # inside it), so this is called regardless of the RAG flag.
        mock_query.assert_called_once()
    finally:
        settings.MEDICAL_RAG_ENABLED = original
    assert r.status_code == 200
    body = r.json()
    assert body["crisis"] is False
    assert "medical library" in body["answer"]
    assert len(body["evidence"]) >= 1


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


# ─── Module 8: Multi-format knowledge base ──────────────────────────────────


def test_markdown_extractor_cleans_links_and_headers():
    """Markdown extraction strips links/fences and keeps clean section text."""
    import os
    import tempfile
    from app.utils.medical_rag import _extract_markdown

    fd, path = tempfile.mkstemp(suffix=".md")
    os.close(fd)
    with open(path, "w", encoding="utf-8") as f:
        f.write("# Headache Management\n\n## Red flags\n\n[Read more](https://example.com) about migraine.\n\n- Sudden severe pain\n")
    try:
        pages = _extract_markdown(path)
        assert len(pages) == 1
        text = pages[0][0]
        assert "Headache Management" in text
        assert "Read more" in text  # link text preserved, URL stripped
        assert "https://example.com" not in text
        assert "migraine" in text
    finally:
        os.remove(path)


def test_docx_extractor_reads_paragraphs():
    """DOCX extraction reads paragraph text via stdlib zipfile."""
    import os
    import tempfile
    import zipfile
    from xml.sax.saxutils import escape
    from app.utils.medical_rag import _extract_docx

    fd, path = tempfile.mkstemp(suffix=".docx")
    os.close(fd)
    doc_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body>"
        + "".join(
            f'<w:p><w:r><w:t>{escape(f"Paragraph {i} about fever management.")}</w:t></w:r></w:p>'
            for i in range(30)
        )
        + "</w:body></w:document>"
    )
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("word/document.xml", doc_xml)
    try:
        pages = _extract_docx(path)
        assert len(pages) >= 1
        assert pages[0][1].endswith(".docx")
        assert "Paragraph 0" in pages[0][0]
        assert "Paragraph 5" in pages[0][0]  # multiple paragraphs grouped
    finally:
        os.remove(path)


def test_kb_upload_rejects_unsupported_format():
    """Uploading a .exe returns 400; PDF/DOCX/MD/TXT are accepted."""
    token, _, _ = _register_guardian_and_device("med10@example.com", role="guardian-admin")
    with patch("app.routes.medical.rebuild_kb", return_value={"docs": 1, "chunks": 5, "vector_ready": True}):
        r = client.post(
            "/api/v1/medical/kb/upload",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("malware.exe", b"MZ...", "application/octet-stream")},
        )
    assert r.status_code == 400
    assert "Unsupported format" in r.json()["detail"]


def test_kb_upload_accepts_markdown():
    """A .md file uploads and triggers a rebuild."""
    token, _, _ = _register_guardian_and_device("med11@example.com", role="guardian-admin")
    with patch("app.routes.medical.rebuild_kb", return_value={"docs": 1, "chunks": 5, "vector_ready": True}) as mock:
        r = client.post(
            "/api/v1/medical/kb/upload",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("guideline.md", b"# Guideline\n\nContent", "text/markdown")},
        )
    assert r.status_code == 200
    mock.assert_called_once()


# ─── Intent detection + relevance gate ──────────────────────────────────────


def test_greeting_gets_conversational_reply():
    """'hi' returns a conversational reply, not a KB dump."""
    from app.utils.medical_rag import _is_greeting, _GREETING_REPLY

    assert _is_greeting("hi")
    assert _is_greeting("hello there")
    assert _is_greeting("How are you?")
    assert not _is_greeting("What should I do for a fever?")
    assert "medical assistant" in _GREETING_REPLY


def test_off_topic_query_blocked():
    """Non-medical queries do not dump irrelevant library chunks."""
    from app.utils.medical_rag import _is_relevant

    # A stub retrieval whose chunks share only stopwords with the query.
    stub = [
        {"chunk": "The document covers general guidance and care instructions.", "source": "x", "page": 1}
    ]
    assert _is_relevant("what is the capital of france", stub) is False
    assert _is_relevant("tell me a joke", stub) is False
    # A real health term that appears in the chunk passes.
    assert _is_relevant("fever management", [{"chunk": "fever is managed with rest", "source": "x", "page": 1}]) is True
