# API Runbook — services/api

Purpose
- Operational steps for starting, stopping, diagnosing, and upgrading the PRISM FastAPI service.

Prerequisites
- Docker (for containerized runs) or Python 3.12 environment with dependencies installed.
- Environment variables: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`.

Local Development
- Run backend locally (dev):

```powershell
Set-Location 'c:\Users\Jyotishmoy Gogoi\prism\services\api'
C:/path/to/python -m pip install -r requirements.txt
C:/path/to/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- Or run via Docker Compose from repo root:

```powershell
Set-Location 'c:\Users\Jyotishmoy Gogoi\prism'
docker-compose up --build api db redis
```

Health Checks
- Root: `GET http://localhost:8000/` -> should return JSON `{"status":"online"...}`
- Docs: `http://localhost:8000/docs`

Logs and Diagnostics
- Local uvicorn logs will print to STDOUT. Use the terminal that launched the service.
- Container logs: `docker-compose logs -f api`

Common Troubleshooting
- 404 on `/api/v1/events/ws`: This is a WebSocket endpoint; connect with a WS client, not a GET request.
- WebSocket warning: install `uvicorn[standard]` or `websockets` to enable proper WS handling in dev/prod.

Maintenance
- Apply migrations (if using Alembic): `alembic upgrade head` (configure `alembic.ini` first).
- To rotate secrets: update environment variables via your secret manager and restart the service.

Rollback
- Re-deploy the previous image tag and restart the service. In container environments use image tags and orchestration rollbacks.

Contact
- Engineering on-call: engineering@company.example (replace with your team contact)
