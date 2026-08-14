import json
import math

from sqlalchemy.orm import Session

from app import models
from app.utils.redis_client import get_redis_client


async def publish_alert_to_websockets(guardian_id: str, alert_data: dict):
    """Broadcasts an alert in real-time to the guardian's WebSocket channel and child's device channel."""
    try:
        redis_conn = get_redis_client()
        await redis_conn.publish(
            f"guardian_alerts:{guardian_id}", json.dumps(alert_data)
        )
        await redis_conn.publish(
            f"device_alerts:{alert_data['device_id']}", json.dumps(alert_data)
        )

        # Also publish to the main events channel for activity feeds
        await redis_conn.publish(
            f"guardian_events:{guardian_id}",
            json.dumps(
                {
                    "event_id": alert_data["id"],
                    "device_id": alert_data["device_id"],
                    "device_name": alert_data.get("device_name", "Device"),
                    "signal_type": "alert",
                    "timestamp": alert_data["timestamp"],
                    "metadata": {
                        "severity": alert_data["severity_tier"],
                        "summary": alert_data["plain_language_summary"],
                    },
                }
            ),
        )
    except Exception as e:
        import logging

        logging.getLogger(__name__).warning("Redis publish failed: %s", str(e))


def evaluate_mobility_model(
    device_id: str, metadata: dict, db: Session
) -> models.RiskScore:
    """
    Mobility Pattern Model: K-Means clustering.
    Centroids: Active (15,000 steps/day), Homebound (2,000 steps/day).
    Minimizes sum of squared distances: ||x - mu||^2
    """
    steps = float(metadata.get("steps", 10000))

    active_centroid = 15000.0
    homebound_centroid = 2000.0

    d_active = (steps - active_centroid) ** 2
    d_homebound = (steps - homebound_centroid) ** 2

    is_homebound = d_homebound < d_active

    # Anomaly score based on proximity to homebound centroid
    score = 1.0 - (abs(steps - homebound_centroid) / 15000.0)
    score = max(0.0, min(1.0, score))

    threshold = 0.8
    flagged = is_homebound and (steps < 4000)

    factors = []
    if flagged:
        factors.append(
            f"Daily movement dropped to {int(steps)} steps (baseline centroid: 15,000 steps)"
        )

    risk_score = models.RiskScore(
        device_id=device_id,
        model_name="mobility",
        score=score,
        threshold=threshold,
        flagged=flagged,
    )
    risk_score.contributing_factors = factors
    db.add(risk_score)
    return risk_score


def evaluate_typing_model(
    device_id: str, metadata: dict, db: Session
) -> models.RiskScore:
    """
    Typing Proxy Model: Logistic Regression.
    z = w_1 * delay_index + w_2 * correction_rate_variance + b
    Probability of deviation = Sigmoid(z) = 1 / (1 + e^-z)
    """
    delay_index = float(metadata.get("delay_index", 1.0))
    correction_var = float(metadata.get("correction_rate_variance", 0.0))

    # Calibrated weights
    w1 = 15.0
    w2 = 2.0
    b = -4.0

    z = w1 * (delay_index - 1.0) + w2 * correction_var + b
    prob = 1.0 / (1.0 + math.exp(-z))

    threshold = 0.5
    flagged = prob > threshold

    factors = []
    if flagged:
        pct_increase = round((delay_index - 1.0) * 100)
        factors.append(f"Keystroke delay index increased by {pct_increase}%")

    risk_score = models.RiskScore(
        device_id=device_id,
        model_name="typing",
        score=prob,
        threshold=threshold,
        flagged=flagged,
    )
    risk_score.contributing_factors = factors
    db.add(risk_score)
    return risk_score


