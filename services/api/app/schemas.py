from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from typing import Optional, Dict, Any, List, Literal
from datetime import datetime, timezone
import re
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# --- Authentication & Guardians ---


class GuardianCreate(BaseModel):
    full_name: str = Field(
        ..., min_length=2, max_length=100, description="Alphabetical full name"
    )
    email: EmailStr
    password: str = Field(
        ..., min_length=8, max_length=128, description="Minimum 8 characters password"
    )
    role: Literal["guardian"] = "guardian"

    @field_validator("full_name")
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
    phone_number: str = Field(
        ..., pattern=r"^\+?[1-9]\d{1,14}$", description="E.164 compliance phone number"
    )


class VerifyOTPRequest(BaseModel):
    phone_number: str = Field(..., pattern=r"^\+?[1-9]\d{1,14}$")
    code: str = Field(..., pattern=r"^\d{6}$", description="6-digit numerical code")


class VerifyOTPResponse(BaseModel):
    is_new_user: bool
    access_token: str | None = None
    token_type: str | None = None
    user: GuardianResponse | None = None


class RegisterOTPRequest(BaseModel):
    phone_number: str = Field(..., pattern=r"^\+?[1-9]\d{1,14}$")
    full_name: str = Field(..., min_length=2, max_length=100)
    role: Literal["guardian"] = "guardian"

    @field_validator("full_name")
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
    mfa_token: str | None = None
    access_token: str | None = None
    token_type: str | None = None
    user: GuardianResponse | None = None


class VerifyMFARequest(BaseModel):
    mfa_token: str = Field(..., description="JWT mfa_pending token")
    otp_code: str = Field(..., pattern=r"^\d{6}$")


# --- Child Devices ---


class ChildDeviceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    platform: str = Field(
        ..., pattern=r"^(android|ios)$", description="Must be 'android' or 'ios'"
    )
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
    revoked_at: datetime | None = None


# --- Telemetry / Ingestion ---


class TelemetryIngest(BaseModel):
    device_id: str
    signal_type: str = Field(..., pattern=r"^(location|typing|app_usage)$")
    metadata: dict[str, Any] = Field(
        ..., description="Key-value pairs of signal metadata. Strictly no content."
    )
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UnifiedEventIngest(BaseModel):
    subject_id: str
    modality: str = Field(
        ...,
        pattern=r"^(location|typing|app_usage|gsr|ppg|browse_metadata|edge_behaviour)$",
    )
    value: dict[str, Any] = Field(..., description="Signal measurement values")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TelemetryResponse(BaseModel):
    status: str
    event_id: str


class IngestionHealthResponse(BaseModel):
    status: str
    active_modalities: dict[str, str]


# --- ML & Alerts ---


class RiskScoreResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    device_id: str
    model_name: str
    score: float
    threshold: float
    flagged: bool
    contributing_factors: list[str]
    timestamp: datetime


class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    device_id: str
    severity_tier: str
    plain_language_summary: str
    contributing_factors: list[str]
    is_viewed: bool
    timestamp: datetime


# --- Audit Logs ---


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    guardian_id: str | None = None
    device_id: str | None = None
    action: str
    ip_address: str | None = None
    timestamp: datetime


class AuditLogEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    actor_id: str | None = None
    action: str
    resource: str
    context: dict[str, Any]
    timestamp: datetime


class BaselineSeedRequest(BaseModel):
    device_id: str
    relationship: str = Field(..., min_length=2, max_length=50)
    date_of_birth: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    daily_screen_time_mins: int = Field(..., ge=0, le=1440)
    usual_bedtime: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    concerns: list[str]


class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    guardian_id: str
    sender: str
    aria_utterance: str
    timestamp: datetime


# ── Phase 12: Sensor Ingest Schemas ──────────────────────────────────────


class SensorReadingIngest(BaseModel):
    """Unified ingest for sensor readings (bpm, g_force from ESP32)."""

    device_id: str
    metric_type: str = Field(..., pattern=r"^(bpm|g_force|temperature)$")
    value: float
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SensorReadingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    device_id: str
    timestamp: datetime
    metric_type: str
    value: float


class VisionFeatureIngest(BaseModel):
    """Ingest for RPi camera-derived vision features."""

    device_id: str
    blink_rate_bpm: float = Field(..., ge=0, le=200)
    is_slouching: bool = False
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VisionFeatureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    device_id: str
    timestamp: datetime
    blink_rate_bpm: float
    is_slouching: bool


class AudioFeatureIngest(BaseModel):
    """Ingest for RPi microphone-derived audio features."""

    device_id: str
    speech_segments: float = Field(..., ge=0)
    silence_ratio: float = Field(..., ge=0, le=1)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AudioFeatureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    device_id: str
    timestamp: datetime
    speech_segments: float
    silence_ratio: float


class PhoneEventIngest(BaseModel):
    """Ingest for Android phone behavioural events."""

    device_id: str
    event_type: str = Field(
        ..., pattern=r"^(SCREEN_ON|SCREEN_OFF|APP_USAGE|APP_INSTALL)$"
    )
    package_name: str | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PhoneEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    device_id: str
    timestamp: datetime
    event_type: str
    package_name: str | None = None


# ── Phase 12: Fusion / Dashboard Schemas ─────────────────────────────────


class FusionAnalyzeRequest(BaseModel):
    """Trigger fusion analysis for a device."""

    device_id: str
    persist: bool = True


class DashboardSummaryResponse(BaseModel):
    """Aggregated dashboard summary for a guardian."""

    device_id: str | None = None
    insight_score: float | None = None
    tier_label: str | None = None
    recent_alerts: list[dict] = []
    sensor_status: dict[str, str] = {}
    daily_averages: dict[str, float] = {}
    system_health: str = "online"


class AlertListResponse(BaseModel):
    """Cross-device alert list with pagination."""

    alerts: list[dict]
    total: int
    unread: int
    page: int = 1
    page_size: int = 50


class IngestionResponse(BaseModel):
    status: str
    id: str
    detail: str | None = None


# ── Offline Batch Ingestion ─────────────────────────────────────────────


class BatchEventItem(BaseModel):
    timestamp: datetime
    source: str = Field(
        ..., description="Event source type: esp32_pulse, edge_behaviour, etc."
    )
    payload: dict[str, Any] = Field(..., description="Original single-event payload")


class BatchIngestRequest(BaseModel):
    batch_id: str = Field(..., description="UUID for idempotency")
    device_id: str
    events: list[BatchEventItem] = Field(..., min_length=1, max_length=100)


class BatchResultItem(BaseModel):
    row_index: int
    status: str  # "synced" | "rejected"
    cloud_id: str | None = None
    error: str | None = None
    code: str | None = None


class BatchIngestResponse(BaseModel):
    batch_id: str
    accepted: int
    rejected: int
    results: list[BatchResultItem]
