# Car Wash

[English](#english) | [Русский](#русский)

## English

Car Wash is a Django + Django REST Framework backend for customer car wash
booking and manager-side workday planning: bay loading, washer shifts, order
assignments, rescheduling, cancellations, and resource blocks.

The full target architecture and development plan are documented in
[docs/implementation-plan.md](docs/implementation-plan.md).

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

- Python 3
- Django 4.1
- Django REST Framework 3.14
- djangorestframework-jsonapi 6.0
- django-filter 22
- SQLite for development; PostgreSQL is planned for production

### Project Structure

```text
car-wash/
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
│   └── implementation-plan.md
├── requirements.txt
└── car-wash-env/          # local virtual environment, not committed
```

### Setup

Python 3.10+ is recommended.

```bash
# 1. Clone the repository and enter it
git clone <repo-url> car-wash
cd car-wash

# 2. Create and activate a virtual environment
python3 -m venv car-wash-env
source car-wash-env/bin/activate

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

Optional demo data:

```bash
python manage.py seed_demo_data
```

Demo users:

- `demo_customer` / `password`
- `demo_manager` / `password`
- `demo_admin` / `password`

### API

The root API prefix is `/api/`.

| Prefix             | Purpose                                      |
| ------------------ | -------------------------------------------- |
| `/api/cars/`       | Car brands, models, and types                |
| `/api/customers/`  | Customers and their cars                     |
| `/api/personal/`   | Washers, stations, shifts                    |
| `/api/car-wash/`   | Wash types, prices, bays, bookings           |
| `/api/manager/`    | Schedule, assignments, shifts, resource blocks |

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

MVP endpoints accept and return regular JSON. DRF JSON:API components remain
enabled for future compatibility.

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

### Development Status

Stages 1-8 are complete: project setup, data model, pricing, availability,
booking, the basic manager workspace, role-based access control, tests, and
demo data. See
[docs/implementation-plan.md](docs/implementation-plan.md) for details and
acceptance criteria.

## Русский

Car Wash - backend на Django + Django REST Framework для записи клиентов на
автомойку и планирования рабочего дня руководителем: загрузка боксов, смены
мойщиков, назначения на заказы, переносы, отмены и блокировки ресурсов.

Полная целевая архитектура и план разработки описаны в
[docs/implementation-plan.md](docs/implementation-plan.md).

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

- Python 3
- Django 4.1
- Django REST Framework 3.14
- djangorestframework-jsonapi 6.0
- django-filter 22
- SQLite для разработки; PostgreSQL планируется для production

### Структура проекта

```text
car-wash/
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
│   └── implementation-plan.md
├── requirements.txt
└── car-wash-env/          # локальное виртуальное окружение, не коммитится
```

### Установка и запуск

Рекомендуется Python 3.10+.

```bash
# 1. Клонировать репозиторий и перейти в каталог
git clone <repo-url> car-wash
cd car-wash

# 2. Создать и активировать виртуальное окружение
python3 -m venv car-wash-env
source car-wash-env/bin/activate

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

Опциональные демо-данные:

```bash
python manage.py seed_demo_data
```

Демо-пользователи:

- `demo_customer` / `password`
- `demo_manager` / `password`
- `demo_admin` / `password`

### API

Корневой префикс API - `/api/`.

| Префикс            | Назначение                                  |
| ------------------ | ------------------------------------------- |
| `/api/cars/`       | Марки, модели и типы автомобилей            |
| `/api/customers/`  | Клиенты и их автомобили                     |
| `/api/personal/`   | Мойщики, станции, смены                     |
| `/api/car-wash/`   | Типы мойки, цены, боксы, бронирования       |
| `/api/manager/`    | Расписание, назначения, смены и блокировки  |

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

MVP endpoints принимают и отдают обычный JSON. JSON:API-компоненты DRF остаются
подключенными для дальнейшей совместимости.

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

### Статус разработки

Этапы 1-8 выполнены: подготовка проекта, модель данных, расчет цены,
доступность, бронирование, базовый кабинет руководителя, ролевой доступ,
тесты и демо-данные. Подробности и критерии готовности - в
[docs/implementation-plan.md](docs/implementation-plan.md).
