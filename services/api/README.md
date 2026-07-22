# PRISM API Service

This is the core backend API built using FastAPI. It manages client communication, handles metadata ingestion, enforces RBAC, and records every action to the immutable audit log.

## Features
- FastAPI asynchronous endpoints.
- JWT verification and Role-Based Access Control (RBAC).
- Telemetry ingestion routes.
- Immutable Audit Logger (writes all access logs to the DB).
- Queue pipeline triggering ML worker jobs.

## Tech Stack
- Python 3.10+
- FastAPI
- SQLAlchemy / SQLModel / asyncpg (PostgreSQL client)
- PyJWT for token generation/verification
- Cryptography (for field-level encryption at rest)
