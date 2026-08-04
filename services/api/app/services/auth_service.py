from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, status
import random
import secrets
import logging
from jose import jwt, JWTError

from app import models, schemas
from app.utils import auth, audit
from app.config import settings

logger = logging.getLogger(__name__)

# In-memory stores for sandbox testing/fallback
# OTP store: phone -> {"code": str, "expires_at": datetime, "attempts": int}
MOCK_OTP_STORE: dict = {}
MOCK_MFA_STORE = {}
# Phones that have successfully verified an OTP since server start. Used to
# require proof of phone possession before /otp/register. Consumed on use.
_VERIFIED_PHONES: set = set()

OTP_TTL_SECONDS = 300  # 5 minutes
OTP_MAX_ATTEMPTS = 5


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
            role="guardian",
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
            # Store with expiry + attempt tracking. NEVER print the code to stdout.
            MOCK_MFA_STORE[guardian.id] = {
                "code": code,
                "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
                "attempts": 0,
            }
            logger.info(
                "MFA code generated for guardian %s (delivery channel not configured)",
                guardian.id,
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

        stored = MOCK_MFA_STORE.get(user_id)
        now = datetime.now(timezone.utc)
        invalid = HTTPException(status_code=400, detail="Invalid MFA code")

        if not stored:
            raise invalid
        if now > stored["expires_at"]:
            MOCK_MFA_STORE.pop(user_id, None)
            raise invalid
        if stored["attempts"] >= OTP_MAX_ATTEMPTS:
            MOCK_MFA_STORE.pop(user_id, None)
            raise invalid
        if payload.otp_code.strip() != stored["code"]:
            stored["attempts"] += 1
            audit.log_audit_event(
                db,
                action=f"MFA verification failed for guardian ID {user_id}",
                ip_address=ip_address,
            )
            raise invalid

        # One-time use
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
            # Ownership guard: a guardian may only re-register their OWN device token.
            # Replaying another guardian's token must not mint a device JWT.
            if existing_device.guardian_id != guardian_id:
                audit.log_audit_event(
                    db,
                    action="Device registration REJECTED: device token already registered to another guardian",
                    guardian_id=guardian_id,
                    ip_address=ip_address,
                )
                raise HTTPException(
                    status_code=403,
                    detail="Device token already registered to another guardian.",
                )

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
        # Always generate a random 6-digit code — never a hardcoded constant.
        code = f"{secrets.randbelow(1_000_000):06d}"
        MOCK_OTP_STORE[phone] = {
            "code": code,
            "expires_at": datetime.now(timezone.utc)
            + timedelta(seconds=OTP_TTL_SECONDS),
            "attempts": 0,
        }

        audit.log_audit_event(
            db,
            action=f"OTP code sent successfully to phone {phone}",
            ip_address=ip_address,
        )

        # In production the code must NOT be returned in the response or printed;
        # it would be delivered via a real SMS gateway (not configured yet), so we
        # log an operator notice instead. In development we return the code so the
        # demo onboarding flow (which displays the code) keeps working.
        if settings.ENV.lower() == "production":
            logger.info("OTP generated for %s (SMS delivery not configured)", phone)
            return {"status": "sent"}
        print(f"--- [OTP] Sent {code} to {phone} ---")
        return {"status": "sent", "code": code}

    @staticmethod
    def verify_otp(
        req: schemas.VerifyOTPRequest, db: Session, ip_address: str = None
    ) -> dict:
        phone = req.phone_number.strip()
        code = req.code.strip()

        invalid = HTTPException(status_code=400, detail="Invalid OTP code")
        stored = MOCK_OTP_STORE.get(phone)
        if not stored:
            raise invalid

        now = datetime.now(timezone.utc)
        if now > stored["expires_at"]:
            MOCK_OTP_STORE.pop(phone, None)
            audit.log_audit_event(
                db,
                action=f"OTP verification failed for phone {phone} (expired code)",
                ip_address=ip_address,
            )
            raise invalid

        if stored["attempts"] >= OTP_MAX_ATTEMPTS:
            MOCK_OTP_STORE.pop(phone, None)
            audit.log_audit_event(
                db,
                action=f"OTP verification failed for phone {phone} (max attempts reached)",
                ip_address=ip_address,
            )
            raise invalid

        if stored["code"] != code:
            stored["attempts"] += 1
            # Never log the submitted OTP code — it is a credential and would be
            # persisted permanently in the immutable audit log.
            audit.log_audit_event(
                db,
                action=f"OTP verification failed for phone {phone} (attempt {stored['attempts']})",
                ip_address=ip_address,
            )
            raise invalid

        # One-time use: invalidate the code after a successful verification.
        MOCK_OTP_STORE.pop(phone, None)

        # Record that this phone was successfully verified, so a subsequent
        # /otp/register for the same phone has proof of possession.
        _VERIFIED_PHONES.add(phone)

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

        # Require proof of phone possession: the caller must have successfully
        # verified an OTP for this phone first. The flag is consumed so a single
        # verification can't be reused to register arbitrary accounts.
        if phone not in _VERIFIED_PHONES:
            raise HTTPException(
                status_code=403,
                detail="Phone number not verified. Complete OTP verification first.",
            )
        _VERIFIED_PHONES.discard(phone)

        existing = (
            db.query(models.Guardian)
            .filter(models.Guardian.email == mapped_email)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Guardian already registered")

        # Generate a strong random password so OTP-registered guardians never
        # share a known credential. They authenticate via OTP/JWT going forward.
        random_password = secrets.token_urlsafe(32)
        hashed_pwd = auth.get_password_hash(random_password)
        guardian = models.Guardian(
            full_name=name,
            email=mapped_email,
            password_hash=hashed_pwd,
            role="guardian",
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
