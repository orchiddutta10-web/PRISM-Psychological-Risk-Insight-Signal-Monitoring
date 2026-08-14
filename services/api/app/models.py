import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.crypto import decrypt_field, encrypt_field


def generate_uuid():
    return str(uuid.uuid4())


def _now():
    """Timezone-aware UTC now — used as SQLAlchemy column default callable."""
    return datetime.now(timezone.utc)


class Guardian(Base):
    __tablename__ = "guardians"

    id = Column(String, primary_key=True, default=generate_uuid)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(
        String, default="guardian", nullable=False
    )  # "guardian", "guardian-admin", "ops"
    created_at = Column(DateTime, default=_now)

    # Relationships
    devices = relationship(
        "ChildDevice", back_populates="guardian", cascade="all, delete-orphan"
    )
    audit_logs = relationship("AuditLog", back_populates="guardian")


class ChildDevice(Base):
    __tablename__ = "child_devices"

    id = Column(String, primary_key=True, default=generate_uuid)
    guardian_id = Column(String, ForeignKey("guardians.id"), nullable=False, index=True)
    name = Column(String, nullable=False)  # Child name / nickname
    platform = Column(String, nullable=False)  # "android", "ios"
    device_token = Column(String, unique=True, index=True, nullable=False)
    last_seen = Column(DateTime, default=_now, onupdate=_now)

    # Relationships
    guardian = relationship("Guardian", back_populates="devices")
    consent_records = relationship(
        "ConsentRecord", back_populates="device", cascade="all, delete-orphan"
    )
    events = relationship(
        "RawSignalEvent", back_populates="device", cascade="all, delete-orphan"
    )
    baselines = relationship(
        "BaselineProfile", back_populates="device", cascade="all, delete-orphan"
    )
    audit_logs = relationship("AuditLog", back_populates="device")


class ConsentRecord(Base):
    __tablename__ = "consent_records"

    id = Column(String, primary_key=True, default=generate_uuid)
    device_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    signal_type = Column(String, nullable=False)  # "location", "typing", "app_usage"
    consent_copy_version = Column(String, nullable=False)  # e.g., "v1.0"
    granted_at = Column(DateTime, default=_now, nullable=False)
    revoked_at = Column(DateTime, nullable=True)

    # Relationships
    device = relationship("ChildDevice", back_populates="consent_records")


class RawSignalEvent(Base):
    __tablename__ = "raw_signal_events"

    id = Column(String, primary_key=True, default=generate_uuid)
    device_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    signal_type = Column(String, nullable=False)  # "location", "typing", "app_usage"
    timestamp = Column(DateTime, default=_now, nullable=False)

    # Store encrypted metadata at rest — strictly NO message content/text/audio/video fields
    encrypted_metadata = Column(Text, nullable=False)

    # Relationships
    device = relationship("ChildDevice", back_populates="events")

    @property
    def metadata_json(self) -> str:
        """Decrypt payload automatically on read."""
        return decrypt_field(str(self.encrypted_metadata))

    @metadata_json.setter
    def metadata_json(self, raw_payload: str):
        """Encrypt payload automatically on write."""
        self.encrypted_metadata = encrypt_field(raw_payload)  # type: ignore[assignment]


class BaselineProfile(Base):
    __tablename__ = "baseline_profiles"

    id = Column(String, primary_key=True, default=generate_uuid)
    device_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    signal_type = Column(
        String, nullable=False
    )  # "location", "typing", "app_usage", "demographics"
    rolling_mean = Column(Float, default=0.0, nullable=False)
    rolling_variance = Column(Float, default=0.0, nullable=False)
    source = Column(
        String, default="on_device", nullable=False
    )  # "on_device", "guardian_reported"
    encrypted_metadata = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    # Relationships
    device = relationship("ChildDevice", back_populates="baselines")

    @property
    def metadata_json(self) -> str:
        """Decrypt metadata automatically on read."""
        if not self.encrypted_metadata:
            return "{}"
        return decrypt_field(str(self.encrypted_metadata))

    @metadata_json.setter
    def metadata_json(self, raw_payload: str):
        """Encrypt metadata automatically on write."""
        self.encrypted_metadata = encrypt_field(raw_payload)  # type: ignore[assignment]