def evaluate_app_usage_model(
    device_id: str, metadata: dict, db: Session
) -> models.RiskScore:
    """
    App Usage Anomaly Model: Isolation Forest style contextual outlier detector.
    Score = 1 - 2^(- (usage_hours / baseline_hours))
    Flagged if Score > 0.6
    """
    usage_hours = float(metadata.get("late_night_hours", 0.0))
    baseline_hours = float(metadata.get("baseline_hours", 1.0))

    if baseline_hours <= 0:
        baseline_hours = 1.0

    score = 1.0 - (2.0 ** (-(usage_hours / baseline_hours)))
    score = max(0.0, min(1.0, score))

    threshold = 0.6
    flagged = score > threshold

    factors = []
    if flagged:
        factors.append(
            f"Late-night app usage rose to {usage_hours:.1f}h (baseline: {baseline_hours:.1f}h)"
        )

    risk_score = models.RiskScore(
        device_id=device_id,
        model_name="app_usage",
        score=score,
        threshold=threshold,
        flagged=flagged,
    )
    risk_score.contributing_factors = factors
    db.add(risk_score)
    return risk_score


_risk_registry_cache = None


def _get_risk_registry(db: Session) -> list:
    """Loads the RiskRegistry once per process (seeded only at startup)."""
    global _risk_registry_cache
    if _risk_registry_cache is None:
        _risk_registry_cache = (
            db.query(models.RiskRegistry)
            .filter(models.RiskRegistry.match_type == "package_name")
            .all()
        )
    return _risk_registry_cache


def refresh_risk_registry_cache():
    """Invalidates the cached registry (call after admin updates to the table)."""
    global _risk_registry_cache
    _risk_registry_cache = None


def evaluate_risk_signatures(
    device_id: str, metadata: dict, db: Session
) -> models.RiskScore:
    """
    Risk Signatures: Deterministic registry lookup using database-driven RiskRegistry.
    Checks installed app packages against the safety RiskRegistry.
    """
    installed_apps = metadata.get("new_installed_packages", [])

    registry = _get_risk_registry(db)

    found_risky = []
    for app_pkg in installed_apps:
        for reg in registry:
            if reg.match_value in app_pkg.lower():
                found_risky.append((app_pkg, reg))
                break

    flagged = len(found_risky) > 0
    score = 1.0 if flagged else 0.0
    threshold = 0.5

    factors = []
    if flagged:
        for app, reg in found_risky:
            factors.append(f"Installed risky app: {app}")
            # Log hit in the database
            hit = models.RiskRegistryHit(
                subject_id=device_id,
                registry_id=reg.id,
                category=reg.category,
                severity=reg.severity,
            )
            db.add(hit)

    risk_score = models.RiskScore(
        device_id=device_id,
        model_name="signatures",
        score=score,
        threshold=threshold,
        flagged=flagged,
    )
    risk_score.contributing_factors = factors
    db.add(risk_score)
    return risk_score


def evaluate_pulse_model(
    device_id: str, metadata: dict, db: Session
) -> models.RiskScore:
    """
    PRISM PULSE Multi-Factor Model: flags when the ESP32 node reports a
    warning/trigger (e.g. ISD_TRIGGERED). High BPM + low movement is the
    multi-factor crisis gate on the firmware.
    """
    status = metadata.get("alert_status", "OK")
    bpm = float(metadata.get("bpm", 0))
    g_force = float(metadata.get("g_force", 0))
    flagged = status != "OK"
    score = 1.0 if flagged else 0.0
    threshold = 0.5

    factors = []
    if flagged:
        factors.append(
            f"Multi-factor pulse alert: BPM {bpm:.0f}, G-force {g_force:.2f}g, status {status}"
        )

    risk_score = models.RiskScore(
        device_id=device_id,
        model_name="pulse",
        score=score,
        threshold=threshold,
        flagged=flagged,
    )
    risk_score.contributing_factors = factors
    db.add(risk_score)
    return risk_score


async def run_risk_engine(
    device_id: str, signal_type: str, metadata: dict, db: Session
):
    """Executes models based on ingested signal and updates the Alerts table."""
    if signal_type == "location":
        evaluate_mobility_model(device_id, metadata, db)
    elif signal_type == "typing":
        evaluate_typing_model(device_id, metadata, db)
    elif signal_type == "app_usage":
        if "new_installed_packages" in metadata:
            evaluate_risk_signatures(device_id, metadata, db)
        evaluate_app_usage_model(device_id, metadata, db)
    elif signal_type == "pulse":
        evaluate_pulse_model(device_id, metadata, db)

    # Make the just-added RiskScores visible to the aggregation query, then
    # persist everything (scores + alerts) in a single transaction.
    db.flush()
    await aggregate_alerts(device_id, db)
    db.commit()


