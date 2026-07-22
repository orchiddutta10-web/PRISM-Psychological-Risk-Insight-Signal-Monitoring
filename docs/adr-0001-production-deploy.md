# ADR 0001 — Production Deployment & Environment

Status: Accepted
Date: 2026-07-19

Context
- The PRISM project runs a FastAPI backend (`services/api`) and a Next.js dashboard (`apps/dashboard`).
- For development we use local dev servers and Docker Compose for integrated services (Postgres, Redis, API, Dashboard).

Decision
- Production will use containerized services orchestrated via the existing Docker artifacts and a managed orchestrator (Kubernetes / ECS) in later phases.
- The canonical production deployment artifacts are:
  - `infra/Dockerfile.api` and `apps/dashboard/Dockerfile` for container builds
  - `infra/docker-compose.yml` for local integration testing and staging
- Use environment variables for secrets and configuration (JWT, ENCRYPTION_KEY, DATABASE_URL, REDIS_URL).
- Use TLS for all inbound traffic (load balancer terminating TLS) and encrypt sensitive fields at rest via a managed key in production (e.g., AWS KMS or Azure Key Vault).

Consequences
- Reproducible builds via Docker images.
- Local developers can run a close-to-staging stack via `docker-compose up`.
- Production requires secure secret management and automated deployment pipelines; manual docker-compose deployments are not recommended for production.

Rationale
- Containerization provides portability across CI/CD and cloud providers.
- Using `uvicorn[standard]` in production avoids missing WebSocket backends and improves performance.

Alternatives Considered
- Running the API directly on host Python: rejected for production because it complicates dependency and runtime parity.
- Using serverless: deferred for Phase 2 because we need persistent Redis/Postgres and greater control for audit logging.

Related ADRs
- ADR 0002 (Scaling and observability) — planned

Signed-off-by: PRISM Engineering