class RiskScore(Base):
    __tablename__ = "risk_scores"

    id = Column(String, primary_key=True, default=generate_uuid)
    device_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    model_name = Column(
        String, nullable=False
    )  # "mobility", "typing", "app_usage", "signatures"
    score = Column(Float, nullable=False)
    threshold = Column(Float, nullable=False)
    flagged = Column(Boolean, default=False, nullable=False)
    contributing_factors_json = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=_now, nullable=False)

    # Relationships
    device = relationship("ChildDevice")

    @property
    def contributing_factors(self) -> list:
        """Decrypt factors automatically on read."""
        val = decrypt_field(str(self.contributing_factors_json))
        try:
            return json.loads(val)
        except Exception:
            return []

    @contributing_factors.setter
    def contributing_factors(self, raw_factors: list):
        """Encrypt factors automatically on write."""
        self.contributing_factors_json = encrypt_field(json.dumps(raw_factors))  # type: ignore[assignment]


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True, default=generate_uuid)
    device_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    severity_tier = Column(String, nullable=False)  # "sage", "amber", "red"
    plain_language_summary = Column(String, nullable=False)
    contributing_factors_json = Column(Text, nullable=False)
    is_viewed = Column(Boolean, default=False, nullable=False)
    timestamp = Column(DateTime, default=_now, nullable=False)

    # Relationships
    device = relationship("ChildDevice")

    @property
    def contributing_factors(self) -> list:
        """Decrypt factors automatically on read."""
        val = decrypt_field(str(self.contributing_factors_json))
        try:
            return json.loads(val)
        except Exception:
            return []

    @contributing_factors.setter
    def contributing_factors(self, raw_factors: list):
        """Encrypt factors automatically on write."""
        self.contributing_factors_json = encrypt_field(json.dumps(raw_factors))  # type: ignore[assignment]


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    guardian_id = Column(String, ForeignKey("guardians.id"), nullable=True, index=True)
    device_id = Column(
        String, ForeignKey("child_devices.id"), nullable=True, index=True
    )
    action = Column(String, nullable=False)
    ip_address = Column(String, nullable=True)
    timestamp = Column(DateTime, default=_now, nullable=False)

    # Relationships
    guardian = relationship("Guardian", back_populates="audit_logs")
    device = relationship("ChildDevice", back_populates="audit_logs")


# --- Phase 3 Hardened Immutable Audit Log Entry ---
class AuditLogEntry(Base):
    __tablename__ = "audit_log_entries"

    id = Column(String, primary_key=True, default=generate_uuid)
    actor_id = Column(String, nullable=True)
    action = Column(String, nullable=False)
    resource = Column(String, nullable=False)
    timestamp = Column(DateTime, default=_now, nullable=False)
    audit_detail_json = Column(
        Text, nullable=False
    )  # Immutable audit metadata (not user content)
    prev_hash = Column(String, nullable=True)
    entry_hash = Column(String, nullable=False, default=generate_uuid)

    @property
    def context(self) -> dict:
        """Decrypt context automatically on read."""
        val = decrypt_field(str(self.audit_detail_json))
        try:
            return json.loads(val)
        except Exception:
            return {}

    @context.setter
    def context(self, raw_context: dict):
        """Encrypt context automatically on write."""
        self.audit_detail_json = encrypt_field(json.dumps(raw_context))  # type: ignore[assignment]


# --- Phase 3 Wearable Ingestion physiological baseline contract ---
class PhysiologicalBaseline(Base):
    __tablename__ = "physiological_baselines"

    id = Column(String, primary_key=True, default=generate_uuid)
    device_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    metric_type = Column(
        String, nullable=False
    )  # "hrv", "gsr", "sleep_duration", "sleep_efficiency"
    rolling_mean = Column(Float, default=0.0, nullable=False)
    rolling_variance = Column(Float, default=0.0, nullable=False)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    # Relationships
    device = relationship("ChildDevice")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True, default=generate_uuid)
    guardian_id = Column(String, ForeignKey("guardians.id"), nullable=False, index=True)
    sender = Column(String, nullable=False)  # "guardian" or "aria"
    aria_utterance = Column(
        String, nullable=False
    )  # Guardian <-> Aria AI companion dialogue (NOT teen content)
    timestamp = Column(DateTime, default=_now, nullable=False)


# --- PRISM Node / Expanded IoT & Multimodal Models ---


