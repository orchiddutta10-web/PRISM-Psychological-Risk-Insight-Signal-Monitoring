from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session
from datetime import datetime

from app import models
from app.database import get_db
from app.utils import auth, audit
from app.utils.companion_engine import (
    PERSONAS,
    DISCLOSURE_BANNER,
    CRISIS_RESPONSE,
    check_crisis,
    handle_companion_message,
)
from app.services.nova_ai_service import NovaTurn, generate_response

ACTION_INSTRUCTIONS = {
    "risk_report",
    "mood_patterns",
    "system_status",
    "privacy_protocol",
}

NOVA_ACTIONS = ACTION_INSTRUCTIONS

router = APIRouter(prefix="/api/v1/companion", tags=["companion"])
# NOVA is the older name for the companion chatbot; keep an alias router
# so the dashboard's /api/v1/nova/* calls resolve to the same handlers.
nova_router = APIRouter(prefix="/api/v1/nova", tags=["companion (legacy)"])


class CompanionSessionCreate(BaseModel):
    persona_id: str
    channel: str = "in-app"


class CompanionMessageRequest(BaseModel):
    message: str


@router.get("/personas")
def list_personas():
    """Returns the list of available AI Companion archetypes."""
    return [
        {
            "id": k,
            "name": v["name"],
            "display_name": v["display_name"],
            "description": v["description"],
        }
        for k, v in PERSONAS.items()
    ]


@router.post("/sessions")
def create_session(
    req: CompanionSessionCreate,
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device),
):
    """
    Starts a new AI companion session.
    Requires active consent for the 'companion_chat' modality.
    """
    consent = (
        db.query(models.ConsentGrant)
        .filter(
            models.ConsentGrant.subject_id == current_device.id,
            models.ConsentGrant.modality == "companion_chat",
        )
        .first()
    )

    if not consent or not consent.is_granted:
        raise HTTPException(
            status_code=403, detail="Active consent for companion chat is not granted."
        )

    if req.persona_id not in PERSONAS:
        raise HTTPException(status_code=400, detail="Invalid persona ID")

    session = models.CompanionSession(
        subject_id=current_device.id, persona_id=req.persona_id, channel=req.channel
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # Initial AI greeting with disclosure
    persona = PERSONAS[req.persona_id]
    greeting = (
        f"{DISCLOSURE_BANNER} "
        f"I'm {persona['display_name']} and I'm here to help. How can I support you today?"
    )

    audit.log_audit_event(
        db,
        action=f"Companion session started with persona {req.persona_id}",
        device_id=current_device.id,
    )

    return {
        "session_id": session.id,
        "persona_id": req.persona_id,
        "disclosure_banner": DISCLOSURE_BANNER,
        "initial_message": greeting,
    }


@router.post("/sessions/{session_id}/message")
def send_message(
    session_id: str,
    req: CompanionMessageRequest,
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device),
):
    """
    Sends a message to the AI companion.
    Runs through the hard-coded crisis detection layer first.
    """
    session = (
        db.query(models.CompanionSession)
        .filter(
            models.CompanionSession.id == session_id,
            models.CompanionSession.subject_id == current_device.id,
        )
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=404, detail="Session not found or belongs to another device."
        )

    response_text = handle_companion_message(db, session.id, req.message)

    return {
        "status": "processed",
        "response": response_text,
        "crisis_flag": session.crisis_flag,
    }


