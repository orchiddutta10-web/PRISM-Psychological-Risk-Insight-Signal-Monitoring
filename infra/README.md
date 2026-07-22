# PRISM Infrastructure

This directory houses the deployment configs, Docker builds, and CI configurations for testing and containerizing PRISM.

## Contents
- `Dockerfile` / `docker-compose.yml` for orchestrating local containers (Database, Redis, API, ML-workers, Dashboard).
- CI workflow configs (GitHub Actions, etc.) to enforce automated test coverage for RBAC, endpoints, and schema checks before merging.
