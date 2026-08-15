from sqlalchemy.orm import Session
from datetime import datetime, timezone
import hashlib
import json

from typing import Optional

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


def compute_entry_hash(
    prev_hash: Optional[str],
    actor_id: Optional[str],
    action: str,
    resource: str,
    timestamp: datetime,
    context: dict,
) -> str:
    """SHA-256 over a canonical form of the entry fields (key-independent).

    The timestamp is normalized to UTC-naive so the hash matches regardless of
    whether the datetime was tz-aware at write time or tz-naive after SQLite
    round-tripping.
    """
    if timestamp.tzinfo is not None:
        timestamp = timestamp.astimezone(timezone.utc).replace(tzinfo=None)
    canonical = json.dumps(
        {
            "prev_hash": prev_hash,
            "actor_id": actor_id,
            "action": action,
            "resource": resource,
            "timestamp": timestamp.isoformat(),
            "context": context,
        },
        sort_keys=True,
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def verify_audit_chain(db: Session) -> tuple:
    """Verifies the hash chain of all AuditLogEntry rows.

    Returns (ok, broken_indices): ok is True when every entry's prev_hash matches the
    previous entry_hash and every entry_hash matches a recompute over its fields.
    """
    entries = (
        db.query(models.AuditLogEntry)
        .order_by(
            models.AuditLogEntry.timestamp.asc(),
            models.AuditLogEntry.id.asc(),
        )
        .all()
    )
    prev_hash = None
    broken = []
    for i, e in enumerate(entries):
        if e.prev_hash != prev_hash:
            broken.append(i)
        expected = compute_entry_hash(
            e.prev_hash, e.actor_id, e.action, e.resource, e.timestamp, e.context
        )
        if e.entry_hash != expected:
            broken.append(i)
        prev_hash = e.entry_hash
    return (len(broken) == 0, broken)
