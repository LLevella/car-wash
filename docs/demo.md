# Demo image

A self-contained Docker image that bundles the Django backend, the
prebuilt React frontend, and a seeded SQLite database so the entire
product can be demoed with one command.

## One command

```bash
docker compose -f docker-compose.demo.yml up --build
```

(or, equivalent without compose:)

```bash
docker build -t car-wash-demo -f docker/demo/Dockerfile .
docker run --rm -p 8000:8000 car-wash-demo
```

Open <http://127.0.0.1:8000/> — the React app is served by the same
Django process that exposes the API. No frontend dev server is needed.

Stop with `Ctrl+C` (compose) or `docker stop`.

## What's inside

The image is multi-stage:

1. `node:20-alpine` builds the React production bundle with
   `VITE_BASE=/static/` so the HTML references hashed assets under
   `/static/`.
2. `python:3.11-slim` installs backend dependencies (including
   `whitenoise`), copies the SPA bundle into `back/spa/`, then runs
   `migrate`, `seed_demo_data`, `seed_demo_bookings`, and
   `collectstatic --noinput`.
3. The container starts Django via `runserver --insecure` (DEBUG off,
   WhiteNoise serves the SPA static files).

`DJANGO_SERVE_SPA=true` activates a Django catch-all that returns
`back/spa/index.html` for every non-API path so React Router resolves
client-side. `/api/`, `/admin/`, `/health/`, and `/static/` keep their
regular handlers.

## What's seeded

`seed_demo_data` creates:

- demo users `demo_customer` / `demo_manager` / `demo_admin`
  (password `password` for all),
- a `Demo Station` with two bays, two washers, prices, and shifts,
- a baseline customer + Sedan car.

`seed_demo_bookings` adds:

- shifts for yesterday, today, and tomorrow,
- two extra customers (`demo_customer_2`, `demo_customer_3`),
- six bookings spread across statuses (`pending`, `confirmed`,
  `in_progress`, `completed`, `no_show`, plus a cancelled one),
- payments on the bookings that should be marked paid,
- audit-log entries and notification-outbox rows recorded
  transactionally by the booking service.

So the manager flow has bookings on the schedule, the audit history is
populated, and the reports page shows real numbers immediately.

## Logging in

| Username        | Password   | Role     |
| --------------- | ---------- | -------- |
| `demo_customer` | `password` | customer |
| `demo_manager`  | `password` | manager  |
| `demo_admin`    | `password` | admin    |

The login form pre-fills `demo_manager`; switch the username to log in
as someone else.

### Self-registration

The login page also has a "Зарегистрироваться" link that goes to
`/register`. New customers fill in username, password (twice for
confirmation), name, and phone, and are logged in immediately on
success — no admin intervention required. The new user starts without
a car; the booking flow shows a CTA to add one via `/my/cars`.

## Endpoints exposed

| URL                       | Description                              |
| ------------------------- | ---------------------------------------- |
| `/`                       | React SPA (serves `index.html`)          |
| `/api/...`                | All API routes                           |
| `/api/schema/swagger/`    | Swagger UI (manager/admin only)          |
| `/admin/`                 | Django admin (`demo_admin` is superuser) |
| `/health/`                | Liveness probe                           |
| `/health/ready/`          | Readiness probe (checks DB)              |

## Resetting the demo

The seeded SQLite file is baked into the image. To roll back to a clean
state, `docker stop` the container and `docker run` it again from the
same image — the image itself never mutates.

If you mount a volume on `/app/back/db.sqlite3` (not the default), the
entrypoint re-seeds the data on a cold database the first time the
container starts.
