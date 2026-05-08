# Operations runbook

Operational guide for the Car Wash backend covering health probes,
backup/restore for SQLite and PostgreSQL, and the production-grade Docker
Compose layout.

## Health probes

The backend exposes two endpoints intended for orchestrators and external
monitors:

- `GET /health/` — liveness probe. Returns `{"status": "ok"}` and never
  fails on its own. Use it to confirm the process is alive.
- `GET /health/ready/` — readiness probe. Issues a `SELECT 1` against the
  default database connection. Returns `{"status": "ready"}` on success
  and HTTP 503 with `{"status": "unavailable", "detail": ...}` when the
  database is unreachable. Wire this one into the orchestrator so
  traffic stops while the backend cannot reach its DB.

Both endpoints emit `Cache-Control: no-store`.

## Health diagnostics command

`python manage.py health_diagnostics` prints a one-shot ops report:

- database engine and configured database name,
- pending migrations,
- pending notifications in `NotificationOutbox`,
- counts of bookings by status for the last 7 days.

The command exits with status 1 if the database is unreachable, so it is
safe to wire into deploy smoke tests.

## SQLite backup and restore

SQLite remains supported for local development and small single-process
deployments.

### Online backup

```bash
sqlite3 back/db.sqlite3 ".backup /path/to/backup-$(date +%F).sqlite3"
```

The `.backup` command takes a consistent snapshot while the application
keeps running.

### Offline copy

```bash
docker compose stop backend
cp back/db.sqlite3 /path/to/backup-$(date +%F).sqlite3
docker compose start backend
```

### Restore

Stop the backend, replace the file, start the backend, run migrations
and the seed/demo data command if applicable:

```bash
docker compose stop backend
cp /path/to/backup-2026-05-08.sqlite3 back/db.sqlite3
docker compose start backend
docker compose exec backend python manage.py migrate --noinput
```

## PostgreSQL backup and restore

For production deploys via `DATABASE_URL=postgres://...` use `pg_dump`.

### Logical backup

```bash
pg_dump --format=custom --file=carwash-$(date +%F).dump \
        --host=db.example.com --username=carwash carwash
```

Custom format supports parallel restore and selective recovery.

### Restore

```bash
pg_restore --clean --if-exists --no-owner --jobs=4 \
           --host=db.example.com --username=carwash \
           --dbname=carwash carwash-2026-05-08.dump
python manage.py migrate --noinput
```

Run `migrate --noinput` after restore in case the schema diverged from
the dump.

### Continuous backups

For real production environments configure WAL archiving or use a
managed Postgres with daily snapshots. The application does not require
any application-level backup hook beyond the schema described above.

## Docker Compose: SQLite vs. PostgreSQL

`docker-compose.yml` is the dev-friendly default and uses SQLite stored
in the `backend-data` volume. A production-flavoured override
(`docker-compose.postgres.yml`) adds a PostgreSQL service and points the
backend at it.

```bash
# SQLite (default)
docker compose up --build

# PostgreSQL
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up --build
```

The override:

- adds a `db` service running `postgres:16-alpine` with a `pg_isready`
  healthcheck,
- mounts a `postgres-data` volume so data persists across recreations,
- sets `DATABASE_URL=postgres://carwash:carwash@db:5432/carwash` and
  `DJANGO_DEBUG=false` on the backend,
- forces the backend to wait for the PostgreSQL healthcheck before
  starting.

## Structured logging

Production runs emit JSON log lines via `back.logging_extensions.JsonFormatter`.
Each line is one JSON object with `time`, `level`, `logger`, `message`
fields. Toggle with `DJANGO_LOG_JSON` (defaults to true when
`DJANGO_DEBUG=false`). Adjust the threshold via `DJANGO_LOG_LEVEL`
(default `INFO`).

Example production log line:

```json
{"time":"2026-05-08T16:42:11","level":"INFO","logger":"django.request","message":"GET /api/manager/schedule/ 200"}
```

Pipe these into Cloud Logging, ELK, or Datadog without further
formatting.
