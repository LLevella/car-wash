# syntax=docker/dockerfile:1
#
# All-in-one demo image: builds the React frontend, packages it inside the
# Django backend, runs migrations, seeds demo data + bookings, and exposes
# the whole stack on port 8000. Bake the image once, ``docker run`` once,
# point the browser at http://127.0.0.1:8000/.

FROM node:20-alpine AS frontend
WORKDIR /front

COPY front/package*.json ./
RUN npm ci

COPY front ./
ENV VITE_BASE=/static/
RUN npm run build


FROM python:3.11-slim AS demo
ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SECRET_KEY=demo-do-not-use-in-prod \
    DJANGO_DEBUG=false \
    DJANGO_ALLOWED_HOSTS=* \
    DJANGO_CSRF_TRUSTED_ORIGINS=http://127.0.0.1:8000,http://localhost:8000 \
    DJANGO_SESSION_COOKIE_SECURE=false \
    DJANGO_CSRF_COOKIE_SECURE=false \
    DJANGO_SECURE_SSL_REDIRECT=false \
    DJANGO_SERVE_SPA=true \
    DJANGO_SEED_DEMO_DATA=false \
    DATABASE_URL=sqlite:////app/back/db.sqlite3

WORKDIR /app

COPY requirements.txt /app/
RUN python -m pip install --upgrade pip \
 && pip install -r /app/requirements.txt

COPY back /app/back
COPY --from=frontend /front/dist /app/back/spa

WORKDIR /app/back

# Bake the demo state into the image so a fresh `docker run` already has
# realistic data on screen. WhiteNoise serves the prebuilt SPA from
# /app/back/staticfiles via collectstatic.
RUN python manage.py migrate --noinput \
 && python manage.py seed_demo_data \
 && python manage.py seed_demo_bookings \
 && python manage.py collectstatic --noinput

COPY docker/demo/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health/', timeout=3).status == 200 else 1)"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["python", "manage.py", "runserver", "--insecure", "0.0.0.0:8000"]
