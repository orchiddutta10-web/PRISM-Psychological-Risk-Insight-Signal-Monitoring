import bcrypt
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.database import get_db

# OAuth2 scheme for token retrieval
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    # Use native bcrypt to hash the password safely
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> models.Guardian:
    """Dependency to retrieve the currently authenticated Guardian."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type", "guardian")
        if user_id is None or token_type != "guardian":
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    guardian = db.query(models.Guardian).filter(models.Guardian.id == user_id).first()
    if guardian is None:
        raise credentials_exception
    return guardian


def get_current_device(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> models.ChildDevice:
    """Dependency to retrieve the currently authenticated ChildDevice (via JWT)."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate device credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
        device_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        if device_id is None or token_type != "device":
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    device = (
        db.query(models.ChildDevice).filter(models.ChildDevice.id == device_id).first()
    )
    if device is None:
        raise credentials_exception
    return device


def verify_guardian_device_access(
    guardian: models.Guardian, device_id: str, db: Session
):
    """Enforce that a guardian can only access devices they registered."""
    # ops and guardian-admin bypass individual pairing checks for monitoring/oversight
    if guardian.role in ["ops", "guardian-admin"]:
        return
    device = (
        db.query(models.ChildDevice).filter(models.ChildDevice.id == device_id).first()
    )
    if not device or device.guardian_id != guardian.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You are not authorized to access this child's device data.",
        )


class RoleChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(
        self, current_user: models.Guardian = Depends(get_current_user)
    ) -> models.Guardian:
        if current_user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource",
            )
        return current_user
