# Database Runbook — Postgres (prism-db)

Purpose
- Procedures for starting, backing up, restoring, and verifying the Postgres database used by PRISM.

Start / Stop
- With Docker Compose (recommended for local dev/staging):

```powershell
Set-Location 'c:\Users\Jyotishmoy Gogoi\prism'
docker-compose up -d db
# Stop
docker-compose stop db
```

Backups
- Local quick dump (running container):

```powershell
docker exec -t prism-db pg_dump -U prism_user prism_wellbeing > backup.sql
```

- Restore:

```powershell
cat backup.sql | docker exec -i prism-db psql -U prism_user -d prism_wellbeing
```

Health Checks
- Connection: `psql "postgresql://prism_user:${POSTGRES_PASSWORD}@localhost:5432/prism_wellbeing"` (set `POSTGRES_PASSWORD` from your secrets store; never hardcode it here)
- Use `pg_isready -h localhost -p 5432` to check readiness.

Maintenance
- Re-indexing: `REINDEX DATABASE prism_wellbeing;`
- Vacuum: `VACUUM ANALYZE;`

Important
- Do NOT store backups containing production secrets in plain public storage; use encrypted storage and follow retention policies.
