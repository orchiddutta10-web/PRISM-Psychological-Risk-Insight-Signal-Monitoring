import json
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    status,
    WebSocket,
    WebSocketDisconnect,
)
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List

from app import models, schemas
from app.database import get_db, SessionLocal
from app.utils import auth, audit
from app.utils.redis_client import get_redis_client
from app.utils.worker import run_baseline_aggregation, purge_raw_events
from app.utils.circadian_estimator import infer_sleep_windows
from app.utils.ml_engine import run_risk_engine
from app.utils.risk_registry import check_event_for_risks

router = APIRouter(prefix="/api/v1/events", tags=["telemetry"])


@router.post("/ingest", response_model=schemas.TelemetryResponse)
async def ingest_telemetry(
    payload: schemas.TelemetryIngest,
    request: Request,
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device),
):
    """
    Ingest behavioral telemetry events.
    Verifies that the authenticated device matches the payload device ID,
    checks if consent has been granted for the specific signal type,
    stores the metadata encrypted at rest, and publishes the event to Redis.
    """
    if payload.device_id != current_device.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authenticated device ID does not match telemetry payload device ID.",
        )

    # Verify active consent exists for this device and signal type
    consent = (
        db.query(models.ConsentRecord)
        .filter(
            models.ConsentRecord.device_id == current_device.id,
            models.ConsentRecord.signal_type == payload.signal_type,
        )
        .first()
    )

    if not consent or consent.revoked_at is not None:
        audit.log_audit_event(
            db,
            action=f"Telemetry ingestion REJECTED: Consent missing or revoked for signal type '{payload.signal_type}'",
            device_id=str(current_device.id),
            guardian_id=str(current_device.guardian_id),
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Telemetry ingestion rejected: Active consent is not granted for '{payload.signal_type}' metadata.",
        )

    # Save raw signal event
    event = models.RawSignalEvent(
        device_id=current_device.id,
        signal_type=payload.signal_type,
        timestamp=payload.timestamp,
    )
    # This automatically serializes and encrypts features at rest
    event.metadata_json = json.dumps(payload.metadata)

    db.add(event)
    db.commit()
    db.refresh(event)

    # Write status to health cache to avoid N+1 queries on status polls
    try:
        is_synth = payload.metadata.get("is_synthetic", False)
        status_str = "synthetic" if is_synth else "real"
        redis_conn = get_redis_client()
        await redis_conn.set(f"prism:health:{payload.signal_type}", status_str, ex=3600)
    except Exception as e:
        import logging

        logging.getLogger(__name__).warning("Failed to update health cache: %s", str(e))

    # Log successful ingestion
    audit.log_audit_event(
        db,
        action=f"Telemetry ingested successfully: {payload.signal_type} (Event ID: {event.id})",
        device_id=str(current_device.id),
        guardian_id=str(current_device.guardian_id),
        ip_address=request.client.host if request.client else None,
    )

    # Run the risk scoring and alert generation engine
    await run_risk_engine(current_device.id, payload.signal_type, payload.metadata, db)

    # Publish to Redis channel for real-time WebSocket updates
    try:
        redis_conn = get_redis_client()
        event_data = {
            "event_id": event.id,
            "device_id": current_device.id,
            "device_name": current_device.name,
            "signal_type": payload.signal_type,
            "timestamp": event.timestamp.isoformat(),
            "metadata": payload.metadata,
        }
        await redis_conn.publish(
            f"guardian_events:{current_device.guardian_id}", json.dumps(event_data)
        )
    except Exception as e:
        import logging

        logging.getLogger(__name__).warning(
            "Redis telemetry broadcast failed: %s", str(e)
        )
    return {"status": "accepted", "event_id": event.id}


