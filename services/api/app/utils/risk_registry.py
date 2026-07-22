from sqlalchemy.orm import Session
from app import models
import logging

logger = logging.getLogger(__name__)

INITIAL_SEED = [
    # Anonymous Chat Apps (package_name)
    {
        "category": "anonymous-chat-app",
        "match_type": "package_name",
        "match_value": "com.monkey.android",
        "severity": "high"
    },
    {
        "category": "anonymous-chat-app",
        "match_type": "package_name",
        "match_value": "com.anonymous.chat",
        "severity": "high"
    },
    {
        "category": "anonymous-chat-app",
        "match_type": "package_name",
        "match_value": "com.ometv.android",
        "severity": "high"
    },
    {
        "category": "anonymous-chat-app",
        "match_type": "package_name",
        "match_value": "com.yubo.android",
        "severity": "high"
    },
    {
        "category": "anonymous-chat-app",
        "match_type": "package_name",
        "match_value": "com.whisper.android",
        "severity": "high"
    },
    {
        "category": "anonymous-chat-app",
        "match_type": "package_name",
        "match_value": "com.kik.android",
        "severity": "high"
    },
    {
        "category": "anonymous-chat-app",
        "match_type": "package_name",
        "match_value": "com.anonchat.android",
        "severity": "high"
    },
    
    # Self-Harm/Extreme Challenges (keyword)
    {
        "category": "extreme-challenge-content",
        "match_type": "keyword",
        "match_value": "choking challenge",
        "severity": "critical"
    },
    {
        "category": "extreme-challenge-content",
        "match_type": "keyword",
        "match_value": "tide pod challenge",
        "severity": "critical"
    },
    {
        "category": "extreme-challenge-content",
        "match_type": "keyword",
        "match_value": "blue whale challenge",
        "severity": "critical"
    },
    {
        "category": "self-harm-adjacent-trend",
        "match_type": "keyword",
        "match_value": "how to cut",
        "severity": "critical"
    },
    {
        "category": "self-harm-adjacent-trend",
        "match_type": "domain",
        "match_value": "selfharmforum.com",
        "severity": "critical"
    }
]

def seed_registry(db: Session):
    """Ensure the risk registry has the initial static seed data."""
    if db.query(models.RiskRegistry).count() == 0:
        for item in INITIAL_SEED:
            entry = models.RiskRegistry(
                category=item["category"],
                match_type=item["match_type"],
                match_value=item["match_value"],
                severity=item["severity"]
            )
            db.add(entry)
        db.commit()
        logger.info("Risk Registry seeded with initial static list.")

def check_event_for_risks(db: Session, device_id: str, modality: str, value: dict):
    """
    Checks incoming telemetry against the Risk Registry.
    Supports app_usage package name matches and browse_metadata keyword/domain matches.
    Generates a RiskRegistryHit and an Alert if a match is found.
    """
    registry_entries = db.query(models.RiskRegistry).all()
    
    if modality == "app_usage":
        installed_apps = value.get("new_installed_packages", [])
        for app in installed_apps:
            for reg in registry_entries:
                if reg.match_type == "package_name" and reg.match_value in app.lower():
                    # Create hit linked to the registry entry
                    hit = models.RiskRegistryHit(
                        subject_id=device_id,
                        registry_id=reg.id,
                        category=reg.category,
                        severity=reg.severity
                    )
                    db.add(hit)
                    
                    # Generate conversational, descriptive, and non-diagnostic alert
                    alert = models.Alert(
                        device_id=device_id,
                        severity_tier="amber" if reg.severity == "medium" else "red",
                        plain_language_summary=f"New app in category '{reg.category.replace('-', ' ')}' installed recently."
                    )
                    alert.contributing_factors = [
                        f"Detected package '{app}' which matches signature in the safety registry."
                    ]
                    db.add(alert)
        db.commit()

    elif modality == "browse_metadata":
        search_query = value.get("search_query", "")
        url = value.get("url", "")
        
        for reg in registry_entries:
            matched = False
            if reg.match_type == "keyword" and reg.match_value in search_query.lower():
                matched = True
            elif reg.match_type == "domain" and reg.match_value in url.lower():
                matched = True
                
            if matched:
                hit = models.RiskRegistryHit(
                    subject_id=device_id,
                    registry_id=reg.id,
                    category=reg.category,
                    severity=reg.severity
                )
                db.add(hit)
                
                # Descriptive, non-diagnostic alert
                alert = models.Alert(
                    device_id=device_id,
                    severity_tier="red" if reg.severity == "critical" else "amber",
                    plain_language_summary=f"Browsing activity matching safety category '{reg.category.replace('-', ' ')}'."
                )
                alert.contributing_factors = [
                    f"Metadata matched category '{reg.category}' via safety registry reference."
                ]
                db.add(alert)
        db.commit()