class UnifiedEvent(Base):
    """
    Unified Event Schema for ALL telemetry (behavior & physio).
    This ensures downstream models read a standard shape.
    """

    __tablename__ = "unified_events"

    id = Column(String, primary_key=True, default=generate_uuid)
    subject_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    timestamp = Column(DateTime, default=_now, nullable=False)
    modality = Column(
        String, nullable=False
    )  # 'location', 'typing', 'app_usage', 'gsr', 'ppg'
    encrypted_value = Column(Text, nullable=False)  # JSON payload, encrypted at rest
    confidence = Column(Float, default=1.0, nullable=False)

    device = relationship("ChildDevice")

    @property
    def value(self) -> dict:
        val = decrypt_field(str(self.encrypted_value))
        try:
            return json.loads(val)
        except Exception:
            return {}

    @value.setter
    def value(self, raw_payload: dict):
        self.encrypted_value = encrypt_field(json.dumps(raw_payload))  # type: ignore[assignment]


class PhysioReading(Base):
    __tablename__ = "physio_readings"

    id = Column(String, primary_key=True, default=generate_uuid)
    subject_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    timestamp = Column(DateTime, default=_now, nullable=False)
    sensor_type = Column(String, nullable=False)  # 'gsr', 'ppg'
    value = Column(Float, nullable=False)
    variance = Column(Float, default=0.0, nullable=False)

    device = relationship("ChildDevice")


class VoiceSession(Base):
    __tablename__ = "voice_sessions"

    id = Column(String, primary_key=True, default=generate_uuid)
    subject_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    timestamp = Column(DateTime, default=_now, nullable=False)
    affect_confidence = Column(Float, nullable=False)
    emotion_label = Column(String, nullable=False)  # calm, stressed, sad, anxious
    encrypted_features = Column(
        Text, nullable=False
    )  # MFCC/chroma/mel vectors, encrypted

    device = relationship("ChildDevice")

    @property
    def features(self) -> dict:
        val = decrypt_field(str(self.encrypted_features))
        try:
            return json.loads(val)
        except Exception:
            return {}

    @features.setter
    def features(self, raw_payload: dict):
        self.encrypted_features = encrypt_field(json.dumps(raw_payload))  # type: ignore[assignment]


class SleepWindow(Base):
    __tablename__ = "sleep_windows"

    id = Column(String, primary_key=True, default=generate_uuid)
    subject_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    estimated_start = Column(DateTime, nullable=False)
    estimated_end = Column(DateTime, nullable=False)
    confidence = Column(Float, nullable=False)

    device = relationship("ChildDevice")


class RiskRegistry(Base):
    __tablename__ = "risk_registry"

    id = Column(String, primary_key=True, default=generate_uuid)
    category = Column(
        String, nullable=False
    )  # e.g. anonymous-chat-app, extreme-challenge-content
    match_type = Column(String, nullable=False)  # package_name, keyword, domain
    match_value = Column(
        String, nullable=False
    )  # e.g. com.anonymous.chat, "choking challenge"
    severity = Column(String, nullable=False)  # low, medium, high, critical
    source = Column(String, default="internal_seed")
    last_updated = Column(DateTime, default=_now, onupdate=_now)


class RiskRegistryHit(Base):
    __tablename__ = "risk_registry_hits"

    id = Column(String, primary_key=True, default=generate_uuid)
    subject_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    registry_id = Column(
        String, ForeignKey("risk_registry.id"), nullable=True, index=True
    )  # Linked registry entry
    category = Column(String, nullable=False)
    severity = Column(String, nullable=False)  # low, medium, high, critical
    timestamp = Column(DateTime, default=_now, nullable=False)

    device = relationship("ChildDevice")
    registry = relationship("RiskRegistry")


class CompanionSession(Base):
    __tablename__ = "companion_sessions"

    id = Column(String, primary_key=True, default=generate_uuid)
    subject_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    persona_id = Column(String, nullable=False)
    channel = Column(String, nullable=False)  # in-app, whatsapp, instagram
    started_at = Column(DateTime, default=_now, nullable=False)
    crisis_flag = Column(Boolean, default=False, nullable=False)

    device = relationship("ChildDevice")


class ConsentGrant(Base):
    """Granular consent per modality, superseding/complementing ConsentRecord."""

    __tablename__ = "consent_grants"

    id = Column(String, primary_key=True, default=generate_uuid)
    subject_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    modality = Column(String, nullable=False)  # location, gsr, voice, companion_chat
    is_granted = Column(Boolean, nullable=False)
    granted_at = Column(DateTime, default=_now, nullable=False)
    revoked_at = Column(DateTime, nullable=True)

    device = relationship("ChildDevice")


