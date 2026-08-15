from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session
from typing import List

from app import models, schemas
from app.database import get_db
from app.services.auth_service import AuthService
from app.utils import auth
from app.utils.rate_limiter import rate_limit

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=schemas.GuardianResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit)],
)
def register_guardian(
    guardian_in: schemas.GuardianCreate, request: Request, db: Session = Depends(get_db)
):
    ip = request.client.host if request.client else None
    return AuthService.register_guardian(guardian_in, db, ip_address=ip)


@router.post(
    "/login", response_model=schemas.LoginResponse, dependencies=[Depends(rate_limit)]
)
def login_guardian(
    login_data: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)
):
    ip = request.client.host if request.client else None
    return AuthService.login_guardian(login_data, db, ip_address=ip)


@router.post(
    "/mfa/verify",
    response_model=schemas.TokenResponse,
    dependencies=[Depends(rate_limit)],
)
def verify_mfa(
    payload: schemas.VerifyMFARequest, request: Request, db: Session = Depends(get_db)
):
    ip = request.client.host if request.client else None
    return AuthService.verify_mfa(payload, db, ip_address=ip)


@router.post(
    "/device",
    response_model=schemas.DeviceRegistrationResponse,
    dependencies=[Depends(rate_limit)],
)
def register_device(
    device_in: schemas.ChildDeviceCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """Register a mobile device under the logged-in guardian."""
    ip = request.client.host if request.client else None
    return AuthService.register_device(
        device_in, current_guardian.id, db, ip_address=ip
    )


@router.get("/devices", response_model=List[schemas.DeviceWithRiskResponse])
def list_guardian_devices(
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user),
):
    """
    List child devices for the authenticated guardian. Admins (ops /
    guardian-admin) see every device in the system. Each entry carries a
    derived risk score (from the latest alert severity tier), the latest
    alert summary, and the count of active consent grants.
    """
    if current_guardian.role in ("ops", "guardian-admin"):
        # Audited because it exposes every device in the system.
        audit.log_audit_event(
            db,
            action="READ_ALL_DEVICES (admin)",
            guardian_id=str(current_guardian.id),
        )
        devices = (
            db.query(models.ChildDevice)
            .order_by(models.ChildDevice.name.asc())
            .all()
        )
    else:
        devices = (
            db.query(models.ChildDevice)
            .filter(models.ChildDevice.guardian_id == current_guardian.id)
            .order_by(models.ChildDevice.name.asc())
            .all()
        )

    result = []
    for device in devices:
        latest_alert = (
            db.query(models.Alert)
            .filter(models.Alert.device_id == device.id)
            .order_by(models.Alert.timestamp.desc())
            .first()
        )

        # Derive risk score from the most recent alert severity tier
        risk_score = 0
        risk_label = "Normal Range"
        if latest_alert:
            tier = latest_alert.severity_tier
            if tier == "red":
                risk_score = 82
                risk_label = "Elevated Concern"
            elif tier == "amber":
                risk_score = 55
                risk_label = "Mild Deviation"
            else:
                risk_score = 18
                risk_label = "Baseline"

        consent_count = (
            db.query(models.ConsentGrant)
            .filter(
                models.ConsentGrant.subject_id == device.id,
                models.ConsentGrant.is_granted.is_(True),
            )
            .count()
        )

        result.append(
            schemas.DeviceWithRiskResponse(
                id=device.id,
                guardian_id=device.guardian_id,
                name=device.name,
                platform=device.platform,
                device_token=device.device_token,
                last_seen=device.last_seen,
                risk_score=risk_score,
                risk_label=risk_label,
                latest_alert=(
                    {
                        "severity_tier": latest_alert.severity_tier,
                        "summary": latest_alert.plain_language_summary,
                        "timestamp": latest_alert.timestamp.isoformat(),
                    }
                    if latest_alert
                    else None
                ),
                consent_count=consent_count,
            )
        )

    return result


@router.post("/otp/send", dependencies=[Depends(rate_limit)])
def send_otp(
    req: schemas.SendOTPRequest, request: Request, db: Session = Depends(get_db)
):
    ip = request.client.host if request.client else None
    return AuthService.send_otp(req, db, ip_address=ip)


@router.post(
    "/otp/verify",
    response_model=schemas.VerifyOTPResponse,
    dependencies=[Depends(rate_limit)],
)
def verify_otp(
    req: schemas.VerifyOTPRequest, request: Request, db: Session = Depends(get_db)
):
    ip = request.client.host if request.client else None
    return AuthService.verify_otp(req, db, ip_address=ip)


@router.post(
    "/otp/register",
    response_model=schemas.TokenResponse,
    dependencies=[Depends(rate_limit)],
)
def register_otp_guardian(
    req: schemas.RegisterOTPRequest, request: Request, db: Session = Depends(get_db)
):
    ip = request.client.host if request.client else None
    return AuthService.register_otp_guardian(req, db, ip_address=ip)
