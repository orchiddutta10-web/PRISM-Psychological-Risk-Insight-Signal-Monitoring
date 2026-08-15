import os
import logging
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# Known insecure default values shipped only for local development/demo. In
# production these MUST be overridden via environment variables — the guard in
# Settings.__init__ refuses to start if any of them is still active.
_INSECURE_DEFAULTS = {
    "JWT_SECRET": "super-secret-jwt-key-change-in-production-123456",
    # NOTE: this default is a VALID Fernet key (dev/test only). It must be
    # overridden in production — the guard in __init__ enforces that.
    "ENCRYPTION_KEY": "zWPnl7ADt_siOkQKZgw7Xo0YLFqXnGgC-h-NdZWq09g=",
    "META_VERIFY_TOKEN": "prism_verify_secret",
}


API_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=API_DIR / ".env",
        env_file_encoding="utf-8",
    )

    PROJECT_NAME: str = "PRISM API Service"
    ENV: str = os.getenv("ENV", "development")
    DEMO_MODE: bool = os.getenv("DEMO_MODE", "True").strip().lower() in ("true", "1", "yes")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./prism.db")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    JWT_SECRET: str = os.getenv(
        "JWT_SECRET", "super-secret-jwt-key-change-in-production-123456"
    )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24h dev default

    # Symmetric Fernet key for encrypting sensitive fields at rest (e.g. GPS coordinates).
    # Default is a valid Fernet key for dev/test; MUST be overridden in production.
    ENCRYPTION_KEY: str = os.getenv(
        "ENCRYPTION_KEY", "zWPnl7ADt_siOkQKZgw7Xo0YLFqXnGgC-h-NdZWq09g="
    )

    # Meta API Webhook Configuration
    META_VERIFY_TOKEN: str = os.getenv("META_VERIFY_TOKEN", "prism_verify_secret")
    META_ACCESS_TOKEN: str = os.getenv("META_ACCESS_TOKEN", "")
    # Meta App Secret used to verify X-Hub-Signature-256 on inbound webhooks.
    # REQUIRED for webhook POSTs to be accepted (fails closed when unset).
    META_APP_SECRET: str = os.getenv("META_APP_SECRET", "")

    # Rate limiting on auth endpoints. Default ON in all environments; the test
    # suite explicitly disables it (see conftest.py) to avoid self-lockout.
    RATE_LIMIT_ENABLED: bool = True

    # NOVA backend-only LLM configuration.
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv(
        "GEMINI_MODEL", os.getenv("NOVA_AI_MODEL", "gemini-3.5-flash-lite")
    )
    NOVA_AI_TIMEOUT_SECONDS: float = float(os.getenv("NOVA_AI_TIMEOUT_SECONDS", "20"))
    NOVA_AI_MAX_ATTEMPTS: int = int(os.getenv("NOVA_AI_MAX_ATTEMPTS", "3"))
    NOVA_AI_BACKOFF_INITIAL_SECONDS: float = float(
        os.getenv("NOVA_AI_BACKOFF_INITIAL_SECONDS", "1")
    )
    NOVA_AI_BACKOFF_MAX_SECONDS: float = float(
        os.getenv("NOVA_AI_BACKOFF_MAX_SECONDS", "8")
    )

    # ── Medical AI Healthcare Assistant (RAG) ──────────────────────────
    # Defaults OFF so existing behavior/tests stay hermetic until configured.
    MEDICAL_RAG_ENABLED: bool = (
        os.getenv("MEDICAL_RAG_ENABLED", "false").lower() == "true"
    )
    # LLM backend: "openai" (requires OPENAI_API_KEY) or "ollama" (local).
    MEDICAL_LLM_PROVIDER: str = os.getenv("MEDICAL_LLM_PROVIDER", "ollama")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.1")
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    CHROMA_PERSIST_DIR: str = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")
    CHROMA_COLLECTION: str = os.getenv("CHROMA_COLLECTION", "medical_kb")
    MEDICAL_KB_DIR: str = os.getenv("MEDICAL_KB_DIR", "./medical_kb")
    CHAT_HISTORY_LIMIT: int = 10

    # ── PRISM 57-feature Model Configurations ──────────────────────────
    # The artifacts were trained under scikit-learn 1.6.1. They deserialize
    # cleanly under any 1.6.x / 1.7.x / 1.8.x runtime; we pin the floor at 1.6.
    PRISM_MODEL_DIR: str = os.getenv("PRISM_MODEL_DIR", "app/resources/prism/")

    # Classifier classes [0, 1, 2] returned by prism_classifier_model.joblib.
    # The semantic meaning of each class index is NOT in the repo and is NOT
    # derivable from the codebase. The strings below are safe placeholder
    # names pending confirmation against the original training documentation.
    # Override via env vars PRISM_LABEL_0 / PRISM_LABEL_1 / PRISM_LABEL_2.
    PRISM_LABEL_0: str = os.getenv("PRISM_LABEL_0", "Stable")          # REQUIRES CONFIRMATION
    PRISM_LABEL_1: str = os.getenv("PRISM_LABEL_1", "Watch")           # REQUIRES CONFIRMATION
    PRISM_LABEL_2: str = os.getenv("PRISM_LABEL_2", "Attention")       # REQUIRES CONFIRMATION

    PRISM_CLASSIFIER_LABELS: dict[int, str] = {
        0: PRISM_LABEL_0,
        1: PRISM_LABEL_1,
        2: PRISM_LABEL_2,
    }

    # Regressor tier thresholds on the [0, 1] continuous output.
    # The semantic meaning / units of the regressor output are NOT in the repo.
    # Override via env vars PRISM_REGRESSOR_LOW_MAX / PRISM_REGRESSOR_HIGH_MIN.
    PRISM_REGRESSOR_LOW_MAX: float = float(os.getenv("PRISM_REGRESSOR_LOW_MAX", "0.33"))
    PRISM_REGRESSOR_HIGH_MIN: float = float(os.getenv("PRISM_REGRESSOR_HIGH_MIN", "0.66"))
    PRISM_REGRESSOR_NAME: str = os.getenv("PRISM_REGRESSOR_NAME", "Prism continuous score")
    PRISM_INSUFFICIENT_DATA_MESSAGE: str = (
        "Insufficient data to run PRISM 57-feature prediction."
    )

    # ── Module 10: Future IoT Integration (MQTT bridge) ──────────────
    MQTT_BROKER_URL: str = os.getenv("MQTT_BROKER_URL", "mqtt://localhost:1883")
    MQTT_TOPIC_PREFIX: str = os.getenv("MQTT_TOPIC_PREFIX", "prism/vitals")

    def __init__(self, **values):
        super().__init__(**values)
        # Enforce enterprise secret validation: fail start if default keys are found in production
        if self.ENV.lower() == "production":
            for name, default in _INSECURE_DEFAULTS.items():
                if getattr(self, name) == default:
                    raise ValueError(
                        f"Security Hardening Failure: Default {name} is active in production mode."
                    )
        else:
            # Non-production: warn (not fail) so local dev/demo still works, but
            # make it obvious that these defaults must not reach production.
            for name, default in _INSECURE_DEFAULTS.items():
                if getattr(self, name) == default:
                    logger.warning(
                        "Using default %s in non-production environment — set it in production!",
                        name,
                    )


settings = Settings()
