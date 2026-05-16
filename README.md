# Car Wash

[English](#english) | [Русский](#русский)

## English

Car Wash is a Django + Django REST Framework backend for customer car wash
booking and manager-side workday planning: bay loading, washer shifts, order
assignments, rescheduling, cancellations, and resource blocks.

The full target architecture and development plan, including backend,
frontend, infrastructure, testing, and the production roadmap, are
consolidated in
[docs/full-project-plan.md](docs/full-project-plan.md).

### Features

- Dictionaries for stations, wash bays, car types, and wash types.
- Price, duration, down payment, and residual calculation based on station
  tariffs.
- Available slot calculation based on wash bays, washer shifts, active bookings,
  and resource blocks.
- Customer booking with statuses: `pending`, `confirmed`, `in_progress`,
  `completed`, `cancelled`, `no_show`.
- Washer assignment and resource blocks for bay maintenance, washer absence, or
  technical breaks.
- Manager API for daily schedule planning, manual assignments, shifts, and
  resource blocks.

### Stack

- Python 3.10-3.13 recommended for Django 5.2 LTS
- Django 5.2 LTS
- Django REST Framework 3.17
- djangorestframework-jsonapi 8.1
- django-filter 25
- psycopg2-binary for PostgreSQL deployments
- SQLite for development; PostgreSQL is supported for production via `DATABASE_URL`

### Project Structure

```text
car-wash/
├── docker/                # Docker images and runtime entrypoints
├── docker-compose.yml     # One-command local full-system startup
├── .github/
│   └── workflows/
│       └── ci-cd.yml      # GitHub Actions CI/CD workflow
├── .coveragerc            # coverage settings for CI and local checks
├── .env.example           # environment variable template
├── .gitignore             # local Python, coverage, and editor artifacts
├── back/                  # Django project
│   ├── back/              # settings, urls, wsgi
│   ├── car_wash/          # bays, wash types, prices, bookings
│   │   └── services/      # pricing, availability, booking
│   ├── cars/              # car brands, models, and types
│   ├── customer/          # customers and their cars
│   ├── personal/          # washers, stations, shifts
│   ├── main/              # legacy Schedule, gradually replaced by Booking
│   ├── manage.py
│   └── db.sqlite3            # local runtime file, ignored by git
├── docs/
│   └── full-project-plan.md
├── front/                 # Vite + React + TypeScript frontend
│   ├── src/
│   │   ├── api/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── layouts/
│   │   └── styles/
│   └── package.json
└── requirements.txt
```

### Frontend

The frontend is a Vite + React + TypeScript SPA located in `front/`. It is a
working operations UI rather than a marketing page: customers can book a wash
and manage their cars, while managers can operate the daily schedule.

- Routing is defined in `front/src/app/router.tsx` with role-protected customer
  and manager workspaces.
- API access lives in `front/src/api/`; `types-generated.ts` is generated from
  `openapi.yaml`, while `types.ts` contains the handwritten domain types used
  by the UI.
- Shared layout and controls live in `front/src/components/` and
  `front/src/layouts/`.
- Feature screens live in `front/src/features/`: auth, booking, customer cars,
  manager bookings, schedule, shifts, resource blocks, and reports.
- Localization lives in `front/src/i18n/` with Russian, English, and Turkish
  translations plus shared date/time/money format helpers.

Customer routes:

| Route | Purpose |
| ----- | ------- |
| `/login` | Session login |
| `/register` | Customer self-registration |
| `/book` | Create a booking from available slots |
| `/my/bookings` | Customer booking list |
| `/my/bookings/:bookingId` | Customer booking details |
| `/my/cars` | Customer car management |

Manager routes:

| Route | Purpose |
| ----- | ------- |
| `/manager/schedule` | Daily station schedule with assignments |
| `/manager/bookings` | Manager booking list and filters |
| `/manager/bookings/:bookingId` | Booking detail, status, audit, assignment |
| `/manager/shifts` | Washer shift management |
| `/manager/resource-blocks` | Station, bay, and washer blocks |
| `/manager/reports` | Daily/period aggregate reports |

The SPA uses cookie-based Django session authentication. Before unsafe
requests it fetches/uses the CSRF cookie and sends `X-CSRFToken`. In
development Vite proxies same-origin `/api` and `/health` calls to Django; in
production the app can either be served from the same origin or configured with
`VITE_API_BASE_URL`.

### Setup

Python 3.10-3.13 is recommended for this Django 5.2 LTS project.

Single-container demo (frontend + backend + seeded data, no extra
services):

```bash
docker compose -f docker-compose.demo.yml up --build
# open http://127.0.0.1:8000/
```

See [docs/demo.md](docs/demo.md) for what's seeded.

Fast dev-style full-system startup with Docker (frontend on Vite dev
server, backend on Django runserver, two containers):

```bash
docker compose up --build
```

After startup:

- Frontend: http://127.0.0.1:5173/
- Backend API: http://127.0.0.1:8000/api/
- Admin: http://127.0.0.1:8000/admin/
- Healthcheck: http://127.0.0.1:8000/health/

The backend container applies migrations automatically and seeds demo data by
default. Demo users are `demo_customer` / `password`, `demo_manager` /
`password`, and `demo_admin` / `password`. The SQLite database is stored in the
`backend-data` Docker volume. To reset the demo database:

```bash
docker compose down -v
docker compose up --build
```

To start without demo data, set `DJANGO_SEED_DEMO_DATA=false` for the backend
service in `docker-compose.yml` before recreating the volume.

Manual local setup:

```bash
# 1. Clone the repository and enter it
git clone <repo-url> car-wash
cd car-wash

# 2. Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Apply migrations
cd back
export DJANGO_DEBUG=true
export DJANGO_SECRET_KEY="local-dev-secret-key-change-me"
python manage.py migrate

# 5. Create an admin user
python manage.py createsuperuser

# 6. Run the development server
python manage.py runserver
```

After startup:

- Admin: http://127.0.0.1:8000/admin/
- API: http://127.0.0.1:8000/api/
- Healthcheck: http://127.0.0.1:8000/health/

Optional demo data:

```bash
python manage.py seed_demo_data
```

Frontend development:

```bash
cd front
npm install
npm run dev
```

The Vite dev server runs on http://127.0.0.1:5173/ and proxies `/api` and
`/health` to the Django server on http://127.0.0.1:8000/.

Frontend checks:

```bash
cd front
npm run lint
npm test
npm run build
```

E2E smoke tests run against the Docker stack with demo data:

```bash
docker compose up --build -d
cd front
npm run test:e2e
```

Demo users:

- `demo_customer` / `password`
- `demo_manager` / `password`
- `demo_admin` / `password`

Local authentication:

- Use `/admin/` or the DRF browsable API login for session authentication.
- `demo_customer` can access customer booking endpoints.
- `demo_manager` and `demo_admin` can access manager endpoints.
- SPA clients can use JSON session auth endpoints under `/api/auth/`.

### Runtime Configuration

Runtime settings are read from environment variables. See `.env.example` for a
copyable template. The project does not load `.env` by itself; export variables
in your shell, process manager, container, or hosting platform.

| Variable | Purpose | Default |
| -------- | ------- | ------- |
| `DJANGO_SECRET_KEY` | Django secret key | required outside debug/test |
| `DJANGO_DEBUG` | Enables debug mode | `false` outside tests |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated allowed hosts | local hosts in debug |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Comma-separated CSRF trusted origins | empty |
| `DJANGO_CORS_ALLOWED_ORIGINS` | Comma-separated origins allowed to call the API from a separate frontend host | empty |
| `DJANGO_CORS_ALLOW_CREDENTIALS` | Allows session cookies on CORS requests | `true` when CORS origins are set |
| `VITE_API_BASE_URL` | Frontend build-time API origin. Leave empty for same-origin `/api/` | empty |
| `DATABASE_URL` | Database URL. Supports SQLite and PostgreSQL | `back/db.sqlite3` |
| `DJANGO_SECURE_SSL_REDIRECT` | Redirect HTTP to HTTPS | `not DEBUG` |
| `DJANGO_SESSION_COOKIE_SECURE` | Secure session cookie flag | `not DEBUG` |
| `DJANGO_CSRF_COOKIE_SECURE` | Secure CSRF cookie flag | `not DEBUG` |
| `DJANGO_SECURE_HSTS_SECONDS` | HSTS max age | `31536000` when `not DEBUG`, else `0` |
| `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS` | Include subdomains in HSTS | `not DEBUG` |
| `DJANGO_SECURE_HSTS_PRELOAD` | Enable HSTS preload flag | `false` |
| `DJANGO_SECURE_PROXY_SSL_HEADER` | Trust `X-Forwarded-Proto: https` | `false` |
| `DRF_AUTH_LOGIN_THROTTLE_RATE` | Rate limit for login attempts | `20/min` |
| `DRF_AUTH_REGISTER_THROTTLE_RATE` | Rate limit for registrations | `5/hour` |

PostgreSQL example:

```bash
export DJANGO_DEBUG=false
export DJANGO_SECRET_KEY="<strong-secret>"
export DJANGO_ALLOWED_HOSTS="carwash.example.com"
export DATABASE_URL="postgres://carwash:password@localhost:5432/carwash"
```

Frontend production modes:

- Same-origin: leave `VITE_API_BASE_URL` empty and route `/api/` and
  `/health/` to Django from the same public origin.
- Separate frontend host: set `VITE_API_BASE_URL` to the backend origin, and
  add the frontend origin to both `DJANGO_CORS_ALLOWED_ORIGINS` and
  `DJANGO_CSRF_TRUSTED_ORIGINS`.

### API

The root API prefix is `/api/`.

| Prefix             | Purpose                                      |
| ------------------ | -------------------------------------------- |
| `/api/cars/`       | Car brands, models, and types                |
| `/api/customers/`  | Customers and their cars                     |
| `/api/personal/`   | Washers, stations, shifts                    |
| `/api/auth/`       | Session auth, current user, CSRF             |
| `/api/car-wash/`   | Wash types, prices, bays, bookings           |
| `/api/manager/`    | Schedule, assignments, shifts, resource blocks |

Authentication:

```text
GET    /api/auth/csrf/
POST   /api/auth/login/
POST   /api/auth/logout/
GET    /api/auth/me/
```

Dictionaries and customer profile:

```text
GET    /api/cars/brands/
GET    /api/cars/models/
GET    /api/cars/types/
GET    /api/personal/stations/
GET    /api/car-wash/wash-types/
GET    /api/customers/me/
GET    /api/customers/cars/
POST   /api/customers/cars/
PATCH  /api/customers/cars/{id}/
DELETE /api/customers/cars/{id}/
```

Available slots:

```text
GET /api/car-wash/availability/?station=1&car_type=1&wash_type=1&date=2026-05-06
```

Bookings:

```text
GET    /api/car-wash/bookings/
POST   /api/car-wash/bookings/
PATCH  /api/car-wash/bookings/{id}/cancel/
PATCH  /api/car-wash/bookings/{id}/reschedule/
PATCH  /api/car-wash/bookings/{id}/status/
```

Manager workspace:

```text
GET    /api/manager/schedule/?station=1&date=2026-05-06
GET    /api/manager/bookings/
PATCH  /api/manager/bookings/{id}/assign/
PATCH  /api/manager/bookings/{id}/status/
GET    /api/manager/shifts/
POST   /api/manager/shifts/
GET    /api/manager/resource-blocks/
POST   /api/manager/resource-blocks/
```

Current endpoints accept and return regular JSON. DRF JSON:API components
remain enabled for future compatibility.

Successful API responses use the same envelope:

```json
{
  "data": {}
}
```

Error responses use a stable form contract so the frontend can render field
errors consistently:

```json
{
  "detail": "Human-readable error.",
  "field_errors": {
    "field_name": ["Field-specific message."]
  },
  "code": "machine_readable_code"
}
```

### Service Layer

Business logic lives in `back/car_wash/services/`:

- `pricing.py` - duration and price lookup, down payment and residual
  calculation via `PricingQuote`.
- `availability.py` - available slot calculation with bays, shifts, active
  bookings, and `ResourceBlock`.
- `booking.py` - booking creation, rescheduling, cancellation, status changes,
  and resource assignment inside transactions.

Statuses that block capacity: `pending`, `confirmed`, `in_progress`. Statuses
`cancelled`, `completed`, and `no_show` do not block slots.

### Access Control

The backend uses Django users and groups:

- `customer` - can create bookings and see only bookings linked to their
  `Customer.user` profile.
- `manager` - can use manager endpoints, assign resources, manage shifts, and
  change booking statuses.
- `admin` - has manager-level API access; Django staff and superusers are also
  treated as admins.

Availability lookup remains public. Booking endpoints require an authenticated
customer, manager, or admin. Manager endpoints require a manager or admin.
Managers are additionally limited by `ManagerStationAccess`: schedule,
assignment, shift, resource block, and manager booking endpoints only expose
stations explicitly assigned to that user. Admin users keep unrestricted station
access.

### Tests

```bash
cd back
python manage.py test
```

Coverage check:

```bash
pip install "coverage>=7,<8"
cd back
coverage run --rcfile=../.coveragerc manage.py test
coverage report --rcfile=../.coveragerc
```

### CI/CD

GitHub Actions workflow: `.github/workflows/ci-cd.yml`.

- Runs on pushes and pull requests to `master` and `main`, and can be started
  manually with `workflow_dispatch`.
- Uses Python 3.11, installs project dependencies, checks that migrations are
  up to date, applies migrations, runs Django deployment checks, and runs tests
  with coverage.
- Uses Node.js for `front/`, installs npm dependencies, runs lint, formatting
  check, Vitest, and production build, then uploads `front/dist/` as the
  `frontend-dist` artifact.
- `.github/workflows/e2e.yml` can be started manually to run Playwright smoke
  tests against the full Docker stack.
- Coverage must stay at or above 80%.
- The deploy job runs only after successful backend and frontend CI on pushes to
  `master` or `main`. It is skipped until SSH deployment secrets are configured.

Deployment secrets:

- `DEPLOY_HOST` - server hostname or IP.
- `DEPLOY_PORT` - optional SSH port, defaults to `22`.
- `DEPLOY_USER` - SSH user.
- `DEPLOY_KEY` - private SSH key.
- `DEPLOY_PATH` - project path on the server for the default command.
- `DEPLOY_FRONTEND_PATH` - optional directory where the `frontend-dist` artifact
  should be unpacked, for example an Nginx static root.
- `DEPLOY_COMMAND` - optional full remote deploy command. When omitted, the
  workflow pulls the project, runs migrations, and either uploads the
  `frontend-dist` artifact to `DEPLOY_FRONTEND_PATH` or builds `front/dist/` on
  the server when no frontend artifact path is configured.

### Development Status

Backend stages 1-16 and frontend MVP stages 1-8 are complete: project
setup, data model, pricing, availability, booking, manager workspace,
role-based access control, tests, demo data, CI/CD, production-ready
runtime configuration, model cleanup, SPA auth API, frontend dictionary
API, unified API contract, multiple customer cars, and per-station manager
access; frontend reaches production build/deploy. See
[docs/full-project-plan.md](docs/full-project-plan.md) for details,
acceptance criteria, and the upcoming roadmap (B17-B24, F9-F14).

## Русский

Car Wash - backend на Django + Django REST Framework для записи клиентов на
автомойку и планирования рабочего дня руководителем: загрузка боксов, смены
мойщиков, назначения на заказы, переносы, отмены и блокировки ресурсов.

Полная целевая архитектура и план разработки backend, frontend,
инфраструктуры, тестирования и production-roadmap собраны в
[docs/full-project-plan.md](docs/full-project-plan.md).

### Возможности

- Справочники станций, боксов, типов автомобилей и типов мойки.
- Расчет стоимости, длительности, аванса и остатка по тарифам станции.
- Расчет свободных слотов с учетом боксов, смен мойщиков, активных записей и
  блокировок ресурсов.
- Запись клиента на мойку со статусами `pending`, `confirmed`, `in_progress`,
  `completed`, `cancelled`, `no_show`.
- Назначение мойщиков на запись и блокировки ресурсов: ремонт бокса,
  отсутствие мойщика, технический перерыв.
- API руководителя для расписания дня, ручных назначений, смен и блокировок.

### Стек

- Python 3.10-3.13 рекомендуется для Django 5.2 LTS
- Django 5.2 LTS
- Django REST Framework 3.17
- djangorestframework-jsonapi 8.1
- django-filter 25
- psycopg2-binary для PostgreSQL-деплоев
- SQLite для разработки; PostgreSQL поддержан для production через `DATABASE_URL`

### Структура проекта

```text
car-wash/
├── docker/                # Docker images и runtime entrypoints
├── docker-compose.yml     # запуск всей системы одной командой
├── .github/
│   └── workflows/
│       └── ci-cd.yml      # GitHub Actions CI/CD workflow
├── .coveragerc            # настройки coverage для CI и локальных проверок
├── .env.example           # шаблон переменных окружения
├── .gitignore             # локальные Python, coverage и editor-артефакты
├── back/                  # Django-проект
│   ├── back/              # settings, urls, wsgi
│   ├── car_wash/          # боксы, типы мойки, цены, бронирования
│   │   └── services/      # pricing, availability, booking
│   ├── cars/              # марки, модели, типы автомобилей
│   ├── customer/          # клиенты и их автомобили
│   ├── personal/          # мойщики, станции, смены
│   ├── main/              # legacy Schedule, постепенно заменяется Booking
│   ├── manage.py
│   └── db.sqlite3            # локальный runtime-файл, игнорируется git
├── docs/
│   └── full-project-plan.md
├── front/                 # frontend на Vite + React + TypeScript
│   ├── src/
│   │   ├── api/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── layouts/
│   │   └── styles/
│   └── package.json
└── requirements.txt
```

### Frontend

Frontend - это SPA на Vite + React + TypeScript в каталоге `front/`. Это
рабочий интерфейс, а не лендинг: клиент записывается на мойку и управляет
автомобилями, а менеджер ведет расписание дня и ресурсы станции.

- Роутинг описан в `front/src/app/router.tsx`; клиентские и менеджерские
  разделы защищены по ролям.
- Доступ к API находится в `front/src/api/`; `types-generated.ts` генерируется
  из `openapi.yaml`, а `types.ts` содержит ручные доменные типы интерфейса.
- Общие layout и controls находятся в `front/src/components/` и
  `front/src/layouts/`.
- Экраны фич находятся в `front/src/features/`: auth, booking, автомобили
  клиента, manager bookings, schedule, shifts, resource blocks и reports.
- Локализация находится в `front/src/i18n/`: русский, английский и турецкий
  переводы плюс общие helpers для форматирования дат, времени и денег.

Клиентские маршруты:

| Route | Назначение |
| ----- | ---------- |
| `/login` | Вход по session auth |
| `/register` | Саморегистрация клиента |
| `/book` | Создание записи по свободным слотам |
| `/my/bookings` | Список записей клиента |
| `/my/bookings/:bookingId` | Детали записи клиента |
| `/my/cars` | Управление автомобилями клиента |

Маршруты менеджера:

| Route | Назначение |
| ----- | ---------- |
| `/manager/schedule` | Дневное расписание станции с назначениями |
| `/manager/bookings` | Список заказов и фильтры менеджера |
| `/manager/bookings/:bookingId` | Детали заказа, статус, аудит, назначение |
| `/manager/shifts` | Управление сменами мойщиков |
| `/manager/resource-blocks` | Блокировки станции, боксов и мойщиков |
| `/manager/reports` | Агрегированные отчеты за день или период |

SPA использует cookie-based Django session auth. Для unsafe-запросов frontend
получает/использует CSRF cookie и отправляет `X-CSRFToken`. В development Vite
проксирует same-origin `/api` и `/health` в Django; в production приложение
может работать с того же origin или через отдельный backend origin в
`VITE_API_BASE_URL`.

### Установка и запуск

Для проекта на Django 5.2 LTS рекомендуется Python 3.10-3.13.

Быстрый запуск всей системы через Docker:

```bash
docker compose up --build
```

После запуска доступны:

- Frontend: http://127.0.0.1:5173/
- Backend API: http://127.0.0.1:8000/api/
- Админка: http://127.0.0.1:8000/admin/
- Healthcheck: http://127.0.0.1:8000/health/

Backend-контейнер автоматически применяет миграции и по умолчанию создает
демо-данные. Демо-пользователи: `demo_customer` / `password`,
`demo_manager` / `password`, `demo_admin` / `password`. SQLite-база хранится в
Docker volume `backend-data`. Чтобы сбросить demo database:

```bash
docker compose down -v
docker compose up --build
```

Чтобы запустить без demo data, установите `DJANGO_SEED_DEMO_DATA=false` для
backend service в `docker-compose.yml` перед пересозданием volume.

Ручная локальная установка:

```bash
# 1. Клонировать репозиторий и перейти в каталог
git clone <repo-url> car-wash
cd car-wash

# 2. Создать и активировать виртуальное окружение
python3 -m venv .venv
source .venv/bin/activate

# 3. Установить зависимости
pip install -r requirements.txt

# 4. Применить миграции
cd back
export DJANGO_DEBUG=true
export DJANGO_SECRET_KEY="local-dev-secret-key-change-me"
python manage.py migrate

# 5. Создать суперпользователя для админки
python manage.py createsuperuser

# 6. Запустить dev-сервер
python manage.py runserver
```

После запуска доступны:

- Админка: http://127.0.0.1:8000/admin/
- API: http://127.0.0.1:8000/api/
- Healthcheck: http://127.0.0.1:8000/health/

Опциональные демо-данные:

```bash
python manage.py seed_demo_data
```

Frontend-разработка:

```bash
cd front
npm install
npm run dev
```

Vite dev server запускается на http://127.0.0.1:5173/ и проксирует `/api` и
`/health` в Django server на http://127.0.0.1:8000/.

Frontend-проверки:

```bash
cd front
npm run lint
npm test
npm run build
```

E2E smoke-тесты запускаются против Docker stack с демо-данными:

```bash
docker compose up --build -d
cd front
npm run test:e2e
```

Демо-пользователи:

- `demo_customer` / `password`
- `demo_manager` / `password`
- `demo_admin` / `password`

Локальная аутентификация:

- Для session auth используйте `/admin/` или login в browsable API DRF.
- `demo_customer` может работать с клиентскими endpoints бронирования.
- `demo_manager` и `demo_admin` могут работать с manager endpoints.
- SPA-клиенты могут использовать JSON session auth endpoints под `/api/auth/`.

### Runtime Configuration

Runtime-настройки читаются из переменных окружения. В `.env.example` есть
шаблон для копирования. Проект сам не загружает `.env`; задавайте переменные в
shell, process manager, container или на hosting platform.

| Переменная | Назначение | Значение по умолчанию |
| ---------- | ---------- | --------------------- |
| `DJANGO_SECRET_KEY` | Django secret key | required outside debug/test |
| `DJANGO_DEBUG` | Включает debug mode | `false` outside tests |
| `DJANGO_ALLOWED_HOSTS` | Hosts через запятую | local hosts в debug |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | CSRF trusted origins через запятую | empty |
| `DJANGO_CORS_ALLOWED_ORIGINS` | Origins, которым разрешены API-запросы с отдельного frontend host | empty |
| `DJANGO_CORS_ALLOW_CREDENTIALS` | Разрешает session cookies в CORS-запросах | `true`, если заданы CORS origins |
| `VITE_API_BASE_URL` | Build-time API origin для frontend. Оставьте пустым для same-origin `/api/` | empty |
| `DATABASE_URL` | URL базы. Поддерживает SQLite и PostgreSQL | `back/db.sqlite3` |
| `DJANGO_SECURE_SSL_REDIRECT` | Redirect HTTP to HTTPS | `not DEBUG` |
| `DJANGO_SESSION_COOKIE_SECURE` | Secure session cookie flag | `not DEBUG` |
| `DJANGO_CSRF_COOKIE_SECURE` | Secure CSRF cookie flag | `not DEBUG` |
| `DJANGO_SECURE_HSTS_SECONDS` | HSTS max age | `31536000` when `not DEBUG`, else `0` |
| `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS` | Include subdomains in HSTS | `not DEBUG` |
| `DJANGO_SECURE_HSTS_PRELOAD` | Enable HSTS preload flag | `false` |
| `DJANGO_SECURE_PROXY_SSL_HEADER` | Trust `X-Forwarded-Proto: https` | `false` |
| `DRF_AUTH_LOGIN_THROTTLE_RATE` | Лимит попыток входа | `20/min` |
| `DRF_AUTH_REGISTER_THROTTLE_RATE` | Лимит регистраций | `5/hour` |

Пример PostgreSQL:

```bash
export DJANGO_DEBUG=false
export DJANGO_SECRET_KEY="<strong-secret>"
export DJANGO_ALLOWED_HOSTS="carwash.example.com"
export DATABASE_URL="postgres://carwash:password@localhost:5432/carwash"
```

Production-режимы frontend:

- Same-origin: оставьте `VITE_API_BASE_URL` пустым и проксируйте `/api/` и
  `/health/` в Django с того же публичного origin.
- Отдельный frontend host: задайте `VITE_API_BASE_URL` как backend origin, а
  frontend origin добавьте в `DJANGO_CORS_ALLOWED_ORIGINS` и
  `DJANGO_CSRF_TRUSTED_ORIGINS`.

### API

Корневой префикс API - `/api/`.

| Префикс            | Назначение                                  |
| ------------------ | ------------------------------------------- |
| `/api/cars/`       | Марки, модели и типы автомобилей            |
| `/api/customers/`  | Клиенты и их автомобили                     |
| `/api/personal/`   | Мойщики, станции, смены                     |
| `/api/auth/`       | Session auth, текущий пользователь, CSRF    |
| `/api/car-wash/`   | Типы мойки, цены, боксы, бронирования       |
| `/api/manager/`    | Расписание, назначения, смены и блокировки  |

Аутентификация:

```text
GET    /api/auth/csrf/
POST   /api/auth/login/
POST   /api/auth/logout/
GET    /api/auth/me/
```

Справочники и профиль клиента:

```text
GET    /api/cars/brands/
GET    /api/cars/models/
GET    /api/cars/types/
GET    /api/personal/stations/
GET    /api/car-wash/wash-types/
GET    /api/customers/me/
GET    /api/customers/cars/
POST   /api/customers/cars/
PATCH  /api/customers/cars/{id}/
DELETE /api/customers/cars/{id}/
```

Расчет свободных слотов:

```text
GET /api/car-wash/availability/?station=1&car_type=1&wash_type=1&date=2026-05-06
```

Бронирования:

```text
GET    /api/car-wash/bookings/
POST   /api/car-wash/bookings/
PATCH  /api/car-wash/bookings/{id}/cancel/
PATCH  /api/car-wash/bookings/{id}/reschedule/
PATCH  /api/car-wash/bookings/{id}/status/
```

Кабинет руководителя:

```text
GET    /api/manager/schedule/?station=1&date=2026-05-06
GET    /api/manager/bookings/
PATCH  /api/manager/bookings/{id}/assign/
PATCH  /api/manager/bookings/{id}/status/
GET    /api/manager/shifts/
POST   /api/manager/shifts/
GET    /api/manager/resource-blocks/
POST   /api/manager/resource-blocks/
```

Текущие endpoints принимают и отдают обычный JSON. JSON:API-компоненты DRF
остаются подключенными для дальнейшей совместимости.

Успешные ответы API используют общий envelope:

```json
{
  "data": {}
}
```

Ошибки возвращаются в стабильном формате, чтобы frontend мог одинаково
показывать ошибки форм:

```json
{
  "detail": "Человекочитаемое описание ошибки.",
  "field_errors": {
    "field_name": ["Сообщение для конкретного поля."]
  },
  "code": "machine_readable_code"
}
```

### Сервисный слой

Бизнес-логика вынесена в `back/car_wash/services/`:

- `pricing.py` - поиск длительности и цены, расчет аванса и остатка через
  `PricingQuote`.
- `availability.py` - расчет доступных слотов с учетом боксов, смен, активных
  записей и `ResourceBlock`.
- `booking.py` - создание, перенос, отмена записи, смена статусов и назначение
  ресурсов внутри транзакций.

Активными для занятости считаются статусы `pending`, `confirmed`,
`in_progress`. Статусы `cancelled`, `completed`, `no_show` слот не блокируют.

### Права доступа

Backend использует пользователей и группы Django:

- `customer` - может создавать записи и видеть только записи, связанные с его
  профилем `Customer.user`.
- `manager` - может использовать manager endpoints, назначать ресурсы,
  управлять сменами и менять статусы записей.
- `admin` - имеет доступ уровня manager; Django staff и superuser также
  считаются администраторами.

Расчет доступности остается публичным. Booking endpoints требуют
аутентифицированного клиента, менеджера или администратора. Manager endpoints
требуют менеджера или администратора.
Дополнительно managers ограничены `ManagerStationAccess`: расписание,
назначения, смены, блокировки ресурсов и manager booking endpoints работают
только со станциями, явно назначенными пользователю. Admin users сохраняют
полный доступ ко всем станциям.

### Тесты

```bash
cd back
python manage.py test
```

Проверка покрытия:

```bash
pip install "coverage>=7,<8"
cd back
coverage run --rcfile=../.coveragerc manage.py test
coverage report --rcfile=../.coveragerc
```

### CI/CD

GitHub Actions workflow: `.github/workflows/ci-cd.yml`.

- Запускается на push и pull request в `master` и `main`, а также вручную через
  `workflow_dispatch`.
- Использует Python 3.11, устанавливает зависимости проекта, проверяет
  актуальность миграций, применяет миграции, запускает Django deployment checks
  и Django-тесты с coverage.
- Использует Node.js для `front/`, устанавливает npm-зависимости, запускает
  lint, проверку форматирования, Vitest и production build, затем загружает
  `front/dist/` как artifact `frontend-dist`.
- `.github/workflows/e2e.yml` можно запускать вручную для Playwright smoke
  tests против полного Docker stack.
- Покрытие должно быть не ниже 80%.
- Deploy job запускается только после успешного backend и frontend CI на push в
  `master` или `main`. Пока SSH secrets не настроены, деплой безопасно
  пропускается.

Secrets для деплоя:

- `DEPLOY_HOST` - hostname или IP сервера.
- `DEPLOY_PORT` - опциональный SSH-порт, по умолчанию `22`.
- `DEPLOY_USER` - SSH-пользователь.
- `DEPLOY_KEY` - приватный SSH-ключ.
- `DEPLOY_PATH` - путь к проекту на сервере для команды по умолчанию.
- `DEPLOY_FRONTEND_PATH` - опциональная директория, куда распаковать artifact
  `frontend-dist`, например static root Nginx.
- `DEPLOY_COMMAND` - опциональная полная команда деплоя на сервере. Если она
  не задана, workflow подтянет проект, применит миграции и либо загрузит
  artifact `frontend-dist` в `DEPLOY_FRONTEND_PATH`, либо соберет `front/dist/`
  на сервере, если путь для frontend artifact не настроен.

### Статус разработки

Backend этапы 1-16 и frontend MVP этапы 1-8 выполнены: подготовка
проекта, модель данных, расчет цены, доступность, бронирование, кабинет
руководителя, ролевой доступ, тесты, демо-данные, CI/CD, production-ready
runtime configuration, cleanup моделей, SPA auth API, frontend dictionary
API, единый API contract, несколько автомобилей у клиента и доступ
менеджеров к станциям; frontend доведен до production build/deploy.
Подробности, критерии готовности и дальнейший roadmap (B17-B24, F9-F14) —
в [docs/full-project-plan.md](docs/full-project-plan.md).
