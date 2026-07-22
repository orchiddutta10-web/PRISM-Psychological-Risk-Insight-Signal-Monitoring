from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.utils import auth
from app.utils.rate_limiter import rate_limit
from app.services.auth_service import AuthService

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

@router.post("/register", response_model=schemas.GuardianResponse, status_code=status.HTTP_201_CREATED)
def register_guardian(guardian_in: schemas.GuardianCreate, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else None
    return AuthService.register_guardian(guardian_in, db, ip_address=ip)

@router.post("/login", response_model=schemas.LoginResponse, dependencies=[Depends(rate_limit)])
def login_guardian(login_data: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else None
    return AuthService.login_guardian(login_data, db, ip_address=ip)

@router.post("/mfa/verify", response_model=schemas.TokenResponse, dependencies=[Depends(rate_limit)])
def verify_mfa(payload: schemas.VerifyMFARequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else None
    return AuthService.verify_mfa(payload, db, ip_address=ip)

@router.post("/device", response_model=schemas.DeviceRegistrationResponse)
def register_device(
    device_in: schemas.ChildDeviceCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(auth.get_current_user)
):
    """Register a mobile device under the logged-in guardian."""
    ip = request.client.host if request.client else None
    return AuthService.register_device(device_in, current_guardian.id, db, ip_address=ip)

@router.post("/otp/send", dependencies=[Depends(rate_limit)])
def send_otp(req: schemas.SendOTPRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else None
    return AuthService.send_otp(req, db, ip_address=ip)

@router.post("/otp/verify", response_model=schemas.VerifyOTPResponse, dependencies=[Depends(rate_limit)])
def verify_otp(req: schemas.VerifyOTPRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else None
    return AuthService.verify_otp(req, db, ip_address=ip)

@router.post("/otp/register", response_model=schemas.TokenResponse, dependencies=[Depends(rate_limit)])
def register_otp_guardian(req: schemas.RegisterOTPRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else None
    return AuthService.register_otp_guardian(req, db, ip_address=ip)
