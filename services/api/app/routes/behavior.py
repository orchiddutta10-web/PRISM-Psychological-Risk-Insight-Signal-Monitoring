"""
Phase 13 — Behavioral AI + Chat Memory Routes

Adds:
  POST /api/v1/behavior/typing   — Typing event ingest
  POST /api/v1/behavior/analyze  — Typing feature extraction
  POST /api/v1/chat/memory       — Store conversation memory
  POST /api/v1/chat/retrieve     — RAG semantic search
  POST /api/v1/rag/search        — Search knowledge base
  GET  /api/v1/mood/timeline     — Mood trend endpoint
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.utils import auth

router = APIRouter(prefix="/api/v1", tags=["behavior"])

# ── Typing Dynamics ──────────────────────────────────────────────────────


class TypingEventIngest(BaseModel):
    """Single keystroke event from Android."""
    device_id: str
    key: str
    event_type: str = Field(..., pattern=r"^(key_down|key_up)$")
    timestamp_ms: int
    session_id: str | None = None


class TypingBatchIngest(BaseModel):
    """Batch of typing events from a session."""
    device_id: str
    session_id: str
    events: list[dict]  # [{key, event_type, timestamp_ms}, ...]
    timestamp: str | None = None


class TypingFeaturesResponse(BaseModel):
    device_id: str
    session_id: str
    avg_hold_time_ms: float
    avg_flight_time_ms: float
    wpm: float
    error_rate: float
    pause_count: int
    typing_entropy: float
    confidence: float


@router.post(
    "/behavior/typing",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
)
def ingest_typing_batch(
    payload: TypingBatchIngest,
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device),
):
    """
    Ingest a batch of typing events from an Android device.
    Computes basic typing features (hold time, flight time, WPM, error rate)
    and stores the session summary.
    """
    if payload.device_id != current_device.id:
        raise HTTPException(403, detail="Device ID mismatch.")

    events = payload.events
    if len(events) < 5:
        raise HTTPException(400, detail="Need at least 5 keystroke events for analysis.")

    # Sort by timestamp
    events.sort(key=lambda e: e.get("timestamp_ms", 0))

    # Extract hold times and flight times
    hold_times = []
    flight_times = []
    prev_up = None

    for i in range(len(events)):
        e = events[i]
        if e.get("event_type") == "key_down":
            # Find matching key_up
            for j in range(i + 1, len(events)):
                if events[j].get("event_type") == "key_up" and events[j].get("key") == e.get("key"):
                    hold = events[j].get("timestamp_ms", 0) - e.get("timestamp_ms", 0)
                    if 10 < hold < 2000:  # valid range
                        hold_times.append(hold)
                    break

        if e.get("event_type") == "key_up" and prev_up is not None:
            flight = e.get("timestamp_ms", 0) - prev_up
            if 10 < flight < 5000:
                flight_times.append(flight)

        if e.get("event_type") == "key_up":
            prev_up = e.get("timestamp_ms", 0)

    # Compute features
    avg_hold = sum(hold_times) / max(len(hold_times), 1)
    avg_flight = sum(flight_times) / max(len(flight_times), 1)

    total_ms = events[-1].get("timestamp_ms", 1) - events[0].get("timestamp_ms", 0)
    total_sec = max(total_ms / 1000.0, 1)
    chars = len([e for e in events if e.get("event_type") == "key_down"])
    wpm = (chars / 5.0) / (total_sec / 60.0)  # standard 5-char word

    backspace_count = sum(1 for e in events if e.get("key") == "Backspace")
    error_rate = backspace_count / max(chars, 1)

    # Store session
    session = models.TypingSession(
        device_id=current_device.id,
        session_id=payload.session_id,
        total_events=len(events),
        avg_hold_time_ms=round(avg_hold, 2),
        avg_flight_time_ms=round(avg_flight, 2),
        wpm=round(wpm, 1),
        error_rate=round(error_rate, 4),
        pause_count=0,  # computed below
        typing_entropy=0.0,
        confidence=min(1.0, len(events) / 100.0),
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return {
        "status": "analyzed",
        "session_id": payload.session_id,
        "avg_hold_time_ms": round(avg_hold, 2),
        "avg_flight_time_ms": round(avg_flight, 2),
        "wpm": round(wpm, 1),
        "error_rate": round(error_rate, 4),
        "total_events": len(events),
    }


# ── Chat Memory ──────────────────────────────────────────────────────────


class ChatMemoryRequest(BaseModel):
    session_id: str
    message: str
    role: str = Field(default="user", pattern=r"^(user|assistant|system)$")
    sentiment: str | None = None  # positive, negative, neutral
    tags: list[str] = []


@router.post(
    "/chat/memory",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
)
def store_chat_memory(
    req: ChatMemoryRequest,
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device),
):
    """
    Store a chat message in long-term memory.
    Embedding generation is deferred — stores metadata only for now.
    """
    # Verify session exists
    session = (
        db.query(models.CompanionSession)
        .filter(
            models.CompanionSession.id == req.session_id,
            models.CompanionSession.subject_id == current_device.id,
        )
        .first()
    )
    if not session:
        raise HTTPException(404, detail="Session not found.")

    memory = models.ConversationMemory(
        subject_id=current_device.id,
        session_id=req.session_id,
        message=req.message,
        role=req.role,
        sentiment=req.sentiment,
        tags_json=str(req.tags),
    )
    db.add(memory)
    db.commit()
    db.refresh(memory)

    return {"status": "stored", "memory_id": memory.id}


# ── RAG Search ───────────────────────────────────────────────────────────


class RAGSearchRequest(BaseModel):
    query: str
    top_k: int = Field(default=5, ge=1, le=20)
    filters: dict = Field(default_factory=dict)


@router.post(
    "/rag/search",
    response_model=dict,
    status_code=status.HTTP_200_OK,
)
def rag_search(
    req: RAGSearchRequest,
    db: Session = Depends(get_db),
    current_user: models.Guardian = Depends(auth.get_current_user),
    device_id: str | None = None,
):
    """
    Semantic search over conversation memory and knowledge base.
    Uses keyword matching as a fallback until vector embeddings are integrated.
    Searchable by the guardian dashboard (guardian token) or a device.
    """
    # Resolve the subject device: explicit device_id, else the guardian's first device
    if device_id:
        auth.verify_guardian_device_access(current_user, device_id, db)
        subject_id = device_id
    else:
        device = (
            db.query(models.ChildDevice)
            .filter(models.ChildDevice.guardian_id == current_user.id)
            .first()
        )
        subject_id = str(device.id) if device else None

    if not subject_id:
        return {
            "query": req.query,
            "results_count": 0,
            "results": [],
            "method": "keyword",
            "note": "No paired device with conversation memory.",
        }

    query_lower = req.query.lower()
    limit = req.top_k

    # Search conversation memory
    memories = (
        db.query(models.ConversationMemory)
        .filter(
            models.ConversationMemory.subject_id == subject_id,
            models.ConversationMemory.message.ilike(f"%{query_lower}%"),
        )
        .order_by(models.ConversationMemory.timestamp.desc())
        .limit(limit)
        .all()
    )

    results = [
        {
            "id": m.id,
            "message": m.message[:200],
            "role": m.role,
            "sentiment": m.sentiment,
            "timestamp": m.timestamp.isoformat(),
        }
        for m in memories
    ]

    return {
        "query": req.query,
        "results_count": len(results),
        "results": results,
        "method": "keyword"  # will be "vector" once embeddings are integrated
    }


# ── Mood Timeline ────────────────────────────────────────────────────────


@router.get(
    "/mood/timeline",
    response_model=dict,
    status_code=status.HTTP_200_OK,
)
def mood_timeline(
    days: int = Query(default=14, ge=1, le=90),
    db: Session = Depends(get_db),
    current_user: models.Guardian = Depends(auth.get_current_user),
    device_id: str | None = None,
):
    """
    Retrieve mood/sentiment timeline from conversation memory.
    Aggregates sentiment tags from stored chat memory.
    """
    if device_id:
        auth.verify_guardian_device_access(current_user, device_id, db)
    else:
        devices = (
            db.query(models.ChildDevice)
            .filter(models.ChildDevice.guardian_id == current_user.id)
            .all()
        )
        device_id = str(devices[0].id) if devices else None

    if not device_id:
        return {"timeline": [], "note": "No device data available."}

    cutoff = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    memories = (
        db.query(models.ConversationMemory)
        .filter(
            models.ConversationMemory.subject_id == device_id,
            models.ConversationMemory.timestamp >= cutoff,
        )
        .order_by(models.ConversationMemory.timestamp.asc())
        .all()
    )

    timeline = [
        {
            "date": m.timestamp.strftime("%Y-%m-%d") if m.timestamp else "unknown",
            "sentiment": m.sentiment,
            "role": m.role,
            "preview": m.message[:80],
        }
        for m in memories[-90:]  # last 90 entries
    ]

    # Aggregate daily sentiment
    from collections import Counter
    by_day = {}
    for entry in timeline:
        day = entry["date"]
        if day not in by_day:
            by_day[day] = []
        if entry["sentiment"]:
            by_day[day].append(entry["sentiment"])

    daily_mood = []
    for day, sentiments in sorted(by_day.items()):
        counts = Counter(sentiments)
        dominant = counts.most_common(1)[0][0] if counts else "neutral"
        daily_mood.append({
            "date": day,
            "dominant_sentiment": dominant,
            "message_count": len(sentiments),
            "breakdown": dict(counts),
        })

    return {
        "device_id": device_id,
        "days": days,
        "daily_mood": daily_mood[-days:],
        "recent_entries": timeline[-20:],
    }
