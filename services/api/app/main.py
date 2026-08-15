from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import json

from app import models
from app.database import engine, SessionLocal
from app.routes import (
    auth,
    consent,
    telemetry,
    audit,
    voice,
    companion,
    physio,
    medical,
    prism,
)
from app.config import settings
from app.utils.observability import setup_structured_logging, APMMiddleware

# Initialize structured JSON logging
setup_structured_logging()

# Initialize database tables on startup (useful for local development and SQLite tests)
models.Base.metadata.create_all(bind=engine)

# Seed the Risk Registry
from app.utils.risk_registry import seed_registry

seed_registry(SessionLocal())


class AuditLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        actor_id = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            try:
                from jose import jwt

                payload = jwt.decode(
                    token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
                )
                actor_id = payload.get("sub")
            except Exception as e:
                import logging

                logging.getLogger(__name__).warning(
                    "Failed to decode JWT for audit middleware: %s", str(e)
                )

        path = request.url.path
        method = request.method
        action = None

        if "physio" in path:
            action = "WRITE_PHYSIO_TELEMETRY"
        elif "events/ingest" in path:
            action = "WRITE_TELEMETRY"
        elif "events/alerts" in path:
            action = "READ_ALERTS"
        elif "events/scores" in path:
            action = "READ_RISK_SCORES"
        elif "consent" in path:
            action = "WRITE_CONSENT" if method == "POST" else "READ_CONSENT"
        elif "audit" in path:
            action = "READ_AUDIT_LOGS"
        elif "auth/login" in path:
            action = "LOGIN_ATTEMPT"
        elif "auth/register" in path:
            action = "SIGNUP_ATTEMPT"
        elif "voice/checkin" in path:
            action = "WRITE_VOICE_TELEMETRY"

        if action:
            db = SessionLocal()
            try:
                entry = models.AuditLogEntry(
                    actor_id=actor_id, action=action, resource=f"{method} {path}"
                )
                entry.context = {
                    "ip": request.client.host if request.client else None,
                    "status_code": response.status_code,
                }
                db.add(entry)
                db.commit()
            except Exception as e:
                print(f"Failed to log audit event: {e}")
            finally:
                db.close()

        return response


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Consent-first behavioral well-being signal telemetry ingestion and guardian alerting API.",
    version="1.0.0",
)


@app.on_event("startup")
def _prewarm_medical_rag():
    """
    Pre-warm the medical RAG stack so the first chatbot query doesn't pay the
    cold-start cost (embedding-model load, vector-store build). Runs in a
    background thread so startup isn't blocked.
    """
    import threading

    def _warm():
        try:
            from app.utils import medical_rag

            medical_rag.load_medical_documents()
            medical_rag.build_or_get_vectorstore()
            from app.utils.llm_provider import get_embeddings

            get_embeddings()
        except Exception as e:
            import logging

            logging.getLogger(__name__).warning(
                "Medical RAG pre-warm failed: %s", str(e)
            )

    threading.Thread(target=_warm, daemon=True).start()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enable APM request tracing & observability metrics middleware
app.add_middleware(APMMiddleware)

# Enable Immutable Audit Logging Middleware
app.add_middleware(AuditLoggingMiddleware)


# Root endpoint
@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "mode": "consent-first-telemetry",
    }


# Register routers
app.include_router(auth.router)
app.include_router(consent.router)
app.include_router(telemetry.router)
app.include_router(telemetry.internal_router)
app.include_router(audit.router)
app.include_router(voice.router)
app.include_router(companion.router)
app.include_router(physio.router)
app.include_router(medical.router)
app.include_router(prism.router)
