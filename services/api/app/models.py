import uuid
import json
from sqlalchemy import (
    Column,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Table,
    Text,
    Float,
    Index,
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base
from app.utils.crypto import encrypt_field, decrypt_field


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
    __table_args__ = (
        Index("ix_consent_records_device_signal", "device_id", "signal_type"),
    )

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
    __table_args__ = (
        Index("ix_raw_signal_device_type_ts", "device_id", "signal_type", "timestamp"),
    )

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
    __table_args__ = (
        Index("ix_risk_scores_device_model_ts", "device_id", "model_name", "timestamp"),
    )

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
    __table_args__ = (
        Index("ix_alerts_device_ts", "device_id", "timestamp"),
    )

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
    __table_args__ = (
        Index("ix_audit_guardian_ts", "guardian_id", "timestamp"),
        Index("ix_audit_device_ts", "device_id", "timestamp"),
    )

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
    # Tamper-evident hash chain: each entry links to the previous entry's hash.
    prev_hash = Column(String, nullable=True)  # None for the first entry
    entry_hash = Column(String, nullable=False)

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
    __table_args__ = (
        Index("ix_chat_guardian_ts", "guardian_id", "timestamp"),
    )

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
    __table_args__ = (
        Index("ix_unified_subject_modality_ts", "subject_id", "modality", "timestamp"),
    )

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
    __table_args__ = (
        Index("ix_physio_subject_ts", "subject_id", "timestamp"),
    )

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
    __table_args__ = (
        Index("ix_sleep_subject_start", "subject_id", "estimated_start"),
    )

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
    __table_args__ = (
        Index("ix_companion_subject_channel", "subject_id", "channel"),
    )

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
    __table_args__ = (
        Index("ix_consent_grants_subject_modality", "subject_id", "modality"),
    )

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
    __table_args__ = (
        Index("ix_pulse_subject_ts", "subject_id", "timestamp"),
    )

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