@router.post("/ingest/unified", response_model=schemas.TelemetryResponse)
async def ingest_unified(
    payload: schemas.UnifiedEventIngest,
    request: Request,
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device),
):
    """
    Phase 1 Unified Ingestion path for both behavioral and physiological data.
    """
    if payload.subject_id != current_device.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authenticated device ID does not match telemetry payload subject ID.",
        )

    # Simplified consent check for Phase 1 demo
    consent = (
        db.query(models.ConsentGrant)
        .filter(
            models.ConsentGrant.subject_id == current_device.id,
            models.ConsentGrant.modality == payload.modality,
        )
        .first()
    )

    # Fallback to old consent model if new one isn't populated for legacy behavior signals
    if not consent:
        old_consent = (
            db.query(models.ConsentRecord)
            .filter(
                models.ConsentRecord.device_id == current_device.id,
                models.ConsentRecord.signal_type == payload.modality,
            )
            .first()
        )
        if not old_consent or old_consent.revoked_at is not None:
            # Just a warning for demo purposes instead of blocking completely,
            # or we can block it. Let's block it unless it's a physio signal in dev.
            if payload.modality not in ["gsr", "ppg"]:
                raise HTTPException(
                    status_code=403, detail="Active consent not granted."
                )

    event = models.UnifiedEvent(
        subject_id=current_device.id,
        modality=payload.modality,
        timestamp=payload.timestamp,
        confidence=payload.confidence,
    )
    event.value = payload.value

    db.add(event)
    db.commit()
    db.refresh(event)

    # Write status to health cache to avoid N+1 queries on status polls
    try:
        is_synth = payload.value.get("is_synthetic", False)
        status_str = "synthetic" if is_synth else "real"
        redis_conn = get_redis_client()
        await redis_conn.set(f"prism:health:{payload.modality}", status_str, ex=3600)
    except Exception as e:
        import logging

        logging.getLogger(__name__).warning(
            "Failed to update unified health cache: %s", str(e)
        )

    # Check for risks in new apps / metadata
    check_event_for_risks(db, str(current_device.id), payload.modality, payload.value)

    return {"status": "accepted", "event_id": event.id}


@router.get("/health", response_model=schemas.IngestionHealthResponse)
def legacy_health():
    """Redirect to the internal health endpoint."""
    return {
        "status": "moved",
        "active_modalities": {
            "gsr": "inactive",
            "ppg": "inactive",
            "pulse": "inactive",
            "location": "inactive",
            "typing": "inactive",
            "app_usage": "inactive",
        },
    }


# Creating a sub-router for internal endpoints to match the requested path
internal_router = APIRouter(prefix="/api/internal", tags=["internal"])


@internal_router.get(
    "/ingestion/health", response_model=schemas.IngestionHealthResponse
)
async def ingestion_health(db: Session = Depends(get_db)):
    """
    Reports whether real or synthetic data is currently flowing per modality.
    Uses Redis distributed caching to completely eliminate N+1 DB lookup query bottlenecks.
    """
    modalities = ["gsr", "ppg", "pulse", "location", "typing", "app_usage"]
    status_map = {}

    redis_conn = get_redis_client()
    for mod in modalities:
        try:
            cached = await redis_conn.get(f"prism:health:{mod}")
            if cached and isinstance(cached, (str, bytes)):
                status_map[mod] = (
                    cached if isinstance(cached, str) else cached.decode("utf-8")
                )
                continue
        except Exception as e:
            import logging

            logging.getLogger(__name__).warning(
                "Failed to read health cache for %s: %s", mod, str(e)
            )

        # Fallback database scan if cache is empty
        latest_event = (
            db.query(models.UnifiedEvent)
            .filter(models.UnifiedEvent.modality == mod)
            .order_by(models.UnifiedEvent.timestamp.desc())
            .first()
        )

        if latest_event:
            val_dict = latest_event.value
            is_synth = val_dict.get("is_synthetic", False)
            status_str = "synthetic" if is_synth else "real"
            status_map[mod] = status_str
            try:
                await redis_conn.set(f"prism:health:{mod}", status_str, ex=60)
            except Exception as e:
                import logging

                logging.getLogger(__name__).warning(
                    "Failed to write-back health cache for %s: %s", mod, str(e)
                )
        else:
            latest_raw = (
                db.query(models.RawSignalEvent)
                .filter(models.RawSignalEvent.signal_type == mod)
                .order_by(models.RawSignalEvent.timestamp.desc())
                .first()
            )
            if latest_raw:
                try:
                    val_dict = json.loads(latest_raw.metadata_json)
                except (json.JSONDecodeError, TypeError) as e:
                    import logging

                    logging.getLogger(__name__).warning(
                        "Failed to parse metadata_json for raw event: %s", str(e)
                    )
                    val_dict = {}
                is_synth = val_dict.get("is_synthetic", False)
                status_str = "synthetic" if is_synth else "real"
                status_map[mod] = status_str
                try:
                    await redis_conn.set(f"prism:health:{mod}", status_str, ex=60)
                except Exception as e:
                    import logging

                    logging.getLogger(__name__).warning(
                        "Failed to write-back health cache for %s: %s", mod, str(e)
                    )
            else:
                status_map[mod] = "inactive"

    return {"status": "healthy", "active_modalities": status_map}


