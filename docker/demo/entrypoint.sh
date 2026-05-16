#!/bin/sh
set -eu

# The demo image already has migrations applied and demo data baked in, but
# re-running the idempotent seeds on every start keeps mounted SQLite files
# usable and restores the documented demo credentials after stale runs.

if [ ! -s /app/back/db.sqlite3 ]; then
  echo "demo: cold database, applying migrations and seeding..."
fi

python manage.py migrate --noinput
python manage.py seed_demo_data
python manage.py seed_demo_bookings

exec "$@"
