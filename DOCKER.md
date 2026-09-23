# Docker Setup

Production-oriented local parity setup: MySQL + Node API + Nginx-served React build, orchestrated via Docker Compose.

## Prerequisites

1. Docker Desktop (or Docker Engine + Compose v2) installed.
2. `server/.env` present and filled in (copy from `server/.env.example`). Required at minimum: `JWT_SECRET`, `DB_USER`, `DB_NAME`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AI_CREDENTIAL_ENCRYPTION_KEY` (64 hex chars).
   - **Important:** set `DB_NAME=eyeojob` (lowercase). The SQL dump's `CREATE DATABASE`/`USE` statements target lowercase `eyeojob`, and MySQL on Linux (which is what runs inside the container regardless of host OS) treats database names as case-sensitive. A mismatched case here silently creates a second, empty database.
   - Leave `DB_HOST` as-is in your `.env` — Compose overrides it to `mysql` (the service name) automatically.

## Start

```bash
docker compose up --build
```

First run will:
- Build the server and client images.
- Start MySQL, wait for it to pass its healthcheck, then start the server.
- Load `db_backup/eyeojob_final_20260909_001926_with_sync_status.sql` into MySQL on first boot only (MySQL only runs `/docker-entrypoint-initdb.d` scripts against an empty data volume).

URLs:
- Frontend: http://localhost:5173
- API: http://localhost:5000

To point the client at a different API URL at build time, set `VITE_API_URL` in your shell/`.env` before building — it's baked into the static build, not read at runtime.

## Stop

```bash
docker compose down
```

## Reset (wipe database)

```bash
docker compose down -v
```

Drops the `mysql_data` volume, so the next `up --build` re-imports the SQL dump from scratch.

## Logs

```bash
docker compose logs -f server
docker compose logs -f mysql
docker compose logs -f client
```

## Notes

- Images run multi-stage builds; only production dependencies (`npm ci --omit=dev`) and built artifacts ship in the final server/client images.
- The server container runs as the non-root `node` user.
- No `.env` or secrets are copied into any image — `server/.env` is injected at container runtime via `env_file` in `docker-compose.yml`, not baked in.
- Client routing: `docker/nginx.conf` falls back unmatched paths to `/index.html`, so refreshing deep routes like `/login` or `/auth-success` works correctly.
