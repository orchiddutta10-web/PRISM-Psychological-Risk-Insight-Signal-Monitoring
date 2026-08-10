import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Symmetric Fernet key for encrypting sensitive fields at rest (e.g. GPS coordinates).
    # Default is a cryptographically valid key for development only — MUST be overridden in production.
    ENCRYPTION_KEY: str = os.getenv(
        "ENCRYPTION_KEY", "vqZBWaQHgnNoRgzmwdx_lDAYjXgTCrGBTqdiIyOqchI="
    )

    # Meta API Webhook Configuration
    META_VERIFY_TOKEN: str = os.getenv("META_VERIFY_TOKEN", "prism_verify_secret")
    META_ACCESS_TOKEN: str = os.getenv("META_ACCESS_TOKEN", "")

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

    def __init__(self, **values):
        super().__init__(**values)
        # Enforce enterprise secret validation: fail start if default keys are found in production
        if self.ENV.lower() == "production":
            if self.JWT_SECRET == "super-secret-jwt-key-change-in-production-123456":
                raise ValueError(
                    "Security Hardening Failure: Default JWT_SECRET is active in production mode."
                )
            if self.ENCRYPTION_KEY == "vqZBWaQHgnNoRgzmwdx_lDAYjXgTCrGBTqdiIyOqchI=":
                raise ValueError(
                    "Security Hardening Failure: Default ENCRYPTION_KEY is active in production mode."
                )
            if self.META_VERIFY_TOKEN == "prism_verify_secret":
                raise ValueError(
                    "Security Hardening Failure: Default META_VERIFY_TOKEN is active in production mode."
                )


settings = Settings()