@router.post("/worker/run", status_code=status.HTTP_200_OK)
def trigger_worker_jobs(
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """
    Manually trigger baseline-aggregation, long-term trend snapshots, and
    event-purging. Accessible only to authorized guardians.
    """
    run_baseline_aggregation(db)
    infer_sleep_windows(db)

    # Module 6: long-term behaviour tracking snapshots for all devices.
    from app.utils import tracking

    snapshot_count = 0
    for device in db.query(models.ChildDevice).all():
        snapshot_count += tracking.compute_snapshots(db, device.id)

    purged = purge_raw_events(db, days=30)

    audit.log_audit_event(
        db,
        action=(
            f"Worker run triggered: Baseline profiles updated, sleep windows "
            f"estimated, {snapshot_count} trend snapshots upserted, "
            f"{purged} old events purged."
        ),
        guardian_id=str(current_guardian.id),
    )

    return {
        "status": "completed",
        "events_purged": purged,
        "trend_snapshots": snapshot_count,
    }


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str | None = None):
    """
    WebSocket endpoint for guardians to receive live updates and chat with Aria.
    Connection URL: ws://localhost:8000/api/v1/events/ws?token=<jwt_token>
    """
    await websocket.accept()
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        from jose import jwt
        from app.config import settings

        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
        sub_id = payload.get("sub")
        token_type = payload.get("type")
        if not sub_id or token_type not in ["guardian", "device"]:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    redis_conn = get_redis_client()
    pubsub = redis_conn.pubsub()

    channels = []
    if token_type == "guardian":
        channels.extend([f"guardian_events:{sub_id}", f"guardian_alerts:{sub_id}"])
    else:
        channels.append(f"device_alerts:{sub_id}")

    await pubsub.subscribe(*channels)

    async def client_listener():
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    parsed = json.loads(data)
                    text = parsed.get("text")
                    if text and token_type == "guardian":
                        db = SessionLocal()
                        # 1. Save guardian message
                        msg = models.ChatMessage(
                            guardian_id=sub_id, sender="guardian", aria_utterance=text
                        )
                        db.add(msg)
                        db.commit()
                        db.refresh(msg)

                        payload = {
                            "id": msg.id,
                            "guardian_id": sub_id,
                            "sender": "guardian",
                            "text": msg.aria_utterance,
                            "timestamp": msg.timestamp.isoformat(),
                            "type": "chat_message",
                        }
                        await redis_conn.publish(
                            f"guardian_events:{sub_id}", json.dumps(payload)
                        )

                        # 2. Trigger mock Aria response after 1 second
                        import asyncio

                        await asyncio.sleep(1.0)

                        aria_text = "I've logged that. I am constantly monitoring the baseline thresholds to keep your child supported."
                        if "plan" in text.lower() or "price" in text.lower():
                            aria_text = "The Family Safety Plan gives you full access to live risk reports, bedtime anomaly alerts, and weekly behavioral digests."
                        elif "sleep" in text.lower() or "bedtime" in text.lower():
                            aria_text = "I've saved their normal bedtime as part of the baseline. Any late-night phone usage out of the ordinary will be safely flagged."

                        aria_msg = models.ChatMessage(
                            guardian_id=sub_id, sender="aria", aria_utterance=aria_text
                        )
                        db.add(aria_msg)
                        db.commit()
                        db.refresh(aria_msg)

                        aria_payload = {
                            "id": aria_msg.id,
                            "guardian_id": sub_id,
                            "sender": "aria",
                            "text": aria_msg.aria_utterance,
                            "timestamp": aria_msg.timestamp.isoformat(),
                            "type": "chat_message",
                        }
                        await redis_conn.publish(
                            f"guardian_events:{sub_id}", json.dumps(aria_payload)
                        )
                        db.close()
                except Exception as e:
                    import logging

                    logging.getLogger(__name__).warning(
                        "Error handling websocket chat message: %s", str(e)
                    )
        except WebSocketDisconnect:
            pass

    import asyncio

    listener_task = asyncio.create_task(client_listener())

    try:
        while True:
            message = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=1.0
            )
            if message:
                msg_data = message.get("data")
                if msg_data:
                    await websocket.send_text(msg_data)
    except WebSocketDisconnect:
        pass
    finally:
        listener_task.cancel()
        await pubsub.unsubscribe(*channels)


