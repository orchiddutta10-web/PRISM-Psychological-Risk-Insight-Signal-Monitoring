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
    Integer,
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


class TrendSnapshot(Base):
    """
    Module 6: Long-Term Behaviour Tracking.

    Aggregated, de-identified trend snapshots for a device at a given
    granularity (daily / weekly / monthly). Stores the mean behavioral AI
    scores (stress, cognitive load, typing fatigue, typing stability) and the
    mental-risk composite over the window, so the dashboard can render long
    horizon trends without recomputing over raw events.

    The scores are stored as a compact JSON blob (encrypted at rest) plus a
    single composite `wellness` value (higher = more attention-worthy) for
    quick risk-meter rendering.
    """

    __tablename__ = "trend_snapshots"

    id = Column(String, primary_key=True, default=generate_uuid)
    device_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    granularity = Column(String, nullable=False)  # "daily" | "weekly" | "monthly"
    period_start = Column(DateTime, nullable=False, index=True)
    period_end = Column(DateTime, nullable=False)
    wellness = Column(Float, nullable=False)  # 0..1 composite (mental-risk proxy)
    sample_count = Column(Integer, nullable=False, default=0)
    encrypted_scores = Column(Text, nullable=False)  # JSON blob of dimension means

    device = relationship("ChildDevice")

    @property
    def scores(self) -> dict:
        val = decrypt_field(str(self.encrypted_scores))
        try:
            return json.loads(val)
        except Exception:
            return {}

    @scores.setter
    def scores(self, raw_scores: dict):
        self.encrypted_scores = encrypt_field(json.dumps(raw_scores))  # type: ignore[assignment]


class VitalsReading(Base):
    """
    Module 10: Future IoT Integration — unified multi-modal vitals reading.

    One row per edge-node sample (ESP32, MAX30102, Raspberry Pi) carrying the
    physiological channels PRISM is designed to consume: heart rate, SpO2,
    temperature, ECG, GSR. Raw waveforms are NEVER stored (PRISM constraint);
    only derived scalar vitals are persisted. `source` records the ingestion
    path (http | mqtt) and `device_meta` a small encrypted JSON blob of
    non-sensitive device context (firmware version, sensor flags).
    """

    __tablename__ = "vitals_readings"

    id = Column(String, primary_key=True, default=generate_uuid)
    subject_id = Column(
        String, ForeignKey("child_devices.id"), nullable=False, index=True
    )
    timestamp = Column(DateTime, default=_now, nullable=False, index=True)
    source = Column(String, default="http", nullable=False)  # "http" | "mqtt"
    # Derived scalar vitals (all optional — a sample may carry a subset).
    heart_rate_bpm = Column(Float, nullable=True)
    spo2_percent = Column(Float, nullable=True)
    temperature_c = Column(Float, nullable=True)
    ecg_mv = Column(Float, nullable=True)
    gsr_microsiemens = Column(Float, nullable=True)
    device_meta_json = Column(Text, nullable=True)  # encrypted device context

    device = relationship("ChildDevice")

    @property
    def device_meta(self) -> dict:
        if not self.device_meta_json:
            return {}
        val = decrypt_field(str(self.device_meta_json))
        try:
            return json.loads(val)
        except Exception:
            return {}

    @device_meta.setter
    def device_meta(self, raw_payload: dict):
        self.device_meta_json = encrypt_field(json.dumps(raw_payload))  # type: ignore[assignment]


class PrismPredictionSnapshot(Base):
    """Stores the prediction result from the PRISM 57-feature ML artifacts."""
    __tablename__ = "prism_prediction_snapshots"

    id = Column(String, primary_key=True, default=generate_uuid)
    device_id = Column(String, ForeignKey("child_devices.id"), nullable=False, index=True)
    generated_at = Column(DateTime, default=_now, nullable=False, index=True)
    classifier_label = Column(String, nullable=False)
    classifier_index = Column(Integer, nullable=False)
    classifier_probabilities_json = Column(Text, nullable=False)
    regressor_score = Column(Float, nullable=False)
    regressor_label = Column(String, nullable=False)
    data_sufficiency_json = Column(Text, nullable=False)

    device = relationship("ChildDevice")

    @property
    def classifier_probabilities(self) -> dict:
        try:
            return json.loads(self.classifier_probabilities_json)
        except Exception:
            return {}

    @classifier_probabilities.setter
    def classifier_probabilities(self, val: dict):
        self.classifier_probabilities_json = json.dumps(val)

    @property
    def data_sufficiency(self) -> dict:
        try:
            return json.loads(self.data_sufficiency_json)
        except Exception:
            return {}

    @data_sufficiency.setter
    def data_sufficiency(self, val: dict):
        self.data_sufficiency_json = json.dumps(val)


# ── Legacy Phase 8 / Phase 12 schema ──────────────────────────────────────
# These tables are referenced by archival feature_store / ml_pipeline /
# production_feature_builder code. They preserve access to the existing
# rows in `prism.db` (which has ~83K sensor_readings, ~264 behavior_windows,
# ~83K phone_events). Active code paths use RawSignalEvent / BaselineProfile
# instead; do NOT route new ingestion through these classes.


class SensorReading(Base):
    """Per-device raw sensor reading (heart-rate, step, etc.).

    Legacy schema kept so feature_store / ml_pipeline / production_feature_
    builder imports continue to resolve. New ingestion writes RawSignalEvent.
    """
    __tablename__ = "sensor_readings"

    id = Column(String, primary_key=True, default=generate_uuid)
    device_id = Column(String, ForeignKey("child_devices.id"), nullable=False, index=True)
    metric_type = Column(String, nullable=False, index=True)
    value = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=_now, nullable=False, index=True)


class PhoneEvent(Base):
    """Per-device phone interaction event (SCREEN_ON, SCREEN_OFF, UNLOCK, etc.).

    Legacy schema — new ingestion writes RawSignalEvent.
    """
    __tablename__ = "phone_events"

    id = Column(String, primary_key=True, default=generate_uuid)
    device_id = Column(String, ForeignKey("child_devices.id"), nullable=False, index=True)
    event_type = Column(String, nullable=False, index=True)
    timestamp = Column(DateTime, default=_now, nullable=False, index=True)


class BehaviorWindow(Base):
    """Aggregated behavior window (active minutes, sleep proxy, etc.).

    Legacy schema — kept so feature_store imports resolve.
    """
    __tablename__ = "behavior_windows"

    id = Column(String, primary_key=True, default=generate_uuid)
    subject_id = Column(String, ForeignKey("child_devices.id"), nullable=False, index=True)
    start_ts = Column(DateTime, nullable=False, index=True)
    end_ts = Column(DateTime, nullable=False)
    total_active_mins = Column(Float, nullable=True)
    sleep_hours_proxy = Column(Float, nullable=True)


class RiskScoreV2(Base):
    """V2 risk score row used by the Phase 10/12 multimodal engine.

    Kept for historical compatibility with the XAI / drift modules that
    import it. New writes go to the unified `RiskScore` table.
    """
    __tablename__ = "risk_scores_v2"

    id = Column(String, primary_key=True, default=generate_uuid)
    subject_id = Column(String, ForeignKey("child_devices.id"), nullable=False, index=True)
    score = Column(Float, nullable=False)
    tier = Column(String, nullable=False)  # baseline | change | multiple | high
    factors_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_now, nullable=False, index=True)
