# PRISM Infrastructure

This directory houses the deployment configs, Docker builds, and CI configurations for testing and containerizing PRISM.

## Contents
- `docker-compose.yml` — orchestrates Postgres, Redis, the API, the Dashboard, and a TLS reverse proxy (Caddy).
- `Dockerfile.api` — multi-stage build for the FastAPI backend.
- `Caddyfile` — reverse-proxy config: `/api/*` → API, everything else → Dashboard, with automatic HTTPS (Let's Encrypt) via Caddy.
- CI workflow configs (GitHub Actions, etc.) to enforce automated test coverage for RBAC, endpoints, and schema checks before merging.

## Deployment (production)

The stack is designed to be **secure by default**:

- **TLS in transit:** public traffic enters through the Caddy proxy (`prism-proxy`) on
  ports 80/443. Set `DOMAIN` (and optionally `LETSENCRYPT_EMAIL`) in your `.env` to get
  automatic HTTPS certificates. The API binds only to `127.0.0.1:8000` and is never
  exposed directly.
- **Postgres & Redis are internal-only.** Their ports are NOT published to the host. The
  API reaches them over the private Docker network. For local development you can
  re-expose them with a `docker-compose.override.yml`, e.g.:

  ```yaml
  services:
    db:
      ports: ["5432:5432"]
    redis:
      ports: ["6379:6379"]
  ```

- **API → Postgres encryption:** `DATABASE_URL` uses `sslmode=prefer` by default. Once the
  Postgres server is configured with a TLS certificate, switch to `sslmode=require` for a
  hardened deployment.

### Required environment variables (`.env`)

```
DOMAIN=prism.example.com            # used for HTTPS + dashboard API URL
LETSENCRYPT_EMAIL=you@example.com   # optional, for Let's Encrypt
POSTGRES_PASSWORD=<strong-secret>
JWT_SECRET=<strong-random-secret>
ENCRYPTION_KEY=<valid-32-byte-fernet-key>
META_VERIFY_TOKEN=<secret>
META_APP_SECRET=<secret>
META_ACCESS_TOKEN=<secret>
```

The API's `config.py` **refuses to start** in production if `JWT_SECRET`,
`ENCRYPTION_KEY`, or `META_VERIFY_TOKEN` are still at their known defaults.

### Bring it up

```bash
cp .env.example .env   # fill in real secrets
docker compose up -d --build
```

The dashboard is served at `https://$DOMAIN` and the API at `https://$DOMAIN/api/...`.

## Local development (without Docker)

See `start_all.bat` (API on `:8000`, Dashboard on `:3000`) — uses SQLite and an in-memory
Redis fallback, no TLS needed.
