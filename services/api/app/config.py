import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env")

    PROJECT_NAME: str = "PRISM API Service"
    ENV: str = os.getenv("ENV", "development")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./prism.db")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Symmetric Fernet key for encrypting sensitive fields at rest (e.g. GPS coordinates).
    ENCRYPTION_KEY: str

    # Meta API Webhook Configuration
    META_VERIFY_TOKEN: str
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

    # ── Module 10: Future IoT Integration (MQTT bridge) ──────────────
    MQTT_BROKER_URL: str = os.getenv("MQTT_BROKER_URL", "mqtt://localhost:1883")
    MQTT_TOPIC_PREFIX: str = os.getenv("MQTT_TOPIC_PREFIX", "prism/vitals")

    def __init__(self, **values):
        super().__init__(**values)
        if not self.JWT_SECRET or not self.ENCRYPTION_KEY:
            raise ValueError(
                "Required secrets (JWT_SECRET, ENCRYPTION_KEY) must be provided in the environment or .env file."
            )


settings = Settings()
