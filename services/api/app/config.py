import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=True)

    PROJECT_NAME: str = "PRISM API Service"
    ENV: str = os.getenv("ENV", "development")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./prism.db")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    JWT_SECRET: str = os.getenv(
        "JWT_SECRET", "super-secret-jwt-key-change-in-production-123456"
    )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Symmetric Fernet key for encrypting sensitive fields at rest (e.g. GPS coordinates).
    ENCRYPTION_KEY: str = os.getenv(
        "ENCRYPTION_KEY", "U1RyT05nX0VOQ1JZUFRJT05fS0VZX0ZPUl9QUklTTV9URVNUMTIzNDU="
    )

    # Meta API Webhook Configuration
    META_VERIFY_TOKEN: str = os.getenv("META_VERIFY_TOKEN", "prism_verify_secret")
    META_ACCESS_TOKEN: str = os.getenv("META_ACCESS_TOKEN", "")

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

    def __init__(self, **values):
        super().__init__(**values)
        # Enforce enterprise secret validation: fail start if default keys are found in production
        if self.ENV.lower() == "production":
            if self.JWT_SECRET == "super-secret-jwt-key-change-in-production-123456":
                raise ValueError(
                    "Security Hardening Failure: Default JWT_SECRET is active in production mode."
                )
            if (
                self.ENCRYPTION_KEY
                == "U1RyT05nX0VOQ1JZUFRJT05fS0VZX0ZPUl9QUklTTV9URVNUMTIzNDU="
            ):
                raise ValueError(
                    "Security Hardening Failure: Default ENCRYPTION_KEY is active in production mode."
                )
            if self.META_VERIFY_TOKEN == "prism_verify_secret":
                raise ValueError(
                    "Security Hardening Failure: Default META_VERIFY_TOKEN is active in production mode."
                )


settings = Settings()