class VoiceProfile(Base):
    """Stores the baseline voiceprint vector generated during teen onboarding."""

    __tablename__ = "voice_profiles"

    id = Column(String, primary_key=True, default=generate_uuid)
    subject_id = Column(
        String, ForeignKey("child_devices.id"), unique=True, nullable=False, index=True
    )
    encrypted_voiceprint = Column(Text, nullable=False)  # Vector, encrypted at rest
    created_at = Column(DateTime, default=_now, nullable=False)

    device = relationship("ChildDevice")

    @property
    def voiceprint(self) -> list:
        val = decrypt_field(str(self.encrypted_voiceprint))
        try:
            return json.loads(val)
        except Exception:
            return []

    @voiceprint.setter
    def voiceprint(self, raw_payload: list):
        self.encrypted_voiceprint = encrypt_field(json.dumps(raw_payload))  # type: ignore[assignment]


class PulseMultiFactorReading(Base):
    """ESP32 PRISM PULSE: Multi-factor pulse sensor + accelerometer fused reading."""

    __tablename__ = "pulse_readings"

    id = Column(String, primary_key=True, default=generate_uuid)
    subject_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    timestamp = Column(DateTime, default=_now, nullable=False)
    ts_ms = Column(Float, nullable=False, comment="ESP32 millis() timestamp")
    pulse_raw = Column(
        Float, nullable=False, comment="Analog pulse sensor raw ADC value"
    )
    bpm = Column(Float, nullable=False)
    g_force = Column(Float, nullable=False, comment="MPU6050 total acceleration in g")
    alert_status = Column(
        String, nullable=False, comment="OK | WARNING-Xs | ISD_TRIGGERED"
    )

    device = relationship("ChildDevice")


# =====================================================================
# --- Phase 8 Prototype Schema (Simplified 5-Day Architecture) ---
# =====================================================================


class User(Base):
    """Replaces Guardian/Teen split for the simplified prototype."""

    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="guardian", nullable=False)
    created_at = Column(DateTime, default=_now, nullable=False)

    devices = relationship(
        "Device", back_populates="user", cascade="all, delete-orphan"
    )


class Device(Base):
    """Replaces ChildDevice for the simplified prototype."""

    __tablename__ = "devices"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    device_type = Column(String, nullable=False)  # 'android_phone', 'rpi_edge'
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=_now, nullable=False)

    user = relationship("User", back_populates="devices")
    sensor_readings = relationship(
        "SensorReading", back_populates="device", cascade="all, delete-orphan"
    )
    phone_events = relationship(
        "PhoneEvent", back_populates="device", cascade="all, delete-orphan"
    )
    vision_features = relationship(
        "VisionFeature", back_populates="device", cascade="all, delete-orphan"
    )
    audio_features = relationship(
        "AudioFeature", back_populates="device", cascade="all, delete-orphan"
    )


class SensorReading(Base):
    """Time-series physical sensor data (pulse, accel)."""

    __tablename__ = "sensor_readings"

    id = Column(String, primary_key=True, default=generate_uuid)
    device_id = Column(String, ForeignKey("devices.id"), nullable=False, index=True)
    timestamp = Column(DateTime, default=_now, nullable=False, index=True)
    metric_type = Column(String, nullable=False)  # 'bpm', 'g_force'
    value = Column(Float, nullable=False)

    device = relationship("Device", back_populates="sensor_readings")


class PhoneEvent(Base):
    """Behavioral metadata from Android (screen state, app usage)."""

    __tablename__ = "phone_events"

    id = Column(String, primary_key=True, default=generate_uuid)
    device_id = Column(String, ForeignKey("devices.id"), nullable=False, index=True)
    timestamp = Column(DateTime, default=_now, nullable=False, index=True)
    event_type = Column(String, nullable=False)  # 'SCREEN_ON', 'APP_USAGE'
    package_name = Column(String, nullable=True)

    device = relationship("Device", back_populates="phone_events")


class VisionFeature(Base):
    """Non-diagnostic CV metadata (gaze, posture) from Edge."""

    __tablename__ = "vision_features"

    id = Column(String, primary_key=True, default=generate_uuid)
    device_id = Column(String, ForeignKey("devices.id"), nullable=False, index=True)
    timestamp = Column(DateTime, default=_now, nullable=False, index=True)
    blink_rate_bpm = Column(Float, nullable=False)
    is_slouching = Column(Boolean, default=False, nullable=False)

    device = relationship("Device", back_populates="vision_features")


