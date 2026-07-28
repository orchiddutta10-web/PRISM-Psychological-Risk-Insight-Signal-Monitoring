"""
Phase 14 — Guardian API Routes

Provides privacy-preserving guardian dashboard, alerts,
timeline, and consent management.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.config import settings
from app.utils import auth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/guardian", tags=["guardian"])

# ── Auth dependency for guardian-only routes ───────────────────────

guardian_auth = Depends(auth.get_current_user)


def verify_guardian_connection(
    connection_id: str, guardian: models.Guardian, db: Session
) -> models.GuardianConnection:
    """Ensure guardian owns this connection."""
    conn = (
        db.query(models.GuardianConnection)
        .filter(
            models.GuardianConnection.id == connection_id,
            models.GuardianConnection.guardian_id == guardian.id,
        )
        .first()
    )
    if not conn:
        raise HTTPException(status_code=404, detail="Guardian connection not found.")
    return conn


# ── Request / Response Schemas ─────────────────────────────────────


class GuardianDashboardResponse(BaseModel):
    connection_id: str
    device_name: str
    current_status: str  # stable | improving | mild_change | needs_attention | high_concern
    status_summary: str
    stability_score: float
    recent_changes: str
    positive_changes: list[str] = []
    unread_alerts: int


class GuardianAlertResponse(BaseModel):
    id: str
    severity: str
    category: str
    title: str
    summary: str
    contributing_observations: list[str]
    interpretation: str | None
    suggested_approach: str | None
    conversation_starter: str | None
    confidence: float
    is_acknowledged: bool
    detected_at: str


class GuardianAlertListResponse(BaseModel):
    alerts: list[GuardianAlertResponse]
    total: int
    unread: int


class GuardianTimelineEntry(BaseModel):
    id: str
    event: str
    category: str  # alert | positive | milestone | acknowledgement | connection
    timestamp: str
    details: str | None


class GuardianTimelineResponse(BaseModel):
    entries: list[GuardianTimelineEntry]


class GuardianAccessLogEntry(BaseModel):
    action: str
    resource: str | None
    timestamp: str


class GuardianAccessLogResponse(BaseModel):
    entries: list[GuardianAccessLogEntry]


class AcknowledgeAlertRequest(BaseModel):
    connection_id: str


class ConversationStarterResponse(BaseModel):
    scenario: str
    starter: str


# ── Dashboard ──────────────────────────────────────────────────────


@router.get("/dashboard/{connection_id}", response_model=GuardianDashboardResponse)
def get_guardian_dashboard(
    connection_id: str,
    db: Session = Depends(get_db),
    guardian: models.Guardian = guardian_auth,
):
    """Get guardian dashboard summary — privacy-preserving, trend-based only."""
    conn = verify_guardian_connection(connection_id, guardian, db)

    device = (
        db.query(models.ChildDevice)
        .filter(models.ChildDevice.id == conn.device_id)
        .first()
    )

    # Compute stability from recent risk scores
    recent_scores = (
        db.query(models.RiskScoreV2)
        .join(models.BehaviorWindow)
        .filter(models.BehaviorWindow.user_id == conn.device_id)
        .order_by(models.BehaviorWindow.start_ts.desc())
        .limit(7)
        .all()
    )

    stability = 85.0
    status = "stable"
    status_summary = "All behavioral metrics are within personal baseline."

    if recent_scores:
        avg = sum(s.score_value for s in recent_scores) / len(recent_scores)
        stability = max(0, min(100, 100 - avg))

        if avg >= 70:
            status = "high_concern"
            status_summary = "Several behavioral patterns have shifted significantly."
        elif avg >= 50:
            status = "needs_attention"
            status_summary = "Multiple routines have deviated from baseline."
        elif avg >= 30:
            status = "mild_change"
            status_summary = "Some routines have shifted from baseline."
        elif avg < 10:
            status = "improving"
            status_summary = "Metrics are trending positively."

    # Recent changes summary
    unread = (
        db.query(models.GuardianAlert)
        .filter(
            models.GuardianAlert.connection_id == connection_id,
            models.GuardianAlert.is_acknowledged == False,
        )
        .count()
    )

    positive = [
        "Routine consistency improving",
        "Screen time within healthy range",
    ]

    # Log access
    _log_guardian_access(db, connection_id, "VIEW_DASHBOARD")

    return GuardianDashboardResponse(
        connection_id=connection_id,
        device_name=device.name if device else "Unknown",
        current_status=status,
        status_summary=status_summary,
        stability_score=round(stability, 1),
        recent_changes=_build_recent_changes(recent_scores),
        positive_changes=positive,
        unread_alerts=unread,
    )


# ── Alerts ─────────────────────────────────────────────────────────


@router.get("/alerts/{connection_id}", response_model=GuardianAlertListResponse)
def get_guardian_alerts(
    connection_id: str,
    severity: str | None = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    guardian: models.Guardian = guardian_auth,
):
    """Get guardian alerts with pagination and severity filter."""
    verify_guardian_connection(connection_id, guardian, db)

    query = db.query(models.GuardianAlert).filter(
        models.GuardianAlert.connection_id == connection_id
    )
    if severity:
        query = query.filter(models.GuardianAlert.severity == severity)

    total = query.count()
    unread = query.filter(models.GuardianAlert.is_acknowledged == False).count()

    alerts = (
        query.order_by(models.GuardianAlert.detected_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    _log_guardian_access(db, connection_id, "VIEW_ALERTS")

    return GuardianAlertListResponse(
        alerts=[_alert_to_response(a) for a in alerts],
        total=total,
        unread=unread,
    )


@router.post("/alerts/{alert_id}/acknowledge", response_model=dict)
def acknowledge_alert(
    alert_id: str,
    req: AcknowledgeAlertRequest,
    db: Session = Depends(get_db),
    guardian: models.Guardian = guardian_auth,
):
    """Acknowledge a guardian alert."""
    verify_guardian_connection(req.connection_id, guardian, db)

    alert = (
        db.query(models.GuardianAlert)
        .filter(
            models.GuardianAlert.id == alert_id,
            models.GuardianAlert.connection_id == req.connection_id,
        )
        .first()
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")

    alert.is_acknowledged = True
    alert.acknowledged_at = datetime.now(timezone.utc)
    db.commit()

    _log_guardian_access(db, req.connection_id, "ACKNOWLEDGE_ALERT", resource=alert_id)

    return {"status": "acknowledged", "alert_id": alert_id}


# ── Timeline ───────────────────────────────────────────────────────


@router.get("/timeline/{connection_id}", response_model=GuardianTimelineResponse)
def get_guardian_timeline(
    connection_id: str,
    limit: int = 30,
    db: Session = Depends(get_db),
    guardian: models.Guardian = guardian_auth,
):
    """Get guardian timeline — behavioral shifts, milestones, acknowledgements."""
    conn = verify_guardian_connection(connection_id, guardian, db)

    entries: list[GuardianTimelineEntry] = []

    # Alert events
    alerts = (
        db.query(models.GuardianAlert)
        .filter(models.GuardianAlert.connection_id == connection_id)
        .order_by(models.GuardianAlert.detected_at.desc())
        .limit(limit)
        .all()
    )

    for a in alerts:
        entries.append(
            GuardianTimelineEntry(
                id=a.id,
                event=a.title,
                category="positive" if a.category == "positive" else "alert",
                timestamp=a.detected_at.isoformat() if a.detected_at else "",
                details=a.summary,
            )
        )

        if a.is_acknowledged and a.acknowledged_at:
            entries.append(
                GuardianTimelineEntry(
                    id=f"ack-{a.id}",
                    event="Guardian acknowledged alert",
                    category="acknowledgement",
                    timestamp=a.acknowledged_at.isoformat(),
                    details=f"Acknowledged: {a.title}",
                )
            )

    # Sort by timestamp descending
    entries.sort(key=lambda e: e.timestamp, reverse=True)

    _log_guardian_access(db, connection_id, "VIEW_TIMELINE")

    return GuardianTimelineResponse(entries=entries[:limit])


# ── Access Log ─────────────────────────────────────────────────────


@router.get("/access-log/{connection_id}", response_model=GuardianAccessLogResponse)
def get_guardian_access_log(
    connection_id: str,
    db: Session = Depends(get_db),
    guardian: models.Guardian = guardian_auth,
):
    """View guardian access log — visible to both parties for transparency."""
    if guardian.role != "ops":
        verify_guardian_connection(connection_id, guardian, db)

    logs = (
        db.query(models.GuardianAccessLog)
        .filter(models.GuardianAccessLog.connection_id == connection_id)
        .order_by(models.GuardianAccessLog.timestamp.desc())
        .limit(50)
        .all()
    )

    return GuardianAccessLogResponse(
        entries=[
            GuardianAccessLogEntry(
                action=l.action,
                resource=l.resource,
                timestamp=l.timestamp.isoformat() if l.timestamp else "",
            )
            for l in logs
        ]
    )


# ── Conversation Starters ──────────────────────────────────────────


STARTER_TEMPLATES: dict[str, str] = {
    "late_night_screens": "I noticed you've been up late recently — how are you feeling during the day? Everything okay?",
    "reduced_activity": "Want to go for a walk together this weekend? No pressure, just thought it might be nice.",
    "sleep_disruption": "I've noticed some changes in your routine lately. Is anything on your mind you'd want to talk about?",
    "social_withdrawal": "Haven't seen you connect with friends much lately. Just checking in — how's everything going?",
    "general": "Hey, I just wanted to check in. How's life been lately? Anything you're excited about or worried about?",
    "positive": "I noticed things seem to be going well recently. That's really great to see — how are you feeling about it?",
    "routine_improvement": "It looks like things are settling back into a good rhythm. I'm glad to see that — how does it feel on your end?",
}


@router.get("/conversation-starters", response_model=list[ConversationStarterResponse])
def get_conversation_starters():
    """Get suggested conversation starters for guardians."""
    return [
        ConversationStarterResponse(scenario=k.replace("_", " ").title(), starter=v)
        for k, v in STARTER_TEMPLATES.items()
    ]


# ── Connection Management ──────────────────────────────────────────


class CreateConnectionRequest(BaseModel):
    device_id: str


@router.post(
    "/connections",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
)
def create_guardian_connection(
    req: CreateConnectionRequest,
    db: Session = Depends(get_db),
    guardian: models.Guardian = guardian_auth,
):
    """Create a guardian connection request (sent by guardian)."""
    device = (
        db.query(models.ChildDevice)
        .filter(models.ChildDevice.id == req.device_id)
        .first()
    )
    if not device:
        raise HTTPException(status_code=404, detail="Device not found.")

    existing = (
        db.query(models.GuardianConnection)
        .filter(
            models.GuardianConnection.guardian_id == guardian.id,
            models.GuardianConnection.device_id == req.device_id,
        )
        .first()
    )
    if existing:
        return {
            "status": "existing",
            "connection_id": existing.id,
            "connection_status": existing.status,
        }

    conn = models.GuardianConnection(
        guardian_id=guardian.id,
        device_id=req.device_id,
        status="active",  # Auto-active for MVP
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)

    return {"status": "created", "connection_id": conn.id}


@router.get("/connections", response_model=list[dict])
def list_guardian_connections(
    db: Session = Depends(get_db),
    guardian: models.Guardian = guardian_auth,
):
    """List all guardian connections."""
    connections = (
        db.query(models.GuardianConnection)
        .filter(models.GuardianConnection.guardian_id == guardian.id)
        .all()
    )

    return [
        {
            "id": c.id,
            "device_id": c.device_id,
            "device_name": (
                db.query(models.ChildDevice)
                .filter(models.ChildDevice.id == c.device_id)
                .first()
                .name
                if db.query(models.ChildDevice)
                .filter(models.ChildDevice.id == c.device_id)
                .first()
                else "Unknown"
            ),
            "status": c.status,
            "invited_at": c.invited_at.isoformat() if c.invited_at else None,
        }
        for c in connections
    ]


@router.post("/connections/{connection_id}/revoke", response_model=dict)
def revoke_guardian_connection(
    connection_id: str,
    db: Session = Depends(get_db),
    guardian: models.Guardian = guardian_auth,
):
    """Revoke a guardian connection (guardian side)."""
    conn = verify_guardian_connection(connection_id, guardian, db)
    conn.status = "revoked"
    conn.revoked_at = datetime.now(timezone.utc)
    db.commit()

    return {"status": "revoked", "connection_id": connection_id}


# ── Seed demo alerts ───────────────────────────────────────────────


@router.post("/connections/{connection_id}/seed-demo", response_model=dict)
def seed_demo_alerts(
    connection_id: str,
    db: Session = Depends(get_db),
    guardian: models.Guardian = guardian_auth,
):
    """Seed demo guardian alerts for testing."""
    conn = verify_guardian_connection(connection_id, guardian, db)

    demo_alerts = [
        {
            "severity": "attention",
            "category": "sleep",
            "title": "Late-Night Screen Time Elevated",
            "summary": "Screen usage has been higher than typical during late-night hours over the past 3 days.",
            "observations": [
                "Screen time 34% above personal baseline after 10 PM",
                "Bedtime shifted approximately 45 minutes later",
                "Sleep duration reduced by about 1 hour",
            ],
            "interpretation": "This pattern may be related to a schedule change or increased workload. It is common and often temporary.",
            "suggested_approach": 'Consider a casual check-in: "How are you sleeping lately?"',
            "conversation_starter": STARTER_TEMPLATES["late_night_screens"],
            "confidence": 82.0,
        },
        {
            "severity": "observation",
            "category": "behavior",
            "title": "Activity Levels Slightly Lower",
            "summary": "Daily movement has been below personal baseline for 3 days.",
            "observations": [
                "Step count 18% below 14-day average",
                "Morning activity reduced",
                "Afternoon movement remaining consistent",
            ],
            "interpretation": "Likely weather-related or a natural rest period. Not concerning at this stage.",
            "suggested_approach": "No action needed. Monitor for another 2 days.",
            "conversation_starter": None,
            "confidence": 72.0,
        },
        {
            "severity": "positive",
            "category": "positive",
            "title": "Sleep Routine Improving",
            "summary": "Sleep patterns have been returning to baseline over the past 4 days.",
            "observations": [
                "Bedtime consistency improving",
                "Sleep duration back to 7-8 hours",
                "Wake-up time stabilizing",
            ],
            "interpretation": "Alex's sleep is trending positively. This is great to see.",
            "suggested_approach": "Consider acknowledging: 'It seems like things are settling into a good rhythm.'",
            "conversation_starter": STARTER_TEMPLATES["positive"],
            "confidence": 88.0,
        },
        {
            "severity": "info",
            "category": "routine",
            "title": "Weekly Routine Summary",
            "summary": "Routines remained consistent this week with minor variance.",
            "observations": [
                "Overall stability at 82%",
                "School-day patterns maintained",
                "Weekend variation within expected range",
            ],
            "interpretation": None,
            "suggested_approach": None,
            "conversation_starter": None,
            "confidence": 95.0,
        },
    ]

    created = []
    for a in demo_alerts:
        alert = models.GuardianAlert(
            connection_id=connection_id,
            severity=a["severity"],
            category=a["category"],
            title=a["title"],
            summary=a["summary"],
            interpretation=a.get("interpretation"),
            suggested_approach=a.get("suggested_approach"),
            conversation_starter=a.get("conversation_starter"),
            confidence=a["confidence"],
        )
        alert.contributing_observations = a["observations"]
        db.add(alert)
        created.append(alert)

    db.commit()

    return {"status": "seeded", "alerts_created": len(created)}


# ── Helpers ─────────────────────────────────────────────────────────


def _alert_to_response(a: models.GuardianAlert) -> GuardianAlertResponse:
    return GuardianAlertResponse(
        id=a.id,
        severity=a.severity,
        category=a.category,
        title=a.title,
        summary=a.summary,
        contributing_observations=a.contributing_observations,
        interpretation=a.interpretation,
        suggested_approach=a.suggested_approach,
        conversation_starter=a.conversation_starter,
        confidence=a.confidence,
        is_acknowledged=a.is_acknowledged,
        detected_at=a.detected_at.isoformat() if a.detected_at else "",
    )


def _log_guardian_access(
    db: Session, connection_id: str, action: str, resource: str | None = None
):
    """Log guardian access to immutable audit trail."""
    try:
        log_entry = models.GuardianAccessLog(
            connection_id=connection_id,
            action=action,
            resource=resource,
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        logger.error("Failed to log guardian access: %s", str(e))


def _build_recent_changes(scores: list) -> str:
    """Build recent changes summary from risk scores."""
    if not scores:
        return "No significant changes detected. Routines have been consistent."
    avg = sum(s.score_value for s in scores) / len(scores)
    if avg < 15:
        return "No significant changes detected. Routines have been consistent."
    elif avg < 30:
        return "Minor shifts in daily routine observed. Sleep and activity remain within typical range."
    elif avg < 50:
        return "Some routines have shifted from baseline. Activity slightly lower, screen time increased."
    else:
        return "Several behavioral patterns have shifted. Activity and sleep patterns show notable changes."
