#!/bin/sh
set -eu

python manage.py migrate --noinput

if [ "${DJANGO_SEED_DEMO_DATA:-true}" = "true" ]; then
  python manage.py seed_demo_data
fi

exec "$@"
