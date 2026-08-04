from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import json

from app import models
from app.database import engine, SessionLocal
from app.routes import auth, consent, telemetry, audit, voice, companion, physio
from app.config import settings
from app.utils.observability import setup_structured_logging, APMMiddleware

# Initialize structured JSON logging
setup_structured_logging()

# Initialize database tables on startup (useful for local development and SQLite tests)
models.Base.metadata.create_all(bind=engine)

# Seed the Risk Registry
from app.utils.risk_registry import seed_registry

seed_registry(SessionLocal())


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response


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
                from datetime import datetime, timezone

                from app.utils.audit import compute_entry_hash

                # Chain onto the most recent entry's hash (None for the first entry).
                last = (
                    db.query(models.AuditLogEntry)
                    .order_by(
                        models.AuditLogEntry.timestamp.desc(),
                        models.AuditLogEntry.id.desc(),
                    )
                    .first()
                )
                prev_hash = last.entry_hash if last else None

                now = datetime.now(timezone.utc)
                entry = models.AuditLogEntry(
                    actor_id=actor_id,
                    action=action,
                    resource=f"{method} {path}",
                    timestamp=now,
                    prev_hash=prev_hash,
                )
                ctx = {
                    "ip": request.client.host if request.client else None,
                    "status_code": response.status_code,
                }
                entry.context = ctx
                entry.entry_hash = compute_entry_hash(
                    prev_hash, actor_id, action, entry.resource, now, ctx
                )
                db.add(entry)
                db.commit()
            except Exception as e:
                import logging

                logging.getLogger(__name__).warning(
                    "Failed to log audit event: %s", type(e).__name__
                )
            finally:
                db.close()

        return response


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Consent-first behavioral well-being signal telemetry ingestion and guardian alerting API.",
    version="1.0.0",
)

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

# Enable security headers on every response
app.add_middleware(SecurityHeadersMiddleware)


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