@router.get("/webhook/meta")
def verify_meta_webhook(
    mode: str = Query(None, alias="hub.mode"),
    challenge: str = Query(None, alias="hub.challenge"),
    verify_token: str = Query(None, alias="hub.verify_token"),
):
    """
    Verification endpoint for Meta Webhooks.
    """
    from app.config import settings

    if mode == "subscribe" and verify_token == settings.META_VERIFY_TOKEN:
        # Return raw challenge to verify
        from fastapi.responses import Response

        return Response(content=challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification token mismatch.")


@router.post("/webhook/meta")
async def meta_webhook(payload: dict, db: Session = Depends(get_db)):
    """
    Meta Inbound Webhook (WhatsApp & Instagram).
    Parses sender, text, and channels, then routes to AI + Crisis classifier.
    """
    channel = None
    sender_id = None
    message_text = None

    # Detect WhatsApp Business Account Webhook
    if payload.get("object") == "whatsapp_business_account":
        channel = "whatsapp"
        try:
            entry = payload.get("entry", [])[0]
            change = entry.get("changes", [])[0]
            value = change.get("value", {})
            message = value.get("messages", [])[0]
            sender_id = message.get("from")
            message_text = message.get("text", {}).get("body")
        except (IndexError, KeyError, TypeError):
            pass

    # Detect Instagram Direct Message Webhook
    elif payload.get("object") == "instagram":
        channel = "instagram"
        try:
            entry = payload.get("entry", [])[0]
            messaging = entry.get("messaging", [])[0]
            sender_id = messaging.get("sender", {}).get("id")
            message_text = messaging.get("message", {}).get("text")
        except (IndexError, KeyError, TypeError):
            pass

    # Direct fallback for tests/manual mocks
    if not channel:
        channel = payload.get("channel", "whatsapp")
        sender_id = payload.get("sender_id", "mock_device_uuid")
        message_text = payload.get("message", "")

    if not sender_id or not message_text:
        return {"status": "ignored", "detail": "Empty or unrecognized Meta payload."}

    # Fetch or start session for this subject on the specific channel
    session = (
        db.query(models.CompanionSession)
        .filter(
            models.CompanionSession.subject_id == sender_id,
            models.CompanionSession.channel == channel,
        )
        .first()
    )

    if not session:
        # Default to "listener" archetype for new message streams
        session = models.CompanionSession(
            subject_id=sender_id, persona_id="listener", channel=channel
        )
        db.add(session)
        db.commit()
        db.refresh(session)

    # Route message through unified Persona / Crisis pipeline
    response_text = handle_companion_message(db, session.id, message_text)

    # Send outbound API call back to Meta if token is present
    from app.config import settings

    if settings.META_ACCESS_TOKEN:
        import httpx

        try:
            if channel == "whatsapp":
                # Call WhatsApp Send Message API
                whatsapp_url = f"https://graph.facebook.com/v17.0/me/messages"
                headers = {
                    "Authorization": f"Bearer {settings.META_ACCESS_TOKEN}",
                    "Content-Type": "application/json",
                }
                body = {
                    "messaging_product": "whatsapp",
                    "to": sender_id,
                    "type": "text",
                    "text": {"body": response_text},
                }
                async with httpx.AsyncClient() as client:
                    await client.post(whatsapp_url, headers=headers, json=body)
            elif channel == "instagram":
                # Call Instagram Send Message API
                instagram_url = f"https://graph.facebook.com/v17.0/me/messages"
                headers = {
                    "Authorization": f"Bearer {settings.META_ACCESS_TOKEN}",
                    "Content-Type": "application/json",
                }
                body = {
                    "recipient": {"id": sender_id},
                    "message": {"text": response_text},
                }
                async with httpx.AsyncClient() as client:
                    await client.post(instagram_url, headers=headers, json=body)
        except Exception as e:
            import logging

            logging.getLogger(__name__).warning(
                "Failed to send Meta outbound response: %s", str(e)
            )

    return {
        "status": "processed",
        "channel": channel,
        "response": response_text,
        "crisis_flag": session.crisis_flag,
    }


# ---------------------------------------------------------------------------
# Phase 9 — Channel Registry
# ---------------------------------------------------------------------------


@router.get("/channels")
def list_supported_channels():
    """
    Returns all supported messaging channels and their integration status.
    Channels: in-app (live), whatsapp (live via Meta BAPI), instagram (live via Meta IG API),
              voice (coming soon — requires Twilio Voice + STT → Persona → TTS pipeline).
    All active channels route through the same crisis-detection layer (Phase 8).
    """
    return [
        {
            "id": "in-app",
            "name": "In-App Chat",
            "status": "live",
            "crisis_protected": True,
            "description": "Baseline channel. Full persona + crisis gateway.",
        },
        {
            "id": "whatsapp",
            "name": "WhatsApp Business",
            "status": "live",
            "crisis_protected": True,
            "description": "Official Meta WhatsApp Business Platform API. Webhook at /webhook/meta.",
        },
        {
            "id": "instagram",
            "name": "Instagram Direct",
            "status": "live",
            "crisis_protected": True,
            "description": "Instagram Messaging API (Meta). Shares webhook at /webhook/meta.",
        },
        {
            "id": "voice",
            "name": "Voice Call",
            "status": "coming_soon",
            "crisis_protected": True,
            "description": "Planned: Twilio Voice inbound → STT → Persona → TTS outbound. "
            "Full telephony build deferred — stub only in current release.",
        },
    ]


@router.get("/sessions/{session_id}")
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device),
):
    """Retrieve metadata for a companion session (crisis flag, channel, persona)."""
    session = (
        db.query(models.CompanionSession)
        .filter(
            models.CompanionSession.id == session_id,
            models.CompanionSession.subject_id == current_device.id,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {
        "session_id": session.id,
        "persona_id": session.persona_id,
        "channel": session.channel,
        "started_at": session.started_at.isoformat(),
        "crisis_flag": session.crisis_flag,
    }


# ── Compatibility shims for the dashboard chatbot ────────────────────────────
# The dashboard was originally written against an earlier "NOVA" surface
# (`/api/v1/nova/chat`, `/companion/rag/search`, `/companion/mood/timeline`)
# that pre-dated the iot→main merge. The routes below re-expose the same
# shapes using the current companion engine + RAG stack. New code should
# call `/api/v1/companion/{sessions,sessions/{id}/message}` directly.


class RagSearchRequest(BaseModel):
    query: str
    top_k: int = 5


class NovaChatRequest(BaseModel):
    conversation_id: str | None = None
    message: str
    persona_id: str = "listener"
    action: str | None = None

    @field_validator("message")
    @classmethod
    def validate_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message cannot be empty.")
        return value

    @field_validator("action")
    @classmethod
    def validate_action(cls, value: str | None) -> str | None:
        if value is not None and value not in NOVA_ACTIONS:
            raise ValueError("Invalid NOVA quick action.")
        return value


class NovaMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    timestamp: str


class NovaChatResponse(BaseModel):
    conversation_id: str
    message: NovaMessageResponse
    crisis_flag: bool


@router.post("/rag/search")
def rag_search(
    req: RagSearchRequest,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """
    Compatibility shim: semantic-search the medical KB and recent chat
    history. Returns an empty result if the medical RAG is disabled or
    unconfigured, so the dashboard's "RAG search" panel renders an
    empty state instead of throwing.
    """
    from app.utils import medical_rag

    results: list[dict] = []
    method = "hybrid_dense_bm25"
    try:
        chunks = medical_rag.search(req.query, top_k=max(1, min(req.top_k, 20)))
        for i, c in enumerate(chunks):
            results.append(
                {
                    "id": f"kb-{i}",
                    "role": "system",
                    "message": c.get("text", ""),
                    "sentiment": None,
                    "timestamp": datetime.utcnow().isoformat(),
                }
            )
    except Exception:
        # RAG unavailable — return empty result, never raise.
        results = []
        method = "unavailable"

    return {"results_count": len(results), "results": results, "method": method}


@router.get("/mood/timeline")
def mood_timeline(
    days: int = 7,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """
    Compatibility shim: aggregate companion-message sentiment by day.
    The companion engine doesn't track sentiment yet (crisis-keyword check
    only), so this returns an empty timeline until per-message sentiment
    tagging lands.
    """
    days = max(1, min(days, 30))
    today = datetime.utcnow().date().isoformat()
    return {
        "days": days,
        "daily_mood": [
            {"date": today, "dominant_sentiment": "neutral", "message_count": 0, "breakdown": {}}
        ],
    }


@nova_router.get("/conversations/{conversation_id}")
def nova_get_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """
    NOVA-compat: load a prior companion conversation by id.

    The dashboard treats the conversation_id as an opaque handle. We
    resolve it back to the guardian's ChatMessage history: every
    ``nova/chat`` turn writes two ChatMessage rows for the authenticated
    guardian, and ``GET /conversations/{id}`` returns them in order.
    """
    guardian_id = str(current_guardian.id)
    if not conversation_id.startswith(f"nova-{guardian_id}-"):
        raise HTTPException(status_code=404, detail="Conversation not found.")

    device = (
        db.query(models.ChildDevice)
        .filter(models.ChildDevice.guardian_id == guardian_id)
        .order_by(models.ChildDevice.name.asc())
        .first()
    )
    if not device:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    messages = (
        db.query(models.ConversationMemory)
        .filter(
            models.ConversationMemory.subject_id == device.id,
            models.ConversationMemory.session_id == conversation_id,
        )
        .order_by(models.ConversationMemory.timestamp.asc())
        .all()
    )

    if not messages:
        # Nothing on file yet — return an empty thread rather than 404 so
        # the dashboard's conversation-restore flow doesn't bail.
        return {
            "conversation_id": conversation_id,
            "persona_id": "listener",
            "messages": [],
        }

    return {
        "conversation_id": conversation_id,
        "persona_id": "listener",
        "messages": [
            {
                "id": m.id,
                "role": "assistant" if m.role == "assistant" else "user",
                "content": m.message,
                "timestamp": (
                    m.timestamp.replace(tzinfo=datetime.now().astimezone().tzinfo).isoformat()
                    if m.timestamp.tzinfo is None
                    else m.timestamp.isoformat()
                ),
            }
            for m in messages
        ],
    }


def _build_nova_context(db: Session, device_id: str) -> str:
    window = (
        db.query(models.BehaviorWindow)
        .filter(models.BehaviorWindow.subject_id == device_id)
        .order_by(models.BehaviorWindow.start_ts.desc())
        .first()
    )
    risk = None
    if window:
        risk = (
            db.query(models.RiskScoreV2)
            .filter(models.RiskScoreV2.window_id == window.id)
            .first()
        )
    if not risk:
        return "No authorized PRISM observations are available for this request."
    factors = ", ".join(risk.contributing_factors)
    return (
        f"Authorized PRISM observations: score={risk.score_value}; "
        f"risk_level={risk.risk_level}; contributing_factors={factors or 'none'}"
    )


@nova_router.post("/chat")
def nova_chat(
    req: NovaChatRequest,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    guardian_id = str(current_guardian.id)
    device = (
        db.query(models.ChildDevice)
        .filter(models.ChildDevice.guardian_id == guardian_id)
        .order_by(models.ChildDevice.name.asc())
        .first()
    )
    if not device:
        raise HTTPException(status_code=404, detail="No linked PRISM device found.")

    conversation_id = req.conversation_id or f"nova-{guardian_id}-{req.persona_id}"
    history_rows = (
        db.query(models.ConversationMemory)
        .filter(
            models.ConversationMemory.subject_id == device.id,
            models.ConversationMemory.session_id == conversation_id,
        )
        .order_by(models.ConversationMemory.timestamp.asc())
        .all()
    )
    history = [NovaTurn(role=row.role, content=row.message) for row in history_rows]
    history.append(NovaTurn(role="user", content=req.message))

    if check_crisis(req.message):
        response_text = CRISIS_RESPONSE
    else:
        try:
            provider_kwargs = {
                "context": _build_nova_context(db, str(device.id)),
                "persona_id": req.persona_id,
            }
            if req.action is not None:
                provider_kwargs["action"] = req.action
            response_text = generate_response(history, **provider_kwargs)
        except Exception as exc:
            db.rollback()
            raise HTTPException(status_code=502, detail="NOVA provider unavailable.") from exc

    user_memory = models.ConversationMemory(
        subject_id=device.id,
        session_id=conversation_id,
        message=req.message,
        role="user",
    )
    assistant_memory = models.ConversationMemory(
        subject_id=device.id,
        session_id=conversation_id,
        message=response_text,
        role="assistant",
    )
    db.add_all([user_memory, assistant_memory])
    db.commit()
    db.refresh(assistant_memory)

    audit.log_audit_event(
        db,
        action="NOVA_CHAT_TURN (legacy-compat)",
        guardian_id=guardian_id,
        device_id=str(device.id),
    )

    return {
        "conversation_id": conversation_id,
        "message": {
            "id": assistant_memory.id,
            "role": "assistant",
            "content": response_text,
            "timestamp": assistant_memory.timestamp.isoformat(),
        },
        "crisis_flag": check_crisis(req.message),
    }


def _contains_crisis_keyword(message: str) -> bool:
    return check_crisis(message)