async def aggregate_alerts(device_id: str, db: Session):
    """Aggregates scores and writes any generated alerts to PostgreSQL."""
    models_list = ["mobility", "typing", "app_usage", "signatures", "pulse"]
    latest_scores = []

    # Fetch the latest score per model in ONE query (ordered by model + timestamp desc,
    # deduped to the first-seen = newest per model). Avoids the previous N+1.
    latest_rows = (
        db.query(
            models.RiskScore.model_name,
            models.RiskScore.timestamp,
        )
        .filter(models.RiskScore.device_id == device_id)
        .order_by(
            models.RiskScore.model_name,
            models.RiskScore.timestamp.desc(),
        )
        .all()
    )
    newest_ts_per_model = {}
    for model_name, ts in latest_rows:
        if model_name not in newest_ts_per_model:
            newest_ts_per_model[model_name] = ts

    if newest_ts_per_model:
        score_recs = (
            db.query(models.RiskScore)
            .filter(
                models.RiskScore.device_id == device_id,
                models.RiskScore.model_name.in_(list(newest_ts_per_model.keys())),
            )
            .all()
        )
        by_model_ts = {}
        for s in score_recs:
            key = (s.model_name, s.timestamp)
            by_model_ts[key] = s
        for model_name in models_list:
            ts = newest_ts_per_model.get(model_name)
            if ts is not None:
                rec = by_model_ts.get((model_name, ts))
                if rec is not None:
                    latest_scores.append(rec)

    flagged_scores = [s for s in latest_scores if s.flagged]

    if not flagged_scores:
        return

    factors = []
    for s in flagged_scores:
        factors.extend(s.contributing_factors)

    num_flags = len(flagged_scores)

    is_app_usage_flagged = any(s.model_name == "app_usage" for s in flagged_scores)
    is_signatures_flagged = any(s.model_name == "signatures" for s in flagged_scores)
    is_mobility_flagged = any(s.model_name == "mobility" for s in flagged_scores)
    is_typing_flagged = any(s.model_name == "typing" for s in flagged_scores)

    severity = "sage"
    summary = "System normal. Behavioral metrics aligned with baseline."

    if num_flags >= 2:
        severity = "red"
        if is_app_usage_flagged and is_mobility_flagged:
            summary = "Late-night usage spike detected with low mobility."
        elif is_mobility_flagged and is_typing_flagged:
            summary = "Social withdrawal and fatigue patterns co-detected."
        elif is_signatures_flagged and is_app_usage_flagged:
            summary = "Unsafe anonymous chat installation with overnight usage surge."
        else:
            summary = "Multiple behavioral deviations detected simultaneously."
    elif num_flags == 1:
        severity = "amber"
        flagged_model = flagged_scores[0].model_name
        if flagged_model == "app_usage":
            summary = "Deviation in evening app screen time baseline."
        elif flagged_model == "typing":
            summary = "Minor variation in typing delay index."
        elif flagged_model == "mobility":
            summary = "Reduction in daily active travel patterns."
        elif flagged_model == "signatures":
            summary = "Potentially risky app package installation detected."
        elif flagged_model == "pulse":
            summary = "Multi-factor physiological alert from the PRISM PULSE node."

    device = (
        db.query(models.ChildDevice).filter(models.ChildDevice.id == device_id).first()
    )
    if not device:
        return

    alert = models.Alert(
        device_id=device_id, severity_tier=severity, plain_language_summary=summary
    )
    alert.contributing_factors = factors
    db.add(alert)
    # Flush so the default timestamp is populated for the payload without
    # committing (the single commit happens in run_risk_engine).
    db.flush()

    alert_payload = {
        "id": alert.id,
        "device_id": device_id,
        "device_name": device.name,
        "severity_tier": severity,
        "plain_language_summary": summary,
        "contributing_factors": factors,
        "timestamp": alert.timestamp.isoformat(),
    }
    await publish_alert_to_websockets(str(device.guardian_id), alert_payload)
