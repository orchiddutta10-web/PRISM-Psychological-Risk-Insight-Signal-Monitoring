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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

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