class AudioFeature(Base):
    """Non-diagnostic acoustic metadata (speech rate) from Edge."""

    __tablename__ = "audio_features"

    id = Column(String, primary_key=True, default=generate_uuid)
    device_id = Column(String, ForeignKey("devices.id"), nullable=False, index=True)
    timestamp = Column(DateTime, default=_now, nullable=False, index=True)
    speech_segments = Column(
        Float, nullable=False
    )  # Stored as float for consistency or int
    silence_ratio = Column(Float, nullable=False)

    device = relationship("Device", back_populates="audio_features")


class BehaviorWindow(Base):
    """Aggregated daily summaries."""

    __tablename__ = "behavior_windows"

    id = Column(String, primary_key=True, default=generate_uuid)
    subject_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    start_ts = Column(DateTime, nullable=False, index=True)
    end_ts = Column(DateTime, nullable=False)
    total_active_mins = Column(Float, nullable=False)
    sleep_hours_proxy = Column(Float, nullable=False)

    device = relationship("ChildDevice")
    risk_score = relationship(
        "RiskScoreV2",
        back_populates="window",
        uselist=False,
        cascade="all, delete-orphan",
    )


class RiskScoreV2(Base):
    """Heuristic risk evaluation for a window."""

    __tablename__ = "risk_scores_v2"

    id = Column(String, primary_key=True, default=generate_uuid)
    window_id = Column(
        String,
        ForeignKey("behavior_windows.id"),
        nullable=False,
        unique=True,
        index=True,
    )
    score_value = Column(Float, nullable=False)  # 0-100
    risk_level = Column(String, nullable=False)  # 'LOW', 'MEDIUM', 'HIGH'

    # Store JSON string for simplicity across SQLite/Postgres dev environments
    contributing_factors_json = Column(Text, nullable=False, default="[]")

    window = relationship("BehaviorWindow", back_populates="risk_score")

    @property
    def contributing_factors(self) -> list:
        try:
            return json.loads(str(self.contributing_factors_json))
        except Exception:
            return []

    @contributing_factors.setter
    def contributing_factors(self, factors: list):
        self.contributing_factors_json = json.dumps(factors)


class AlertV2(Base):
    """Guardian notifications."""

    __tablename__ = "alerts_v2"

    id = Column(String, primary_key=True, default=generate_uuid)
    subject_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    risk_score_id = Column(String, ForeignKey("risk_scores_v2.id"), nullable=True)
    created_at = Column(DateTime, default=_now, nullable=False)
    summary = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)

    device = relationship("ChildDevice")
    risk_score = relationship("RiskScoreV2")


# =====================================================================
# --- Phase 12 Continuous Learning Tables ---
# =====================================================================


class ModelRegistry(Base):
    """Records every model version trained or deployed for audit trail and rollback."""

    __tablename__ = "model_registry"

    id = Column(String, primary_key=True, default=generate_uuid)
    subject_id = Column(
        String, ForeignKey("child_devices.id"), nullable=True, index=True
    )
    model_type = Column(
        String, nullable=False
    )  # "isolation_forest" | "behavioural_classifier" | "fusion_engine"
    version = Column(String, nullable=False)  # "20260728_172921"
    file_path = Column(String, nullable=False)
    metrics_json = Column(Text, nullable=False)  # {"f1_macro": 0.81, ...}
    status = Column(
        String, default="draft", nullable=False
    )  # draft | shadow | active | archived
    deployed_at = Column(DateTime, nullable=True)
    previous_version = Column(String, nullable=True)  # rollback link
    audit_log_id = Column(String, ForeignKey("audit_log_entries.id"), nullable=True)
    created_at = Column(DateTime, default=_now, nullable=False)

    device = relationship("ChildDevice")
    audit_log = relationship("AuditLogEntry")

    @property
    def metrics(self) -> dict:
        try:
            return json.loads(str(self.metrics_json))
        except Exception:
            return {}

    @metrics.setter
    def metrics(self, raw: dict):
        self.metrics_json = json.dumps(raw)


class FeedbackRecord(Base):
    """Stores guardian, clinician, and system feedback on PRISM predictions."""

    __tablename__ = "feedback_records"

    id = Column(String, primary_key=True, default=generate_uuid)
    subject_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    source = Column(String, nullable=False)  # "guardian" | "clinician" | "system"
    feedback_type = Column(
        String, nullable=False
    )  # "helpful" | "not_helpful" | "false_alert" | "missed_alert" | "correct" | "incorrect"
    insight_score_at_time = Column(Float, nullable=True)
    risk_level_at_time = Column(String, nullable=True)
    comment = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=_now, nullable=False)

    device = relationship("ChildDevice")


