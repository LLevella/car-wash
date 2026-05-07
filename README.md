# Car Wash

[English](#english) | [Русский](#русский)

## English

Car Wash is a Django + Django REST Framework backend for customer car wash
booking and manager-side workday planning: bay loading, washer shifts, order
assignments, rescheduling, cancellations, and resource blocks.

The full target architecture and development plan are documented in
[docs/implementation-plan.md](docs/implementation-plan.md). The frontend plan
is documented in
[docs/frontend-implementation-plan.md](docs/frontend-implementation-plan.md).

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

- Python 3.9-3.11 recommended for Django 4.1.x
- Django 4.1
- Django REST Framework 3.14
- djangorestframework-jsonapi 6.0
- django-filter 22
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
│   └── db.sqlite3
├── docs/
│   ├── frontend-implementation-plan.md
│   └── implementation-plan.md
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

### Setup

Python 3.9-3.11 is recommended for this Django 4.1.x project.

Fast full-system startup with Docker:

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
| `DJANGO_SECRET_KEY` | Django secret key | development-only fallback |
| `DJANGO_DEBUG` | Enables debug mode | `true` |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated allowed hosts | local hosts in debug |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Comma-separated CSRF trusted origins | empty |
| `DATABASE_URL` | Database URL. Supports SQLite and PostgreSQL | `back/db.sqlite3` |
| `DJANGO_SECURE_SSL_REDIRECT` | Redirect HTTP to HTTPS | `false` |
| `DJANGO_SESSION_COOKIE_SECURE` | Secure session cookie flag | `not DEBUG` |
| `DJANGO_CSRF_COOKIE_SECURE` | Secure CSRF cookie flag | `not DEBUG` |
| `DJANGO_SECURE_HSTS_SECONDS` | HSTS max age | `0` |
| `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS` | Include subdomains in HSTS | `false` |
| `DJANGO_SECURE_HSTS_PRELOAD` | Enable HSTS preload flag | `false` |
| `DJANGO_SECURE_PROXY_SSL_HEADER` | Trust `X-Forwarded-Proto: https` | `false` |

PostgreSQL example:

```bash
export DJANGO_DEBUG=false
export DJANGO_SECRET_KEY="<strong-secret>"
export DJANGO_ALLOWED_HOSTS="carwash.example.com"
export DATABASE_URL="postgres://carwash:password@localhost:5432/carwash"
```

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
  check, Vitest, and production build.
- Coverage must stay at or above 80%.
- The deploy job runs only after successful backend and frontend CI on pushes to
  `master` or `main`. It is skipped until SSH deployment secrets are configured.

Deployment secrets:

- `DEPLOY_HOST` - server hostname or IP.
- `DEPLOY_PORT` - optional SSH port, defaults to `22`.
- `DEPLOY_USER` - SSH user.
- `DEPLOY_KEY` - private SSH key.
- `DEPLOY_PATH` - project path on the server for the default command.
- `DEPLOY_COMMAND` - optional full remote deploy command. When omitted, the
  workflow runs `cd $DEPLOY_PATH && git pull --ff-only && cd back && python manage.py migrate --noinput`.

### Development Status

Stages 1-13 are complete: project setup, data model, pricing, availability,
booking, the basic manager workspace, role-based access control, tests,
demo data, CI/CD, production-ready runtime configuration, model cleanup, and
SPA auth API, and frontend dictionary API. See
[docs/implementation-plan.md](docs/implementation-plan.md) for details and
acceptance criteria.

## Русский

Car Wash - backend на Django + Django REST Framework для записи клиентов на
автомойку и планирования рабочего дня руководителем: загрузка боксов, смены
мойщиков, назначения на заказы, переносы, отмены и блокировки ресурсов.

Полная целевая архитектура и план разработки описаны в
[docs/implementation-plan.md](docs/implementation-plan.md). План frontend
описан в
[docs/frontend-implementation-plan.md](docs/frontend-implementation-plan.md).

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

- Python 3.9-3.11 рекомендуется для Django 4.1.x
- Django 4.1
- Django REST Framework 3.14
- djangorestframework-jsonapi 6.0
- django-filter 22
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
│   └── db.sqlite3
├── docs/
│   ├── frontend-implementation-plan.md
│   └── implementation-plan.md
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

### Установка и запуск

Для проекта на Django 4.1.x рекомендуется Python 3.9-3.11.

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
| `DJANGO_SECRET_KEY` | Django secret key | development-only fallback |
| `DJANGO_DEBUG` | Включает debug mode | `true` |
| `DJANGO_ALLOWED_HOSTS` | Hosts через запятую | local hosts в debug |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | CSRF trusted origins через запятую | empty |
| `DATABASE_URL` | URL базы. Поддерживает SQLite и PostgreSQL | `back/db.sqlite3` |
| `DJANGO_SECURE_SSL_REDIRECT` | Redirect HTTP to HTTPS | `false` |
| `DJANGO_SESSION_COOKIE_SECURE` | Secure session cookie flag | `not DEBUG` |
| `DJANGO_CSRF_COOKIE_SECURE` | Secure CSRF cookie flag | `not DEBUG` |
| `DJANGO_SECURE_HSTS_SECONDS` | HSTS max age | `0` |
| `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS` | Include subdomains in HSTS | `false` |
| `DJANGO_SECURE_HSTS_PRELOAD` | Enable HSTS preload flag | `false` |
| `DJANGO_SECURE_PROXY_SSL_HEADER` | Trust `X-Forwarded-Proto: https` | `false` |

Пример PostgreSQL:

```bash
export DJANGO_DEBUG=false
export DJANGO_SECRET_KEY="<strong-secret>"
export DJANGO_ALLOWED_HOSTS="carwash.example.com"
export DATABASE_URL="postgres://carwash:password@localhost:5432/carwash"
```

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
  lint, проверку форматирования, Vitest и production build.
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
- `DEPLOY_COMMAND` - опциональная полная команда деплоя на сервере. Если она
  не задана, workflow выполнит `cd $DEPLOY_PATH && git pull --ff-only && cd back && python manage.py migrate --noinput`.

### Статус разработки

Этапы 1-13 выполнены: подготовка проекта, модель данных, расчет цены,
доступность, бронирование, базовый кабинет руководителя, ролевой доступ,
тесты, демо-данные, CI/CD, production-ready runtime configuration, cleanup
моделей, SPA auth API и frontend dictionary API. Подробности и критерии
готовности - в
[docs/implementation-plan.md](docs/implementation-plan.md).
