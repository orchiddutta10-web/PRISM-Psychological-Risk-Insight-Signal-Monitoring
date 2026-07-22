from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
import re

# --- Authentication & Guardians ---

class GuardianCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100, description="Alphabetical full name")
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128, description="Minimum 8 characters password")
    role: Optional[str] = "guardian"

    @field_validator('full_name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z\s\-']+$", v):
            raise ValueError("Full name contains invalid characters.")
        return v.strip()

class GuardianResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    full_name: str
    email: EmailStr
    role: str
    created_at: datetime

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)

class SendOTPRequest(BaseModel):
    phone_number: str = Field(..., pattern=r"^\+?[1-9]\d{1,14}$", description="E.164 compliance phone number")

class VerifyOTPRequest(BaseModel):
    phone_number: str = Field(..., pattern=r"^\+?[1-9]\d{1,14}$")
    code: str = Field(..., pattern=r"^\d{6}$", description="6-digit numerical code")

class VerifyOTPResponse(BaseModel):
    is_new_user: bool
    access_token: Optional[str] = None
    token_type: Optional[str] = None
    user: Optional[GuardianResponse] = None

class RegisterOTPRequest(BaseModel):
    phone_number: str = Field(..., pattern=r"^\+?[1-9]\d{1,14}$")
    full_name: str = Field(..., min_length=2, max_length=100)
    role: Optional[str] = "guardian"

    @field_validator('full_name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z\s\-']+$", v):
            raise ValueError("Full name contains invalid characters.")
        return v.strip()

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: GuardianResponse

# --- MFA Authentication Stage ---
class LoginResponse(BaseModel):
    mfa_required: bool
    mfa_token: Optional[str] = None
    access_token: Optional[str] = None
    token_type: Optional[str] = None
    user: Optional[GuardianResponse] = None

class VerifyMFARequest(BaseModel):
    mfa_token: str = Field(..., description="JWT mfa_pending token")
    otp_code: str = Field(..., pattern=r"^\d{6}$")

# --- Child Devices ---

class ChildDeviceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    platform: str = Field(..., pattern=r"^(android|ios)$", description="Must be 'android' or 'ios'")
    device_token: str = Field(..., min_length=3, max_length=255)

class ChildDeviceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    guardian_id: str
    name: str
    platform: str
    device_token: str
    last_seen: datetime

class DeviceRegistrationResponse(BaseModel):
    device: ChildDeviceResponse
    device_jwt_token: str

# --- Consent ---

class ConsentRecordCreate(BaseModel):
    signal_type: str = Field(..., pattern=r"^(location|typing|app_usage)$")
    consent_copy_version: str = Field("1.0", max_length=10)
    granted: bool

class ConsentRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    device_id: str
    signal_type: str
    consent_copy_version: str
    granted_at: datetime
    revoked_at: Optional[datetime] = None

# --- Telemetry / Ingestion ---

class TelemetryIngest(BaseModel):
    device_id: str
    signal_type: str = Field(..., pattern=r"^(location|typing|app_usage)$")
    metadata: Dict[str, Any] = Field(..., description="Key-value pairs of signal metadata. Strictly no content.")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UnifiedEventIngest(BaseModel):
    subject_id: str
    modality: str = Field(..., pattern=r"^(location|typing|app_usage|gsr|ppg|browse_metadata)$")
    value: Dict[str, Any] = Field(..., description="Signal measurement values")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TelemetryResponse(BaseModel):
    status: str
    event_id: str

class IngestionHealthResponse(BaseModel):
    status: str
    active_modalities: Dict[str, str]

# --- ML & Alerts ---

class RiskScoreResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    device_id: str
    model_name: str
    score: float
    threshold: float
    flagged: bool
    contributing_factors: List[str]
    timestamp: datetime

class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    device_id: str
    severity_tier: str
    plain_language_summary: str
    contributing_factors: List[str]
    is_viewed: bool
    timestamp: datetime

# --- Audit Logs ---

class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    guardian_id: Optional[str] = None
    device_id: Optional[str] = None
    action: str
    ip_address: Optional[str] = None
    timestamp: datetime

class AuditLogEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    actor_id: Optional[str] = None
    action: str
    resource: str
    context: Dict[str, Any]
    timestamp: datetime

class BaselineSeedRequest(BaseModel):
    device_id: str
    relationship: str = Field(..., min_length=2, max_length=50)
    date_of_birth: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    daily_screen_time_mins: int = Field(..., ge=0, le=1440)
    usual_bedtime: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    concerns: List[str]

class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    guardian_id: str
    sender: str
    aria_utterance: str
    timestamp: datetime
