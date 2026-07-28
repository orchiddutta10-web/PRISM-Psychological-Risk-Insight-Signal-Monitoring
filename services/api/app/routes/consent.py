from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.utils import audit, auth

router = APIRouter(prefix="/api/v1/consent", tags=["consent"])


class ConsentGrantCreate(BaseModel):
    modality: str
    is_granted: bool


@router.post("", response_model=schemas.ConsentRecordResponse)
def record_or_update_consent(
    consent_in: schemas.ConsentRecordCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_device: models.ChildDevice = Depends(auth.get_current_device),
):
    """
    Record or update consent for a specific signal type.
    Must be authenticated as the ChildDevice itself.
    """
    record = (
        db.query(models.ConsentRecord)
        .filter(
            models.ConsentRecord.device_id == current_device.id,
            models.ConsentRecord.signal_type == consent_in.signal_type,
        )
        .first()
    )

    action = "granted" if consent_in.granted else "revoked"

    if not record:
        record = models.ConsentRecord(
            device_id=current_device.id,
            signal_type=consent_in.signal_type,
            consent_copy_version=consent_in.consent_copy_version,
        )
        db.add(record)

    record.consent_copy_version = consent_in.consent_copy_version
    if consent_in.granted:
        record.granted_at = datetime.now(timezone.utc)
        record.revoked_at = None
    else:
        if record.revoked_at is None:
            record.revoked_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(record)

    audit.log_audit_event(
        db,
        action=f"Consent {action} for signal type '{consent_in.signal_type}' (version {consent_in.consent_copy_version})",
        device_id=current_device.id,
        guardian_id=current_device.guardian_id,
        ip_address=request.client.host if request.client else None,
    )

    return record


@router.get("/{device_id}", response_model=list[schemas.ConsentRecordResponse])
def get_consent_records(
    device_id: str,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """
    Retrieve all consent records for a child device.
    Only the authorized Guardian can query these.
    """
    auth.verify_guardian_device_access(current_guardian, device_id, db)

    records = (
        db.query(models.ConsentRecord)
        .filter(models.ConsentRecord.device_id == device_id)
        .all()
    )

    return records


@router.post("/grants/{device_id}")
def update_consent_grant(
    device_id: str,
    grant_in: ConsentGrantCreate,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """
    Guardian overrides/updates consent grants for their child device.
    """
    auth.verify_guardian_device_access(current_guardian, device_id, db)

    grant = (
        db.query(models.ConsentGrant)
        .filter(
            models.ConsentGrant.subject_id == device_id,
            models.ConsentGrant.modality == grant_in.modality,
        )
        .first()
    )

    action = "granted" if grant_in.is_granted else "revoked"

    if not grant:
        grant = models.ConsentGrant(
            subject_id=device_id,
            modality=grant_in.modality,
            is_granted=grant_in.is_granted,
        )
        db.add(grant)
    else:
        grant.is_granted = grant_in.is_granted
        if grant_in.is_granted:
            grant.granted_at = datetime.now(timezone.utc)
            grant.revoked_at = None
        else:
            grant.revoked_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(grant)

    # Log audit event
    audit.log_audit_event(
        db,
        action=f"Guardian updated consent '{action}' for modality '{grant_in.modality}'",
        device_id=device_id,
        guardian_id=current_guardian.id,
    )

    return {
        "status": "success",
        "modality": grant.modality,
        "is_granted": grant.is_granted,
    }


@router.get("/grants/{device_id}")
def get_consent_grants(
    device_id: str,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """
    Guardian retrieves consent grants for their child device.
    """
    auth.verify_guardian_device_access(current_guardian, device_id, db)
    grants = (
        db.query(models.ConsentGrant)
        .filter(models.ConsentGrant.subject_id == device_id)
        .all()
    )
    return [{"modality": g.modality, "is_granted": g.is_granted} for g in grants]