# =====================================================================
# --- Phase 13 Behavioral AI: Typing + Memory Tables ---
# =====================================================================


class TypingSession(Base):
    """Stores typing dynamics session summaries from Android keystroke events."""

    __tablename__ = "typing_sessions"

    id = Column(String, primary_key=True, default=generate_uuid)
    device_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    session_id = Column(String, nullable=False, index=True)
    total_events = Column(Integer, default=0)
    avg_hold_time_ms = Column(Float, default=0.0)
    avg_flight_time_ms = Column(Float, default=0.0)
    wpm = Column(Float, default=0.0)
    error_rate = Column(Float, default=0.0)
    pause_count = Column(Integer, default=0)
    typing_entropy = Column(Float, default=0.0)
    confidence = Column(Float, default=1.0)
    created_at = Column(DateTime, default=_now, nullable=False)

    device = relationship("ChildDevice")


class ConversationMemory(Base):
    """Long-term conversation memory with sentiment + tags."""

    __tablename__ = "conversation_memory"

    id = Column(String, primary_key=True, default=generate_uuid)
    subject_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    session_id = Column(String, nullable=False, index=True)
    message = Column(Text, nullable=False)
    role = Column(String, default="user")  # user | assistant | system
    sentiment = Column(String, nullable=True)  # positive | negative | neutral
    tags_json = Column(Text, default="[]")
    timestamp = Column(DateTime, default=_now, nullable=False)

    device = relationship("ChildDevice")


# =====================================================================
# --- Phase 14 Guardian Feature Models ---
# =====================================================================


class GuardianConnection(Base):
    """Represents a guardian-user relationship with consent tracking."""

    __tablename__ = "guardian_connections"

    id = Column(String, primary_key=True, default=generate_uuid)
    guardian_id = Column(String, ForeignKey("guardians.id"), nullable=False, index=True)
    device_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    status = Column(
        String, default="pending", nullable=False
    )  # pending | active | paused | revoked
    invited_at = Column(DateTime, default=_now, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    paused_until = Column(DateTime, nullable=True)

    guardian = relationship("Guardian")
    device = relationship("ChildDevice")


class GuardianAlert(Base):
    """Privacy-preserving trend-based alerts for guardians."""

    __tablename__ = "guardian_alerts"

    id = Column(String, primary_key=True, default=generate_uuid)
    connection_id = Column(
        String, ForeignKey("guardian_connections.id"), nullable=False, index=True
    )
    severity = Column(
        String, nullable=False
    )  # info | observation | attention | urgent | critical
    category = Column(
        String, nullable=False
    )  # behavior | wellbeing | safety | isolation | sleep | routine | mood | risk_escalation | positive
    title = Column(String, nullable=False)
    summary = Column(Text, nullable=False)
    contributing_observations_json = Column(Text, nullable=False, default="[]")
    interpretation = Column(Text, nullable=True)
    suggested_approach = Column(Text, nullable=True)
    conversation_starter = Column(Text, nullable=True)
    confidence = Column(Float, default=0.0)
    is_acknowledged = Column(Boolean, default=False)
    acknowledged_at = Column(DateTime, nullable=True)
    detected_at = Column(DateTime, default=_now, nullable=False)
    resolved_at = Column(DateTime, nullable=True)

    connection = relationship("GuardianConnection")

    @property
    def contributing_observations(self) -> list:
        try:
            return json.loads(str(self.contributing_observations_json))
        except Exception:
            return []

    @contributing_observations.setter
    def contributing_observations(self, obs: list):
        self.contributing_observations_json = json.dumps(obs)


class GuardianAccessLog(Base):
    """Immutable log of every guardian data access event — visible to both parties."""

    __tablename__ = "guardian_access_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    connection_id = Column(
        String, ForeignKey("guardian_connections.id"), nullable=False, index=True
    )
    action = Column(
        String, nullable=False
    )  # VIEW_DASHBOARD | VIEW_ALERT | VIEW_TIMELINE | ACKNOWLEDGE_ALERT
    resource = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    timestamp = Column(DateTime, default=_now, nullable=False)

    connection = relationship("GuardianConnection")
