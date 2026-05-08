#!/bin/sh
set -eu

# The demo image already has migrations applied and demo data seeded at
# build time (see docker/demo/Dockerfile). The entrypoint only needs to
# guarantee the SQLite file is writable and to keep the seeded state
# idempotent if someone mounts a volume over /app/back/data — re-running
# the seed commands in that case re-creates the rows without
# duplicating anything.

if [ ! -s /app/back/db.sqlite3 ]; then
  echo "demo: cold database, applying migrations and seeding..."
  python manage.py migrate --noinput
  python manage.py seed_demo_data
  python manage.py seed_demo_bookings
fi

exec "$@"
