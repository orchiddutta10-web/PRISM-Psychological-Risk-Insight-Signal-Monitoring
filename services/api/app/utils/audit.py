from sqlalchemy.orm import Session

from app import models


def log_audit_event(
    db: Session,
    action: str,
    guardian_id: str | None = None,
    device_id: str | None = None,
    ip_address: str | None = None,
):
    """
    Writes an entry to the immutable audit log.
    Accepts `guardian_id` and `device_id` to match the AuditLog model.
    """
    audit_entry = models.AuditLog(
        guardian_id=guardian_id,
        device_id=device_id,
        action=action,
        ip_address=ip_address,
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(audit_entry)
    return audit_entry
