import logging
import random
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import settings
from app.utils import audit, auth

logger = logging.getLogger(__name__)

# In-memory stores for sandbox testing/fallback
MOCK_OTP_STORE = {}
MOCK_MFA_STORE = {}


class AuthService:
    @staticmethod
    def register_guardian(
        guardian_in: schemas.GuardianCreate, db: Session, ip_address: str = None
    ) -> models.Guardian:
        existing_guardian = (
            db.query(models.Guardian)
            .filter(models.Guardian.email == guardian_in.email)
            .first()
        )
        if existing_guardian:
            audit.log_audit_event(
                db,
                action=f"Registration failed: Email {guardian_in.email} already registered",
                ip_address=ip_address,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )

        hashed_pwd = auth.get_password_hash(guardian_in.password)
        guardian = models.Guardian(
            full_name=guardian_in.full_name,
            email=guardian_in.email,
            password_hash=hashed_pwd,
            role=guardian_in.role or "guardian",
        )

        db.add(guardian)
        db.commit()
        db.refresh(guardian)

        audit.log_audit_event(
            db,
            action=f"Guardian registered successfully (ID: {guardian.id})",
            guardian_id=guardian.id,
            ip_address=ip_address,
        )
        return guardian

    @staticmethod
    def login_guardian(
        login_data: schemas.LoginRequest, db: Session, ip_address: str = None
    ) -> dict:
        guardian = (
            db.query(models.Guardian)
            .filter(models.Guardian.email == login_data.email)
            .first()
        )
        if not guardian or not auth.verify_password(
            login_data.password, guardian.password_hash
        ):
            audit.log_audit_event(
                db,
                action=f"Failed login attempt for email {login_data.email}",
                ip_address=ip_address,
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # In production, enforce Multi-Factor Authentication (MFA) step
        if settings.ENV.lower() == "production":
            mfa_token = auth.create_access_token(
                data={"sub": guardian.id, "type": "mfa_pending"},
                expires_delta=timedelta(minutes=5),
            )
            code = f"{random.randint(100000, 999999)}"
            MOCK_MFA_STORE[guardian.id] = code
            logger.info(
                "MFA OTP sent to guardian %s: code=%s", guardian.email, code
            )

            audit.log_audit_event(
                db,
                action=f"Guardian login MFA challenged (ID: {guardian.id})",
                guardian_id=guardian.id,
                ip_address=ip_address,
            )
            return {
                "mfa_required": True,
                "mfa_token": mfa_token,
                "access_token": None,
                "token_type": None,
                "user": None,
            }

        # Direct token for development/sandbox testing
        token = auth.create_access_token(data={"sub": guardian.id, "type": "guardian"})

        audit.log_audit_event(
            db,
            action=f"Guardian login successful (ID: {guardian.id})",
            guardian_id=guardian.id,
            ip_address=ip_address,
        )
        return {
            "mfa_required": False,
            "mfa_token": None,
            "access_token": token,
            "token_type": "bearer",
            "user": guardian,
        }

    @staticmethod
    def verify_mfa(
        payload: schemas.VerifyMFARequest, db: Session, ip_address: str = None
    ) -> dict:
        try:
            data = jwt.decode(
                payload.mfa_token,
                settings.JWT_SECRET,
                algorithms=[settings.JWT_ALGORITHM],
            )
            user_id = data.get("sub")
            token_type = data.get("type")
            if not user_id or token_type != "mfa_pending":
                raise HTTPException(status_code=401, detail="Invalid MFA token")
        except JWTError:
            raise HTTPException(status_code=401, detail="Expired or invalid MFA token")

        expected_code = MOCK_MFA_STORE.get(user_id)
        if not expected_code or payload.otp_code.strip() != expected_code:
            audit.log_audit_event(
                db,
                action=f"MFA verification failed for guardian ID {user_id}",
                ip_address=ip_address,
            )
            raise HTTPException(status_code=400, detail="Invalid MFA code")

        # Clean up OTP
        MOCK_MFA_STORE.pop(user_id, None)

        guardian = (
            db.query(models.Guardian).filter(models.Guardian.id == user_id).first()
        )
        if not guardian:
            raise HTTPException(status_code=404, detail="Guardian not found")

        token = auth.create_access_token(data={"sub": guardian.id, "type": "guardian"})

        audit.log_audit_event(
            db,
            action=f"MFA verified successfully. Login complete (ID: {guardian.id})",
            guardian_id=guardian.id,
            ip_address=ip_address,
        )
        return {"access_token": token, "token_type": "bearer", "user": guardian}

    @staticmethod
    def register_device(
        device_in: schemas.ChildDeviceCreate,
        guardian_id: str,
        db: Session,
        ip_address: str = None,
    ) -> dict:
        existing_device = (
            db.query(models.ChildDevice)
            .filter(models.ChildDevice.device_token == device_in.device_token)
            .first()
        )
        if existing_device:
            existing_device.last_seen = datetime.now(timezone.utc)
            db.commit()
            db.refresh(existing_device)

            device_jwt = auth.create_access_token(
                data={"sub": existing_device.id, "type": "device"}
            )
            return {"device": existing_device, "device_jwt_token": device_jwt}

        device = models.ChildDevice(
            guardian_id=guardian_id,
            name=device_in.name,
            platform=device_in.platform,
            device_token=device_in.device_token,
        )
        db.add(device)
        db.commit()
        db.refresh(device)

        device_jwt = auth.create_access_token(data={"sub": device.id, "type": "device"})

        audit.log_audit_event(
            db,
            action=f"Device registered: {device.platform} (ID: {device.id}, Name: {device.name})",
            guardian_id=guardian_id,
            device_id=device.id,
            ip_address=ip_address,
        )
        return {"device": device, "device_jwt_token": device_jwt}

    @staticmethod
    def send_otp(
        req: schemas.SendOTPRequest, db: Session, ip_address: str = None
    ) -> dict:
        phone = req.phone_number.strip()
        # NOTE: In a production deployment, OTP codes would be generated via
        # a real SMS provider (Twilio, etc.) and stored with TTL. This mock
        # implementation uses a fixed code for sandbox/demo testing only.
        code = str(random.randint(100000, 999999))
        MOCK_OTP_STORE[phone] = code

        audit.log_audit_event(
            db,
            action=f"OTP code sent successfully to phone {phone}",
            ip_address=ip_address,
        )
        logger.info("OTP code %s sent to phone %s", code, phone)
        return {"status": "sent", "code": code}

    @staticmethod
    def verify_otp(
        req: schemas.VerifyOTPRequest, db: Session, ip_address: str = None
    ) -> dict:
        phone = req.phone_number.strip()
        code = req.code.strip()

        if MOCK_OTP_STORE.get(phone) != code:
            audit.log_audit_event(
                db,
                action=f"OTP verification failed for phone {phone} (code: {code})",
                ip_address=ip_address,
            )
            raise HTTPException(status_code=400, detail="Invalid OTP code")

        mapped_email = f"{phone}@prism-otp.org"
        guardian = (
            db.query(models.Guardian)
            .filter(models.Guardian.email == mapped_email)
            .first()
        )

        if guardian:
            token = auth.create_access_token(
                data={"sub": guardian.id, "type": "guardian"}
            )
            audit.log_audit_event(
                db,
                action=f"OTP verified successfully. Guardian authenticated (ID: {guardian.id})",
                guardian_id=guardian.id,
                ip_address=ip_address,
            )
            return {
                "is_new_user": False,
                "access_token": token,
                "token_type": "bearer",
                "user": guardian,
            }

        audit.log_audit_event(
            db,
            action=f"OTP verified successfully for new phone number {phone}",
            ip_address=ip_address,
        )
        return {"is_new_user": True}

    @staticmethod
    def register_otp_guardian(
        req: schemas.RegisterOTPRequest, db: Session, ip_address: str = None
    ) -> dict:
        phone = req.phone_number.strip()
        name = req.full_name.strip()
        mapped_email = f"{phone}@prism-otp.org"

        existing = (
            db.query(models.Guardian)
            .filter(models.Guardian.email == mapped_email)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Guardian already registered")

        hashed_pwd = auth.get_password_hash("default_otp_pwd")
        guardian = models.Guardian(
            full_name=name,
            email=mapped_email,
            password_hash=hashed_pwd,
            role=req.role or "guardian",
        )
        db.add(guardian)
        db.commit()
        db.refresh(guardian)

        token = auth.create_access_token(data={"sub": guardian.id, "type": "guardian"})
        audit.log_audit_event(
            db,
            action=f"Guardian registered via OTP successfully (ID: {guardian.id})",
            guardian_id=guardian.id,
            ip_address=ip_address,
        )
        return {"access_token": token, "token_type": "bearer", "user": guardian}
