# Car Wash

Backend на Django + Django REST Framework для записи клиентов на автомойку и
планирования рабочего дня руководителем: загрузка боксов, смены мойщиков,
назначения на заказы, переносы и отмены.

Полная целевая архитектура и план разработки описаны в
[docs/implementation-plan.md](docs/implementation-plan.md).

## Возможности

- Справочники станций, боксов, типов автомобилей и типов мойки.
- Расчёт стоимости, длительности, аванса и остатка по тарифам станции.
- Расчёт свободных слотов с учётом боксов, смен мойщиков, активных записей и
  блокировок ресурсов.
- Запись клиента на мойку со статусами `pending`, `confirmed`, `in_progress`,
  `completed`, `cancelled`, `no_show`.
- Назначение мойщиков на запись и блокировки ресурсов (ремонт бокса,
  отсутствие мойщика, технический перерыв).
- REST API в формате JSON:API.

## Стек

- Python 3
- Django 4.1
- Django REST Framework 3.14
- djangorestframework-jsonapi 6.0
- django-filter 22
- SQLite (для разработки; в проде планируется PostgreSQL)

## Структура проекта

```text
car-wash/
├── back/                  # Django-проект
│   ├── back/              # settings, urls, wsgi
│   ├── car_wash/          # боксы, типы мойки, цены, бронирования
│   │   └── services/      # pricing, availability, booking
│   ├── cars/              # марки, модели, типы автомобилей
│   ├── customer/          # клиенты и их автомобили
│   ├── personal/          # мойщики, станции, смены
│   ├── main/              # legacy Schedule (постепенно вытесняется Booking)
│   ├── manage.py
│   └── db.sqlite3
├── docs/
│   └── implementation-plan.md
├── requirements.txt
└── car-wash-env/          # локальное виртуальное окружение (не коммитится)
```

## Установка и запуск

Требуется Python 3.10+.

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

## API

Корневой префикс — `/api/`. Маршруты разведены по приложениям:

| Префикс              | Назначение                                  |
| -------------------- | ------------------------------------------- |
| `/api/cars/`         | Марки, модели и типы автомобилей            |
| `/api/customers/`    | Клиенты и их автомобили                     |
| `/api/personal/`     | Мойщики, станции, смены                     |
| `/api/car-wash/`     | Типы мойки, цены, боксы, бронирования       |

Расчёт свободных слотов:

```
GET /api/car-wash/availability/?station=1&car_type=1&wash_type=1&date=2026-05-06
```

Запросы и ответы — в формате [JSON:API](https://jsonapi.org/)
(`Content-Type: application/vnd.api+json`).

## Сервисный слой

Бизнес-логика вынесена в `back/car_wash/services/`:

- `pricing.py` — поиск длительности и цены, расчёт аванса и остатка
  (`PricingQuote`).
- `availability.py` — построение доступных слотов с учётом боксов, смен,
  активных записей и `ResourceBlock`.
- `booking.py` — создание, перенос, отмена записи и смена статусов
  (в транзакции).

Активными для занятости считаются статусы `pending`, `confirmed`,
`in_progress`. Статусы `cancelled`, `completed`, `no_show` слот не блокируют.

## Тесты

```bash
cd back
python manage.py test
```

## Статус разработки

Этапы 1–4 (подготовка проекта, модель данных, расчёт цены, расчёт доступности)
выполнены. В работе — сервис бронирования, кабинет руководителя, права доступа
и демо-данные. Подробности и критерии готовности — в
[docs/implementation-plan.md](docs/implementation-plan.md).
