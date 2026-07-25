import json
import math
from datetime import datetime
from sqlalchemy.orm import Session
from app import models
from app.utils.redis_client import get_redis_client


async def publish_alert_to_websockets(guardian_id: str, alert_data: dict):
    """Broadcasts an alert in real-time to the guardian's WebSocket channel and child's device channel."""
    try:
        redis_conn = get_redis_client()
        await redis_conn.publish(f"guardian_alerts:{guardian_id}", json.dumps(alert_data))
        await redis_conn.publish(f"device_alerts:{alert_data['device_id']}", json.dumps(alert_data))

        # Also publish to the main events channel for activity feeds
        await redis_conn.publish(f"guardian_events:{guardian_id}", json.dumps({
            "event_id": alert_data["id"],
            "device_id": alert_data["device_id"],
            "device_name": alert_data.get("device_name", "Device"),
            "signal_type": "alert",
            "timestamp": alert_data["timestamp"],
            "metadata": {
                "severity": alert_data["severity_tier"],
                "summary": alert_data["plain_language_summary"]
            }
        }))
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Redis publish failed: %s", str(e))

def evaluate_mobility_model(device_id: str, metadata: dict, db: Session) -> models.RiskScore:
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
        factors.append(f"Daily movement dropped to {int(steps)} steps (baseline centroid: 15,000 steps)")
        
    risk_score = models.RiskScore(
        device_id=device_id,
        model_name="mobility",
        score=score,
        threshold=threshold,
        flagged=flagged
    )
    risk_score.contributing_factors = factors
    db.add(risk_score)
    db.commit()
    db.refresh(risk_score)
    return risk_score

def evaluate_typing_model(device_id: str, metadata: dict, db: Session) -> models.RiskScore:
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
        flagged=flagged
    )
    risk_score.contributing_factors = factors
    db.add(risk_score)
    db.commit()
    db.refresh(risk_score)
    return risk_score

def evaluate_app_usage_model(device_id: str, metadata: dict, db: Session) -> models.RiskScore:
    """
    App Usage Anomaly Model: Isolation Forest style contextual outlier detector.
    Score = 1 - 2^(- (usage_hours / baseline_hours))
    Flagged if Score > 0.6
    """
    usage_hours = float(metadata.get("late_night_hours", 0.0))
    baseline_hours = float(metadata.get("baseline_hours", 1.0))
    
    if baseline_hours <= 0:
        baseline_hours = 1.0
        
    score = 1.0 - (2.0 ** (- (usage_hours / baseline_hours)))
    score = max(0.0, min(1.0, score))
    
    threshold = 0.6
    flagged = score > threshold
    
    factors = []
    if flagged:
        factors.append(f"Late-night app usage rose to {usage_hours:.1f}h (baseline: {baseline_hours:.1f}h)")
        
    risk_score = models.RiskScore(
        device_id=device_id,
        model_name="app_usage",
        score=score,
        threshold=threshold,
        flagged=flagged
    )
    risk_score.contributing_factors = factors
    db.add(risk_score)
    db.commit()
    db.refresh(risk_score)
    return risk_score

def evaluate_risk_signatures(device_id: str, metadata: dict, db: Session) -> models.RiskScore:
    """
    Risk Signatures: Deterministic registry lookup using database-driven RiskRegistry.
    Checks installed app packages against the safety RiskRegistry.
    """
    installed_apps = metadata.get("new_installed_packages", [])
    
    registry = db.query(models.RiskRegistry).filter(models.RiskRegistry.match_type == "package_name").all()
    
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
                severity=reg.severity
            )
            db.add(hit)
            
    risk_score = models.RiskScore(
        device_id=device_id,
        model_name="signatures",
        score=score,
        threshold=threshold,
        flagged=flagged
    )
    risk_score.contributing_factors = factors
    db.add(risk_score)
    db.commit()
    db.refresh(risk_score)
    return risk_score

async def run_risk_engine(device_id: str, signal_type: str, metadata: dict, db: Session):
    """Executes models based on ingested signal and updates the Alerts table."""
    if signal_type == "location":
        evaluate_mobility_model(device_id, metadata, db)
    elif signal_type == "typing":
        evaluate_typing_model(device_id, metadata, db)
    elif signal_type == "app_usage":
        if "new_installed_packages" in metadata:
            evaluate_risk_signatures(device_id, metadata, db)
        evaluate_app_usage_model(device_id, metadata, db)
        
    await aggregate_alerts(device_id, db)

async def aggregate_alerts(device_id: str, db: Session):
    """Aggregates scores and writes any generated alerts to PostgreSQL."""
    models_list = ["mobility", "typing", "app_usage", "signatures"]
    latest_scores = []
    
    for m in models_list:
        score_rec = db.query(models.RiskScore).filter(
            models.RiskScore.device_id == device_id,
            models.RiskScore.model_name == m
        ).order_by(models.RiskScore.timestamp.desc()).first()
        if score_rec:
            latest_scores.append(score_rec)
            
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
            
    device = db.query(models.ChildDevice).filter(models.ChildDevice.id == device_id).first()
    if not device:
        return
        
    alert = models.Alert(
        device_id=device_id,
        severity_tier=severity,
        plain_language_summary=summary
    )
    alert.contributing_factors = factors
    db.add(alert)
    db.commit()
    db.refresh(alert)
    
    alert_payload = {
        "id": alert.id,
        "device_id": device_id,
        "device_name": device.name,
        "severity_tier": severity,
        "plain_language_summary": summary,
        "contributing_factors": factors,
        "timestamp": alert.timestamp.isoformat()
    }
    await publish_alert_to_websockets(device.guardian_id, alert_payload)
