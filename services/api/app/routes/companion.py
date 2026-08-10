import hashlib
import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.utils import audit, auth
from app.utils.rate_limiter import rate_limit
from app.utils.companion_engine import (
    CRISIS_RESPONSE,
    DISCLOSURE_BANNER,
    PERSONAS,
    _raise_crisis_alert,
    check_crisis,
    handle_companion_message,
)
from app.utils.text_screening import screen_text
from app.services.nova_ai_service import NovaProviderError, NovaProviderUnavailable, NovaTurn, generate_response

router = APIRouter(prefix="/api/v1/companion", tags=["companion"])
nova_router = APIRouter(prefix="/api/v1/nova", tags=["NOVA"])


class NovaChatRequest(BaseModel):
    conversation_id: str | None = None
    message: str
    persona_id: str = "listener"


class NovaMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    timestamp: str


def _safe_id(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]


def _guardian_device_ids(db: Session, guardian: models.Guardian) -> list[str]:
    return [
        row.id
        for row in db.query(models.ChildDevice.id)
        .filter(models.ChildDevice.guardian_id == guardian.id)
        .all()
    ]


def _nova_session(db: Session, guardian: models.Guardian, conversation_id: str | None, persona_id: str):
    device_ids = _guardian_device_ids(db, guardian)
    if not device_ids:
        device = (
            db.query(models.ChildDevice)
            .filter(
                models.ChildDevice.guardian_id == guardian.id,
                models.ChildDevice.name == "NOVA Web Companion",
            )
            .first()
        )
        if not device:
            device = models.ChildDevice(
                guardian_id=guardian.id,
                name="NOVA Web Companion",
                platform="web",
                device_token=f"nova-web-{guardian.id}",
            )
            db.add(device)
            db.commit()
            db.refresh(device)
        device_ids = [device.id]
    if conversation_id:
        session = (
            db.query(models.CompanionSession)
            .filter(
                models.CompanionSession.id == conversation_id,
                models.CompanionSession.subject_id.in_(device_ids),
            )
            .first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return session
    if not device_ids:
        raise HTTPException(status_code=400, detail="No PRISM device is linked to this account")
    if persona_id not in PERSONAS:
        raise HTTPException(status_code=400, detail="Invalid persona ID")
    session = models.CompanionSession(
        subject_id=device_ids[0], persona_id=persona_id, channel="nova-web"
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def _nova_context(db: Session, device_ids: list[str]) -> str | None:
    if not device_ids:
        return "Authorized PRISM observations: no linked devices or observations are available."

    try:
        sections: list[str] = []
        risk_rows = (
            db.query(models.RiskScore)
            .filter(models.RiskScore.device_id.in_(device_ids))
            .order_by(models.RiskScore.timestamp.desc())
            .limit(5)
            .all()
        )
        factors = []
        for row in risk_rows:
            factors.extend(row.contributing_factors[:3])
        if factors:
            sections.append("Recent explainable risk factors: " + "; ".join(dict.fromkeys(factors)))

        v2_risk_rows = (
            db.query(models.RiskScoreV2, models.BehaviorWindow)
            .join(
                models.BehaviorWindow,
                models.RiskScoreV2.window_id == models.BehaviorWindow.id,
            )
            .filter(models.BehaviorWindow.subject_id.in_(device_ids))
            .order_by(models.BehaviorWindow.end_ts.desc())
            .limit(5)
            .all()
        )
        logging.getLogger(__name__).info(
            "NOVA PRISM context rows: devices=%s legacy_risk_rows=%s v2_risk_rows=%s",
            len(device_ids),
            len(risk_rows),
            len(v2_risk_rows),
        )
        if v2_risk_rows:
            sections.append(
                "Recent PRISM risk assessments: "
                + "; ".join(
                    f"score={risk.score_value:g} level={risk.risk_level} "
                    f"window={window.start_ts.isoformat()} to {window.end_ts.isoformat()} "
                    f"factors={', '.join(risk.contributing_factors[:3]) or 'none recorded'}"
                    for risk, window in v2_risk_rows
                )
            )

        baselines = (
            db.query(models.BaselineProfile)
            .filter(models.BaselineProfile.device_id.in_(device_ids))
            .order_by(models.BaselineProfile.updated_at.desc())
            .limit(12)
            .all()
        )
        if baselines:
            sections.append(
                "Configured PRISM baselines: "
                + "; ".join(
                    f"{row.signal_type} mean={row.rolling_mean:g} variance={row.rolling_variance:g}"
                    for row in baselines
                )
            )

        physio = (
            db.query(models.PhysioReading)
            .filter(models.PhysioReading.subject_id.in_(device_ids))
            .order_by(models.PhysioReading.timestamp.desc())
            .limit(10)
            .all()
        )
        if physio:
            sections.append(
                "Recent physiological readings: "
                + "; ".join(f"{row.sensor_type} value={row.value:g} variance={row.variance:g}" for row in physio)
            )

        sleep = (
            db.query(models.SleepWindow)
            .filter(models.SleepWindow.subject_id.in_(device_ids))
            .order_by(models.SleepWindow.estimated_start.desc())
            .limit(5)
            .all()
        )
        if sleep:
            sections.append(
                "Recent sleep windows: "
                + "; ".join(
                    f"{row.estimated_start.isoformat()} to {row.estimated_end.isoformat()} confidence={row.confidence:g}"
                    for row in sleep
                )
            )

        typing = (
            db.query(models.TypingSession)
            .filter(models.TypingSession.device_id.in_(device_ids))
            .order_by(models.TypingSession.created_at.desc())
            .limit(5)
            .all()
        )
        if typing:
            sections.append(
                "Recent typing summaries: "
                + "; ".join(
                    f"wpm={row.wpm:g} hold_ms={row.avg_hold_time_ms:g} flight_ms={row.avg_flight_time_ms:g} error_rate={row.error_rate:g}"
                    for row in typing
                )
            )
    except SQLAlchemyError:
        logging.getLogger(__name__).exception(
            "NOVA PRISM context query failed for authorized device count=%s",
            len(device_ids),
        )
        raise NovaProviderError("NOVA PRISM context is unavailable")

    if not sections:
        return "Authorized PRISM observations: no observations are currently available for the linked devices."
    return "Authorized recent PRISM observations: " + "\n".join(sections)


def _nova_history(db: Session, session_id: str) -> list[NovaTurn]:
    rows = (
        db.query(models.ConversationMemory)
        .filter(models.ConversationMemory.session_id == session_id)
        .order_by(models.ConversationMemory.timestamp.asc())
        .limit(40)
        .all()
    )
    return [NovaTurn(role=row.role, content=row.message) for row in rows]


def _nova_message(row: models.ConversationMemory) -> dict:
    return {
        "id": row.id,
        "role": row.role,
        "content": row.message,
        "timestamp": row.timestamp.isoformat() if row.timestamp else "",
    }


@nova_router.post("/chat", dependencies=[Depends(rate_limit)])
def nova_chat(
    req: NovaChatRequest,
    db: Session = Depends(get_db),
    guardian: models.Guardian = Depends(auth.get_current_user),
):
    message = req.message.strip()
    if not message:
        raise HTTPException(status_code=422, detail="Message cannot be empty")

    session = _nova_session(db, guardian, req.conversation_id, req.persona_id)
    device_ids = _guardian_device_ids(db, guardian)
    logging.getLogger(__name__).info(
        "NOVA authenticated scope: guardian=%s devices=%s device_hashes=%s",
        _safe_id(guardian.id),
        len(device_ids),
        [_safe_id(device_id) for device_id in device_ids],
    )
    history = _nova_history(db, session.id)
    user_memory = models.ConversationMemory(
        subject_id=session.subject_id,
        session_id=session.id,
        message=message,
        role="user",
    )
    db.add(user_memory)
    db.commit()

    if check_crisis(message):
        session.crisis_flag = True
        db.commit()
        _raise_crisis_alert(db, session)
        response_text = CRISIS_RESPONSE
    else:
        try:
            response_text = generate_response(
                history + [NovaTurn(role="user", content=message)],
                _nova_context(db, device_ids),
                session.persona_id,
            )
        except NovaProviderUnavailable as exc:
            db.delete(user_memory)
            db.commit()
            raise HTTPException(status_code=503, detail="NOVA AI is not configured") from exc
        except NovaProviderError as exc:
            db.delete(user_memory)
            db.commit()
            raise HTTPException(status_code=502, detail="NOVA could not respond right now") from exc
        except Exception as exc:
            db.delete(user_memory)
            db.commit()
            raise HTTPException(status_code=502, detail="NOVA could not respond right now") from exc

    assistant_memory = models.ConversationMemory(
        subject_id=session.subject_id,
        session_id=session.id,
        message=response_text,
        role="assistant",
    )
    db.add(assistant_memory)
    audit.log_audit_event(
        db,
        action="NOVA conversation accessed",
        guardian_id=guardian.id,
        device_id=session.subject_id,
    )
    db.commit()
    db.refresh(assistant_memory)
    return {
        "conversation_id": session.id,
        "message": _nova_message(assistant_memory),
        "crisis_flag": session.crisis_flag,
    }


@nova_router.get("/conversations/{conversation_id}")
def get_nova_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    guardian: models.Guardian = Depends(auth.get_current_user),
):
    session = _nova_session(db, guardian, conversation_id, "listener")
    rows = (
        db.query(models.ConversationMemory)
        .filter(models.ConversationMemory.session_id == session.id)
        .order_by(models.ConversationMemory.timestamp.asc())
        .limit(100)
        .all()
    )
    audit.log_audit_event(
        db,
        action="NOVA conversation history accessed",
        guardian_id=guardian.id,
        device_id=session.subject_id,
    )
    return {
        "conversation_id": session.id,
        "persona_id": session.persona_id,
        "messages": [_nova_message(row) for row in rows],
    }


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


class SimulateMessageRequest(BaseModel):
    persona_id: str
    message: str


@router.post("/simulate")
def simulate_persona(
    req: SimulateMessageRequest,
    db: Session = Depends(get_db),
    guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Simulate a persona response for the guardian dashboard."""
    from app.utils.companion_engine import _respond, PERSONAS

    if req.persona_id not in PERSONAS:
        raise HTTPException(status_code=400, detail="Invalid persona ID")

    persona = PERSONAS[req.persona_id]
    response_text = _respond(persona, req.message)
    return {"response": response_text}


class RagSearchRequest(BaseModel):
    query: str
    top_k: int = 5
    device_id: str | None = None


@router.post("/rag/search")
def companion_rag_search(
    req: RagSearchRequest,
    db: Session = Depends(get_db),
    guardian: models.Guardian = Depends(auth.get_current_user),
):
    """
    Lightweight lexical memory search over conversation_memory for the guardian's devices.
    Kept under /companion so the dashboard chatbot has a real authenticated endpoint.
    """
    devices = (
        db.query(models.ChildDevice)
        .filter(models.ChildDevice.guardian_id == guardian.id)
        .all()
    )
    device_ids = [d.id for d in devices]
    if req.device_id:
        if req.device_id not in device_ids:
            raise HTTPException(status_code=403, detail="Device not owned by guardian")
        device_ids = [req.device_id]

    if not device_ids:
        return {"results_count": 0, "results": [], "method": "lexical"}

    q = (req.query or "").strip().lower()
    rows = (
        db.query(models.ConversationMemory)
        .filter(models.ConversationMemory.subject_id.in_(device_ids))
        .order_by(models.ConversationMemory.timestamp.desc())
        .limit(200)
        .all()
    )

    scored = []
    tokens = [t for t in q.replace(",", " ").split() if len(t) > 2]
    for row in rows:
        text = (row.message or "").lower()
        if not tokens or any(t in text for t in tokens):
            scored.append(
                {
                    "id": row.id,
                    "role": row.role,
                    "message": row.message,
                    "sentiment": row.sentiment,
                    "timestamp": row.timestamp.isoformat() if row.timestamp else None,
                }
            )
        if len(scored) >= max(1, min(req.top_k, 20)):
            break

    return {"results_count": len(scored), "results": scored, "method": "lexical"}


@router.get("/mood/timeline")
def companion_mood_timeline(
    days: int = Query(7, ge=1, le=90),
    device_id: str | None = None,
    db: Session = Depends(get_db),
    guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Aggregate daily dominant sentiment from conversation memory for guardian devices."""
    from collections import Counter, defaultdict
    from datetime import datetime, timedelta, timezone

    devices = (
        db.query(models.ChildDevice)
        .filter(models.ChildDevice.guardian_id == guardian.id)
        .all()
    )
    device_ids = [d.id for d in devices]
    if device_id:
        if device_id not in device_ids:
            raise HTTPException(status_code=403, detail="Device not owned by guardian")
        device_ids = [device_id]

    if not device_ids:
        return {"daily_mood": []}

    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        db.query(models.ConversationMemory)
        .filter(
            models.ConversationMemory.subject_id.in_(device_ids),
            models.ConversationMemory.timestamp >= since,
        )
        .order_by(models.ConversationMemory.timestamp.asc())
        .all()
    )

    by_day: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        if not row.timestamp:
            continue
        key = row.timestamp.date().isoformat()
        by_day[key].append((row.sentiment or "neutral").lower())

    daily = []
    for day, sentiments in sorted(by_day.items()):
        counts = Counter(sentiments)
        dominant, _ = counts.most_common(1)[0]
        daily.append(
            {
                "date": day,
                "dominant_sentiment": dominant,
                "message_count": len(sentiments),
                "breakdown": dict(counts),
            }
        )
    return {"daily_mood": daily}


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


def _screening_summary(message: str) -> dict:
    """Compact explainable signal summary from the text screening layer."""
    screen = screen_text(message)
    top_signals = sorted(
        ((k, v) for k, v in screen.emotion.items() if v > 0), key=lambda x: -x[1]
    )[:3]
    return {
        "alert_level": screen.alert_level,
        "risk_index": screen.risk_index,
        "distress_index": screen.distress_index,
        "protective_index": screen.protective_index,
        "sentiment": screen.sentiment,
        "top_emotions": [{"label": k, "score": v} for k, v in top_signals],
        "contributing_factors": screen.contributing_factors[:5],
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
        "signals": _screening_summary(req.message),
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
async def meta_webhook(payload: dict, request: Request, db: Session = Depends(get_db)):
    """
    Meta Inbound Webhook (WhatsApp & Instagram).
    Parses sender, text, and channels, then routes to AI + Crisis classifier.
    """
    # Validate x-hub-signature-256 if META_APP_SECRET is configured
    from app.config import settings

    app_secret = os.environ.get("META_APP_SECRET", "")
    signature = request.headers.get("x-hub-signature-256", "")
    if app_secret:
        import hashlib
        import hmac

        raw_body = await request.body()
        expected_sig = f"sha256={hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()}"
        if not hmac.compare_digest(signature, expected_sig):
            raise HTTPException(status_code=403, detail="Invalid webhook signature")

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
                whatsapp_url = "https://graph.facebook.com/v17.0/me/messages"
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
                instagram_url = "https://graph.facebook.com/v17.0/me/messages"
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
        "signals": _screening_summary(message_text),
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
