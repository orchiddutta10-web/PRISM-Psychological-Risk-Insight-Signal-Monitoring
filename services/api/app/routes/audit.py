from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app import models, schemas
from app.database import get_db
from app.utils import auth

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])

@router.get("", response_model=List[schemas.AuditLogResponse])
def get_audit_logs(
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user)
):
    """
    Fetch audit log entries.
    Guardians can view logs related to themselves and their registered devices.
    """
    devices = db.query(models.ChildDevice).filter(models.ChildDevice.guardian_id == current_guardian.id).all()
    device_ids = [d.id for d in devices]
    
    logs = db.query(models.AuditLog).filter(
        (models.AuditLog.guardian_id == current_guardian.id) | 
        (models.AuditLog.device_id.in_(device_ids))
    ).order_by(models.AuditLog.timestamp.desc()).all()
    
    return logs

@router.get("/entries", response_model=List[schemas.AuditLogEntryResponse])
def get_immutable_audit_entries(
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.RoleChecker(["guardian-admin"]))
):
    """
    Fetch immutable data access logs from the AuditLogEntry table.
    Strictly authorized to 'guardian-admin' roles only.
    """
    entries = db.query(models.AuditLogEntry).order_by(models.AuditLogEntry.timestamp.desc()).all()
    return entries
