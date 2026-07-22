# PRISM — Consent-First Behavioral Telemetry & Guardian Alerting

**PRISM** is a mobile + web platform that detects early behavioral well-being signals in teens from on-device metadata (GPS, accelerometer, keystroke timing, app usage) — never message content, audio, or video. It converts signals into explainable, non-diagnostic alerts for a guardian dashboard.

---

## Non-Negotiable Constraints

- ✅ **No raw content** — metadata only (never text, audio, video, screenshots)
- ✅ **Explainable outputs** — every ML signal ships with human-readable "contributing factors"
- ✅ **Auth + RBAC** — all guardian dashboard routes require JWT + role-based access control
- ✅ **TLS in transit, encrypted at rest** — sensitive fields use AES-256 encryption
- ✅ **Immutable audit logs** — every data-access event is logged
- ✅ **Teen-side transparency** — the app always discloses what is being monitored (no covert mode)

---

## Quick Start

### 1. Start with Docker Compose

All services (Postgres, Redis, API, Dashboard) in one command:

```powershell
Set-Location 'c:\Users\Jyotishmoy Gogoi\prism'
docker-compose up --build
```

### 2. Or Run Services Locally

**API** (FastAPI, port 8000):
```powershell
Set-Location 'c:\Users\Jyotishmoy Gogoi\prism\services\api'
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Dashboard** (Next.js, port 3000):
```powershell
Set-Location 'c:\Users\Jyotishmoy Gogoi\prism\apps\dashboard'
npm install
npm run dev
```

**Mobile** (React Native):
```powershell
Set-Location 'c:\Users\Jyotishmoy Gogoi\prism\apps\mobile'
npm install
npm run start
```

### Local Endpoints

| Service | URL | Notes |
|---------|-----|-------|
| API root | http://localhost:8000 | |
| API docs (Swagger) | http://localhost:8000/docs | Interactive API explorer |
| Dashboard | http://localhost:3000 | Guardian portal |
| WebSocket (events) | ws://localhost:8000/api/v1/events/ws | Real-time signal subscriptions |

---

## Testing

**Backend tests:**
```powershell
Set-Location 'c:\Users\Jyotishmoy Gogoi\prism\services\api'
python -m pytest app/tests -v
```

**Frontend type check & build:**
```powershell
Set-Location 'c:\Users\Jyotishmoy Gogoi\prism\apps\dashboard'
npx tsc --noEmit
npm run build
```

---

## Repository Structure

```
prism/
├── services/
│   ├── api/                  # FastAPI backend (Python)
│   │   ├── app/
│   │   │   ├── main.py       # App initialization & route mounting
│   │   │   ├── routes/       # API endpoint modules
│   │   │   ├── models/       # SQLAlchemy ORM definitions
│   │   │   ├── services/     # Business logic (auth, telemetry, ML)
│   │   │   ├── utils/        # Helpers (JWT, encryption, companion engine)
│   │   │   ├── middleware/   # Auth, audit logging, error handling
│   │   │   └── tests/        # Pytest test suite
│   │   └── requirements.txt  # Python dependencies
│   └── ml-engine/            # Python ML service
├── apps/
│   ├── dashboard/            # Next.js guardian portal (TypeScript/React)
│   ├── mobile/               # React Native teen app (TypeScript)
├── infra/
│   ├── docker-compose.yml    # Local dev stack (Postgres, Redis, etc.)
│   ├── Dockerfile.api        # API container image
│   └── ...
├── docs/
│   ├── architecture.md       # Tech stack & ADRs
│   ├── design-system.md      # UI patterns & component library
│   ├── API.md                # Endpoint reference
│   └── ...
└── .github/workflows/        # CI/CD pipelines
```

---

## Common Tasks

**I see a "Cannot find module" error in the dashboard:**
```powershell
# Clear stale Next.js build artifacts
Set-Location 'c:\Users\Jyotishmoy Gogoi\prism\apps\dashboard'
Remove-Item .next -Recurse -Force
npm run dev
```

**Port is already in use:**
```powershell
# Find and kill the process using the port
netstat -ano | findstr 8000
taskkill /PID <PID> /F
```

**WebSocket connection failing:**
Ensure `uvicorn[standard]` is installed (`websockets` support):
```powershell
pip install uvicorn[standard]
```

---

## Development Workflow

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes** and test locally (see "Testing" above).

3. **Run linting & formatting** before commit:
   - API: `black services/api/app && flake8 services/api/app`
   - Dashboard: `npm run lint` (ESLint)

4. **Commit with ADR references** (for significant changes):
   ```bash
   git commit -m "feat: add companion persona selector
   
   Implements 5-persona system as per docs/architecture.md#companion-personas
   Includes CBT, person-centered, solution-focused, clinical, mentor styles.
   
   Fixes #42"
   ```

5. **Open a PR** with tests and description. CI will lint, build, and run tests.

---

## Support & Documentation

- **ADRs & design docs**: [docs/](C:\Users\Jyotishmoy Gogoi\prism\docs)
- **API reference**: [docs/API.md](C:\Users\Jyotishmoy Gogoi\prism\docs\API.md)
- **Architecture & tech stack**: [docs/architecture.md](C:\Users\Jyotishmoy Gogoi\prism\docs\architecture.md)
- **UI design system**: [docs/design-system.md](C:\Users\Jyotishmoy Gogoi\prism\docs\design-system.md)
- **Issues & PRs**: [GitHub](https://github.com/orchiddutta10-web/PRISM-Psychological-Risk-Insight-Signal-Monitoring)

---

**Last updated**: 2026-07-23  
**Maintained by**: PRISM Team
