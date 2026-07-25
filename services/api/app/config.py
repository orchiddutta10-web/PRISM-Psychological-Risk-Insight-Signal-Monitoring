import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=True)

    PROJECT_NAME: str = "PRISM API Service"
    ENV: str = os.getenv("ENV", "development")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./prism.db")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "super-secret-jwt-key-change-in-production-123456")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Symmetric Fernet key for encrypting sensitive fields at rest (e.g. GPS coordinates).
    ENCRYPTION_KEY: str = os.getenv(
        "ENCRYPTION_KEY",
        "U1RyT05nX0VOQ1JZUFRJT05fS0VZX0ZPUl9QUklTTV9URVNUMTIzNDU="
    )

    # Meta API Webhook Configuration
    META_VERIFY_TOKEN: str = os.getenv("META_VERIFY_TOKEN", "prism_verify_secret")
    META_ACCESS_TOKEN: str = os.getenv("META_ACCESS_TOKEN", "")

    def __init__(self, **values):
        super().__init__(**values)
        # Enforce enterprise secret validation: fail start if default keys are found in production
        if self.ENV.lower() == "production":
            if self.JWT_SECRET == "super-secret-jwt-key-change-in-production-123456":
                raise ValueError("Security Hardening Failure: Default JWT_SECRET is active in production mode.")
            if self.ENCRYPTION_KEY == "U1RyT05nX0VOQ1JZUFRJT05fS0VZX0ZPUl9QUklTTV9URVNUMTIzNDU=":
                raise ValueError("Security Hardening Failure: Default ENCRYPTION_KEY is active in production mode.")
            if self.META_VERIFY_TOKEN == "prism_verify_secret":
                raise ValueError("Security Hardening Failure: Default META_VERIFY_TOKEN is active in production mode.")

settings = Settings()