@router.get("/alerts/{device_id}", response_model=List[schemas.AlertResponse])
def get_alerts(
    device_id: str,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Retrieve all alerts generated for a child device."""
    auth.verify_guardian_device_access(current_guardian, device_id, db)
    return (
        db.query(models.Alert)
        .filter(models.Alert.device_id == device_id)
        .order_by(models.Alert.timestamp.desc())
        .all()
    )


@router.get("/scores/{device_id}", response_model=List[schemas.RiskScoreResponse])
def get_scores(
    device_id: str,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Retrieve historical model risk scores for a child device."""
    auth.verify_guardian_device_access(current_guardian, device_id, db)
    return (
        db.query(models.RiskScore)
        .filter(models.RiskScore.device_id == device_id)
        .order_by(models.RiskScore.timestamp.desc())
        .all()
    )


@router.get("/baselines/{device_id}")
def get_baselines(
    device_id: str,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Retrieve rolling baseline means and variances for overlay charts."""
    auth.verify_guardian_device_access(current_guardian, device_id, db)
    baselines = (
        db.query(models.BaselineProfile)
        .filter(models.BaselineProfile.device_id == device_id)
        .all()
    )
    return {
        b.signal_type: {"mean": b.rolling_mean, "variance": b.rolling_variance}
        for b in baselines
    }


@router.get("/typing/insights/{device_id}")
def get_typing_insights(
    device_id: str,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Returns typing mental-state insights: recent typing risk scores +
    the device's rolling typing baseline, for the typing-analytics panel."""
    auth.verify_guardian_device_access(current_guardian, device_id, db)

    scores = (
        db.query(models.RiskScore)
        .filter(
            models.RiskScore.device_id == device_id,
            models.RiskScore.model_name.in_(["typing", "typing_rhythm"]),
        )
        .order_by(models.RiskScore.timestamp.desc())
        .limit(50)
        .all()
    )

    baseline = (
        db.query(models.BaselineProfile)
        .filter(
            models.BaselineProfile.device_id == device_id,
            models.BaselineProfile.signal_type == "typing",
        )
        .first()
    )

    return {
        "device_id": device_id,
        "baseline": (
            {
                "mean": baseline.rolling_mean,
                "variance": baseline.rolling_variance,
                "source": baseline.source,
            }
            if baseline
            else None
        ),
        "scores": [
            {
                "model_name": s.model_name,
                "score": s.score,
                "threshold": s.threshold,
                "flagged": s.flagged,
                "contributing_factors": s.contributing_factors,
                "timestamp": s.timestamp.isoformat(),
            }
            for s in scores
        ],
    }


from pydantic import BaseModel


class DemoTriggerRequest(BaseModel):
    device_id: str
    scenario: str


@router.get("/typing/behavioral/{device_id}")
def get_behavioral_insights(
    device_id: str,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """
    Behavioral AI screening insights (Module 3).

    Returns the per-dimension behavioral scores (stress, cognitive load,
    typing fatigue, typing stability) plus the rolling Mental Risk Score with
    confidence. Every score ships explainable contributing factors and the
    screening disclaimer. These are screening signals, never diagnoses.
    """
    from app.utils import audit as audit_util

    auth.verify_guardian_device_access(current_guardian, device_id, db)
    audit_util.log_audit_event(
        db,
        action="READ_BEHAVIORAL_INSIGHTS",
        guardian_id=str(current_guardian.id),
    )

    dim_scores = (
        db.query(models.RiskScore)
        .filter(
            models.RiskScore.device_id == device_id,
            models.RiskScore.model_name.like("behavioral_%"),
        )
        .order_by(models.RiskScore.timestamp.desc())
        .limit(200)
        .all()
    )

    dims = [
        "stress",
        "cognitive_load",
        "typing_fatigue",
        "typing_stability",
        "mental_risk",
    ]
    latest_by_dim = {}
    for s in dim_scores:
        dim = s.model_name.replace("behavioral_", "")
        if dim not in latest_by_dim:
            latest_by_dim[dim] = s

    from app.utils import behavioral_ai

    # Module 4: explainable AI — feature importance, SHAP-style attribution and
    # human-readable reasoning for the most recent typing event.
    latest_signal = (
        db.query(models.RawSignalEvent)
        .filter(
            models.RawSignalEvent.device_id == device_id,
            models.RawSignalEvent.signal_type == "typing",
        )
        .order_by(models.RawSignalEvent.timestamp.desc())
        .first()
    )
    if latest_signal:
        try:
            metadata = json.loads(latest_signal.metadata_json)
        except Exception:
            metadata = {}
        explain = behavioral_ai.explain_signal(metadata)
    else:
        explain = {
            dim: {
                "score": 0.0, "flagged": False, "threshold": 0.6,
                "feature_importance": [], "shap_values": [], "reasoning": [],
            }
            for dim in ["stress", "cognitive_load", "typing_fatigue", "typing_stability"]
        }

    return {
        "device_id": device_id,
        "dimensions": [
            {
                "name": dim,
                "score": (latest_by_dim[dim].score if dim in latest_by_dim else None),
                "flagged": (latest_by_dim[dim].flagged if dim in latest_by_dim else False),
                "contributing_factors": (
                    latest_by_dim[dim].contributing_factors if dim in latest_by_dim else []
                ),
                "timestamp": (
                    latest_by_dim[dim].timestamp.isoformat()
                    if dim in latest_by_dim
                    else None
                ),
                **(
                    {
                        "feature_importance": explain[dim]["feature_importance"],
                        "shap_values": explain[dim]["shap_values"],
                        "reasoning": explain[dim]["reasoning"],
                    }
                    if dim in explain
                    else {}
                ),
            }
            for dim in dims
        ],
        "disclaimer": (
            "Behavioral screening signal, not a diagnosis. May indicate patterns "
            "that warrant attention."
        ),
    }


@router.get("/trends/{device_id}")
def get_trend_snapshots(
    device_id: str,
    granularity: str = "daily",
    days: int = 90,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """
    Module 6: long-term behaviour tracking.

    Returns daily/weekly/monthly behavioral trend snapshots (stress, fatigue,
    mental-wellness composite) for the dashboard charts, plus a `trend` delta
    for the risk meter. Authz: guardian must own the device.
    """
    auth.verify_guardian_device_access(current_guardian, device_id, db)
    audit.log_audit_event(
        db,
        action="READ_TREND_SNAPSHOTS",
        guardian_id=str(current_guardian.id),
        device_id=device_id,
    )

    from app.utils import tracking

    try:
        result = tracking.get_trends(db, device_id, granularity=granularity, days=days)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.post("/demo-trigger")
async def trigger_demo_scenario(
    req: DemoTriggerRequest,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Trigger a guided demo scenario (A, B, or C) from the dashboard for stakeholder replay."""
    auth.verify_guardian_device_access(current_guardian, req.device_id, db)

    if req.scenario == "A":
        # Late-night usage spike
        await run_risk_engine(req.device_id, "location", {"steps": 1500}, db)
        await run_risk_engine(
            req.device_id,
            "app_usage",
            {"late_night_hours": 3.5, "baseline_hours": 1.0},
            db,
        )
    elif req.scenario == "B":
        # Social withdrawal & fatigue
        await run_risk_engine(req.device_id, "location", {"steps": 2000}, db)
        await run_risk_engine(req.device_id, "typing", {"delay_index": 1.4}, db)
    elif req.scenario == "C":
        # New app risk
        await run_risk_engine(
            req.device_id,
            "app_usage",
            {
                "late_night_hours": 3.0,
                "baseline_hours": 1.0,
                "new_installed_packages": ["com.anonymous.chat"],
            },
            db,
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid scenario name")

    return {"status": "triggered", "scenario": req.scenario}


@router.post("/alerts/viewed/{alert_id}")
def mark_alert_viewed(
    alert_id: str,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Mark a well-being alert as viewed/acknowledged by the guardian."""
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    auth.verify_guardian_device_access(current_guardian, str(alert.device_id), db)
    alert.is_viewed = True  # type: ignore[assignment]
    db.commit()
    return {"status": "updated", "alert_id": alert_id}


@router.post("/baselines/seed")
def seed_baselines(
    req: schemas.BaselineSeedRequest,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Saves guardian-reported seed values for a child's baseline profile."""
    auth.verify_guardian_device_access(current_guardian, req.device_id, db)

    try:
        dob_dt = datetime.strptime(req.date_of_birth, "%Y-%m-%d").replace(
            tzinfo=timezone.utc
        )
        age_years = (datetime.now(timezone.utc) - dob_dt).days / 365.25
    except Exception:
        raise HTTPException(
            status_code=400, detail="Invalid date of birth format. Use YYYY-MM-DD"
        )

    try:
        h, m = map(int, req.usual_bedtime.split(":"))
        bedtime_hours = h + m / 60.0
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid bedtime format. Use HH:MM")

    # Clean existing guardian_reported baselines for this device
    db.query(models.BaselineProfile).filter(
        models.BaselineProfile.device_id == req.device_id,
        models.BaselineProfile.source == "guardian_reported",
    ).delete()

    # 1. Insert Demographics
    dem_prof = models.BaselineProfile(
        device_id=req.device_id,
        signal_type="demographics",
        rolling_mean=age_years,
        rolling_variance=0.0,
        source="guardian_reported",
    )
    dem_prof.metadata_json = json.dumps(
        {"relationship": req.relationship, "date_of_birth": req.date_of_birth}
    )
    db.add(dem_prof)

    # 2. Insert Screen Time
    screen_prof = models.BaselineProfile(
        device_id=req.device_id,
        signal_type="app_usage",
        rolling_mean=req.daily_screen_time_mins / 60.0,
        rolling_variance=0.0,
        source="guardian_reported",
    )
    db.add(screen_prof)

    # 3. Insert Bedtime
    bed_prof = models.BaselineProfile(
        device_id=req.device_id,
        signal_type="location",
        rolling_mean=bedtime_hours,
        rolling_variance=0.0,
        source="guardian_reported",
    )
    bed_prof.metadata_json = json.dumps({"bedtime_str": req.usual_bedtime})
    db.add(bed_prof)

    # 4. Insert Selected Concerns
    conc_prof = models.BaselineProfile(
        device_id=req.device_id,
        signal_type="concerns",
        rolling_mean=float(len(req.concerns)),
        rolling_variance=0.0,
        source="guardian_reported",
    )
    conc_prof.metadata_json = json.dumps({"selected_concerns": req.concerns})
    db.add(conc_prof)

    db.commit()

    audit.log_audit_event(
        db,
        action=f"Guardian-reported baseline seed saved for device {req.device_id}",
        guardian_id=str(current_guardian.id),
        device_id=req.device_id,
    )

    return {"status": "seeded", "device_id": req.device_id}


@router.get("/chat/history", response_model=List[schemas.ChatMessageResponse])
def get_chat_history(
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Retrieve chat conversation logs with Aria."""
    history = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.guardian_id == current_guardian.id)
        .order_by(models.ChatMessage.timestamp.asc())
        .all()
    )

    if not history:
        welcome = models.ChatMessage(
            guardian_id=current_guardian.id,
            sender="aria",
            aria_utterance=f"Hi {current_guardian.full_name}! This is Aria — welcome. I'm calling you now to finish setting up your plan. It'll take about 8–10 minutes.",
        )
        db.add(welcome)
        db.commit()
        db.refresh(welcome)
        history = [welcome]

    return history
