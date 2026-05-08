# Полный план имплементации проекта Car Wash

Единый документ, фиксирующий полный план разработки сервиса Car Wash:
backend (Django + DRF), frontend (Vite + React + TypeScript), инфраструктуру,
тестирование, CI/CD и production-эксплуатацию. В документе сведены вместе
исторический backend-план этапов 1-13, backend-roadmap этапов 14-24 и
frontend-план этапов 1-8 с сохранением всех деталей: задач, принятых решений,
реализованного функционала и критериев готовности.

Текущий статус (на 2026-05-08):

- Backend этапы 1-20 выполнены.
- Frontend MVP этапы 1-12 выполнены (включая production build/deploy,
  управление автомобилями клиента, обновлённый manager schedule UI,
  автогенерацию TypeScript-типов из OpenAPI и просмотр audit-истории).
- В работе/планируется: backend этапы 21-24, расширение frontend (F13-F14),
  доработки инфраструктуры.

## 1. Контекст и цель проекта

Сервис записи клиентов на автомойку и планирования рабочего дня для
руководителя. Две основные пользовательские поверхности:

1. **Клиент** выбирает станцию, автомобиль, тип мойки, дату и свободный слот,
   видит расчет стоимости/аванса/остатка и создает запись.
2. **Руководитель** планирует день: видит расписание станции по боксам и
   мойщикам, назначает ресурсы, меняет статусы заказов, создает смены и
   блокировки.

### Цель MVP

MVP должен позволять:

1. Клиенту выбрать станцию, автомобиль, тип мойки, дату и свободное время.
2. Системе автоматически рассчитать длительность, стоимость, аванс и остаток.
3. Системе зарезервировать свободный бокс и доступных мойщиков.
4. Руководителю видеть расписание по станции, боксам и мойщикам.
5. Руководителю назначать мойщиков, переносить записи, отменять записи и
   менять статус выполнения.

Администрирование справочников в MVP остается в Django admin. Frontend
фокусируется на ежедневных рабочих сценариях, а не дублирует всю админку.

## 2. Целевая архитектура

Monorepo из двух самостоятельных приложений плюс инфраструктура:

```text
car-wash/
├── back/                       # Django + DRF backend
│   ├── back/
│   │   ├── settings.py
│   │   ├── urls.py
│   │   ├── api_urls.py         # модульный сборщик API-маршрутов
│   │   ├── auth_urls.py        # /api/auth/* маршруты
│   │   ├── auth_views.py       # SPA session auth views
│   │   ├── config.py           # env-helpers и database_config
│   │   └── wsgi.py
│   ├── car_wash/               # боксы, типы мойки, цены, бронирования
│   │   ├── models.py           # WashType/Cost/Duration/Box/Booking/...
│   │   ├── services/           # pricing.py, availability.py, booking.py
│   │   ├── permissions.py      # role-based DRF permissions
│   │   ├── views.py            # client API
│   │   ├── manager_views.py    # manager API
│   │   ├── urls.py
│   │   ├── manager_urls.py
│   │   └── management/         # seed_demo_data
│   ├── cars/                   # марки, модели, типы автомобилей
│   ├── customer/               # клиенты и их автомобили
│   ├── personal/               # мойщики, станции, смены, ManagerStationAccess
│   └── main/                   # legacy Schedule (постепенно выводится)
├── front/                      # Vite + React + TypeScript SPA
│   └── src/
│       ├── api/                # client.ts, auth.ts, bookings.ts,
│       │                       # dictionaries.ts, manager.ts, types.ts
│       ├── app/                # App.tsx, router.tsx, queryClient.ts
│       ├── components/         # Button, Field, Modal, StatusBadge, Toolbar
│       ├── features/           # auth, booking, manager-schedule,
│       │                       # manager-bookings, manager-resources
│       ├── layouts/            # AppShell
│       └── styles/             # CSS tokens, base styles
├── docker/                     # Dockerfile-ы и runtime entrypoints
├── docker-compose.yml          # полный локальный стэк
├── docs/                       # планы и документация
└── .github/workflows/          # CI/CD pipelines
```

### Архитектурные принципы (MVP)

- Бизнес-логика планирования вынесена в сервисный слой `back/car_wash/services/`,
  views остаются тонкими.
- Модели описывают факты домена: клиент, автомобиль, услуга, смена, бокс,
  запись, назначение, блокировка ресурса.
- API использует ту же сервисную логику, что и Django admin, и будущие
  фоновые задачи.
- Проверка пересечений выполняется перед созданием/переносом записи внутри
  `transaction.atomic()`.
- Справочники цен и длительностей отделены от кода — руководитель меняет
  тарифы без релиза.
- В MVP можно оставить SQLite, но архитектуру строить так, чтобы позже
  перейти на PostgreSQL.

### Принципы дальнейшей разработки

- SQLite остается поддержанным локальным и CI-вариантом без `DATABASE_URL`.
- PostgreSQL остается production-вариантом через `DATABASE_URL`.
- PostgreSQL-specific усиления можно добавлять только как дополнительный
  слой, с сервисной fallback-валидацией для SQLite.
- API сохраняет regular JSON contract: `data` для успешных ответов,
  `detail` и `field_errors` для ошибок.
- Все новые backend endpoints покрываются тестами.
- Изменения модели данных делаются миграциями с обратной совместимостью
  там, где frontend уже зависит от контракта.
- Django admin остается инструментом администрирования справочников до тех
  пор, пока frontend не заменит конкретный сценарий.

## 3. Технологический стек

### Backend

- Python 3.9-3.11 (рекомендуется 3.11 для CI).
- Django 4.1.x.
- Django REST Framework 3.14.
- djangorestframework-jsonapi 6.0 (подключен для совместимости).
- django-filter 22.
- psycopg2-binary для PostgreSQL.
- coverage 7.x для измерения покрытия.

### Frontend

- Vite + React + TypeScript.
- React Router для маршрутизации.
- TanStack Query для запросов, кеша и invalidation.
- React Hook Form + Zod для форм и валидации.
- CSS Modules / обычный CSS с design tokens на первом этапе; UI-kit можно
  добавить позже, если появится повторяемая библиотека компонентов.
- Vitest + React Testing Library для unit/component тестов.
- Playwright для e2e smoke-сценариев.

Причины выбора:

- быстрый старт без тяжелой инфраструктуры;
- хорошая типизация API-контрактов;
- удобный кеш для расписания и списков записей;
- простая интеграция в существующий GitHub Actions workflow.

### Инфраструктура

- Docker + docker-compose для одной команды локального запуска.
- GitHub Actions для CI и опционального CD.
- SQLite (dev) и PostgreSQL (prod) в зависимости от `DATABASE_URL`.

## 4. Модель данных

### 4.1 Существующие справочники

- `cars.CarType`, `cars.CarBrand`, `cars.CarModel`, `cars.CarDescription`.
- `personal.WashStation`, `personal.Washer`.
- `car_wash.WashType`, `car_wash.WashDuration`, `car_wash.WashCost`,
  `car_wash.DownPayment`.
- Историческое имя `WashCoast` переименовано в `WashCost` rename-миграцией
  без пересоздания данных.

### 4.2 Доменные сущности планирования

#### `WashBox`

Бокс автомойки.

Поля:

- `wash_station` — станция.
- `name` — название или номер бокса.
- `is_active` — участвует ли бокс в расписании.
- `description` — необязательное описание.

Ограничения: уникальность `wash_station + name`.

#### `WasherShift`

Рабочая смена мойщика.

Поля:

- `washer` — мойщик.
- `wash_station` — станция.
- `starts_at` — начало смены.
- `ends_at` — конец смены.
- `is_active` — смена учитывается в планировании.

Ограничения: `starts_at < ends_at`; индексы по станции, мойщику и времени.

#### `Booking`

Запись клиента на мойку.

Поля:

- `customer` — клиент.
- `car` — автомобиль клиента.
- `wash_station` — станция.
- `wash_box` — назначенный бокс.
- `wash_type` — тип мойки.
- `starts_at` — начало записи.
- `ends_at` — окончание записи.
- `status` — статус записи.
- `cost` — рассчитанная стоимость.
- `down_payment` — рассчитанный аванс.
- `residual` — остаток к оплате.
- `comment` — комментарий клиента или менеджера.
- `created_at`, `updated_at`.

Статусы:

- `draft` — черновик.
- `pending` — создана, ждет подтверждения или оплаты.
- `confirmed` — подтверждена.
- `in_progress` — мойка началась.
- `completed` — мойка завершена.
- `cancelled` — отменена.
- `no_show` — клиент не приехал.

Активны для занятости (блокируют слот): `pending`, `confirmed`, `in_progress`.
Не блокируют слот: `cancelled`, `completed`, `no_show`.

#### `BookingAssignment`

Назначение мойщика на запись.

Поля:

- `booking` — запись.
- `washer` — мойщик.
- `role` — роль в заказе. Enum `BookingAssignment.Role` со значениями
  `MAIN` (основной) и `ASSISTANT` (помощник).

Ограничения: уникальность `booking + washer`.

#### `ResourceBlock`

Блокировка ресурса на период.

Поля:

- `wash_station` — станция.
- `wash_box` — бокс, если блокируется бокс.
- `washer` — мойщик, если блокируется мойщик.
- `starts_at`, `ends_at` — период.
- `reason` — причина.

Использование: ремонт бокса, отсутствие мойщика, технический перерыв,
закрытие станции.

### 4.3 Клиент и автомобили

- `customer.Customer.user` — `OneToOneField` к `auth.User`.
- `customer.Customer.name`, `customer.Customer.phoneNumber` — личные
  данные клиента.
- `customer.Customer.car` — legacy `ForeignKey(on_delete=PROTECT)`, поле
  обязательное в схеме. Сохранён для обратной совместимости со старым кодом
  и historical миграциями. Не используется в новом booking flow.
- `customer.Car.customer` — основная связь владения (`ForeignKey`).
  Клиент может иметь несколько автомобилей.
- `customer.Car.is_active` — флаг для soft-delete; при `false` автомобиль
  не предлагается в booking flow и не считается удалённым физически.
- `customer.Car.number`, `customer.Car.carType` — номер и тип автомобиля.
- Телефон клиента нормализуется и проверяется на уникальность.

### 4.4 Доступ менеджеров к станциям

`personal.ManagerStationAccess` ограничивает manager-пользователя
конкретными станциями. Поля: `user`, `wash_station`, `is_active`,
`created_at`. Admin (включая Django staff/superuser) сохраняют полный
доступ ко всем станциям.

### 4.5 Legacy-модели

В `personal/models.py` сохранены модели, не участвующие в текущем booking
flow и оставленные как наследие предыдущей версии:

- `personal.City`, `personal.District` — географическая иерархия станций.
- `personal.DateType`, `personal.TimeSheet` — старые модели учёта рабочего
  времени до появления `WasherShift`.

В `cars/models.py`:

- `cars.CarDescription` — старая модель связи бренда и модели.
  **Известный техдолг:** поля имеют опечатку (кириллические буквы вместо
  латинских в идентификаторах) — см. раздел «Технический долг».

В `main/` живёт legacy `Schedule`, заменённый на `car_wash.Booking`.

Эти модели не удаляются ради сохранения данных и схемы, но не
расширяются. Удаление возможно после миграции данных и подтверждения, что
ни один внешний потребитель на них не опирается.

## 5. Сервисный слой

`back/car_wash/services/`:

### 5.1 `pricing.py`

Отвечает за расчет стоимости:

- найти цену по `car_type + wash_type + wash_station` через `WashCost`;
- найти длительность по `car_type + wash_type + wash_station` через
  `WashDuration`;
- найти процент аванса по станции через `DownPayment`;
- вернуть `cost`, `down_payment`, `residual`, `duration` в структуре
  `PricingQuote` с округлением до копеек.

Публичная функция стоимости — `get_wash_cost`.

### 5.2 `availability.py`

Отвечает за свободные слоты:

1. Получить станцию, тип авто, тип мойки и дату.
2. Рассчитать длительность услуги через `pricing.py`.
3. Построить интервалы возможного начала записи.
4. Найти активные боксы станции.
5. Найти мойщиков, у которых активная смена покрывает весь интервал.
6. Исключить пересечения с активными записями (`pending`, `confirmed`,
   `in_progress`).
7. Исключить пересечения с `ResourceBlock` (станция/бокс/мойщик).
8. Вернуть список слотов с доступными боксами и мойщиками.

### 5.3 `booking.py`

Отвечает за создание и изменение записей:

- создать запись;
- проверить доступность выбранного интервала;
- автоподобрать или принять явные бокс и мойщиков;
- перенести запись;
- отменить запись;
- сменить статус;
- ручное назначение ресурсов через `assign_booking_resources`.

Все операции создания и переноса выполняются в `transaction.atomic()` с
повторной проверкой доступности перед сохранением.

## 6. API

Корневой префикс — `/api/`. Контракт — обычный JSON с envelope `data`.
JSON:API-компоненты DRF подключены, но не используются текущими endpoints.

| Префикс            | Назначение                                    |
| ------------------ | --------------------------------------------- |
| `/api/auth/`       | Session auth, текущий пользователь, CSRF      |
| `/api/cars/`       | Марки, модели и типы автомобилей              |
| `/api/customers/`  | Клиенты и их автомобили                       |
| `/api/personal/`   | Мойщики, станции, смены                       |
| `/api/car-wash/`   | Типы мойки, цены, боксы, бронирования         |
| `/api/manager/`    | Расписание, назначения, смены и блокировки    |

### 6.1 Текущие endpoints

```text
GET    /api/auth/csrf/
POST   /api/auth/login/
POST   /api/auth/logout/
GET    /api/auth/me/

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

GET    /api/car-wash/availability/?station=1&car_type=1&wash_type=1&date=YYYY-MM-DD
GET    /api/car-wash/bookings/
POST   /api/car-wash/bookings/
PATCH  /api/car-wash/bookings/{id}/cancel/
PATCH  /api/car-wash/bookings/{id}/reschedule/
PATCH  /api/car-wash/bookings/{id}/status/

GET    /api/manager/schedule/?station=1&date=YYYY-MM-DD
GET    /api/manager/bookings/
GET    /api/manager/bookings/{id}/
PATCH  /api/manager/bookings/{id}/assign/
PATCH  /api/manager/bookings/{id}/status/
GET    /api/manager/bookings/{id}/audit/
GET    /api/manager/shifts/
POST   /api/manager/shifts/
GET    /api/manager/resource-blocks/
POST   /api/manager/resource-blocks/

GET    /api/schema/
GET    /api/schema/swagger/
GET    /api/schema/redoc/

GET    /health/
```

### 6.2 Запланированные endpoints

- Manager-endpoints дневных агрегатов (этап B24).

### 6.3 Формат ответов

Успешные ответы:

```json
{
  "data": {}
}
```

Ошибки:

```json
{
  "detail": "Человекочитаемое описание ошибки.",
  "field_errors": {
    "field_name": ["Сообщение для конкретного поля."]
  },
  "code": "machine_readable_code"
}
```

Используется единый exception handler, единый `code` и нормализованный
`field_errors` для всех endpoints (auth, dictionary, booking, manager).

## 7. Права доступа

Группы Django:

- `customer` — может создавать и видеть только свои записи; видит только
  свои автомобили.
- `manager` — управляет расписанием станций, к которым у него есть доступ
  через `ManagerStationAccess`.
- `admin` — полный доступ ко всем станциям и справочникам; Django staff и
  superuser также трактуются как admin.

Дополнительные правила:

- availability — публичный endpoint без авторизации.
- booking endpoints требуют customer/manager/admin.
- manager endpoints требуют manager/admin и фильтруются по доступным
  станциям.
- клиент не может вручную назначать бокс или мойщиков.
- клиент не может создать запись для другого клиента или на чужой/неактивный
  автомобиль.
- статус записи через клиентский `/api/car-wash/bookings/{id}/status/` доступен
  только manager/admin; для руководителя также доступен
  `/api/manager/bookings/{id}/status/`.

## 8. Frontend

### 8.1 Маршруты

Публичные:

- `/login` — вход в систему.

Клиент:

- `/book` — пошаговая запись. Подтверждение слота и цены — внутреннее
  состояние компонента, отдельный роут `/book/confirm` не требуется.
- `/my/bookings` — список моих записей.
- `/my/bookings/:bookingId` — детали, отмена, перенос.

Руководитель:

- `/manager/schedule` — дневное расписание станции.
- `/manager/bookings` — список записей с фильтрами.
- `/manager/bookings/:bookingId` — детали и действия.
- `/manager/shifts` — смены мойщиков.
- `/manager/resource-blocks` — блокировки ресурсов.

Конвенция параметров маршрутов: `:bookingId`, `:carId` (а не общий `:id`),
чтобы исключить путаницу при вложенных роутах.

Доступ:

- `customer` видит только клиентские маршруты и свои записи.
- `manager` видит manager routes.
- `admin` видит manager routes; Django admin остается отдельным инструментом.
- Неавторизованные перенаправляются на `/login`.

### 8.2 UX и визуальный подход

Это рабочий сервис, а не промо-сайт. Интерфейс должен быть спокойным,
утилитарным и плотным:

- первый экран после входа сразу ведет к записи или расписанию, без
  landing page;
- карточки использовать для отдельных записей и модальных окон, не
  складывать карточки в карточки;
- расписание руководителя делать таблицей/сеткой по времени, боксам и
  мойщикам;
- статусы показывать компактными badges;
- основные действия размещать в toolbar: дата, станция, фильтры, создание
  смены, блокировка, обновление;
- на мобильном клиентский booking flow должен быть пошаговым, manager view
  допускает горизонтальный скролл расписания.

### 8.3 Компоненты

Реализованные standalone-компоненты:

- `AppShell` — `src/layouts/AppShell.tsx`, общий layout с навигацией и
  user menu.
- `ProtectedRoute` — `src/features/auth/ProtectedRoute.tsx`, guard по
  auth/role.
- `HomeRedirect` — `src/features/auth/HomeRedirect.tsx`, перенаправление
  на нужный путь по роли пользователя.
- `Button`, `Field` (Input/Select/Label обёртка) — `src/components/`.
- `Modal` — `src/components/Modal.tsx`.
- `StatusBadge` — `src/components/StatusBadge.tsx`, визуализация статусов
  booking.
- `Toolbar` — выбор даты/станции на manager-страницах.
- `AssignmentModal` — `src/features/manager-bookings/AssignmentModal.tsx`,
  выбор бокса и мойщиков.

Хуки:

- `useAuth`, `useCurrentUser`, `useLogoutMutation` — auth-state и сессия.
- `queryClient.ts` — конфигурация TanStack Query.
- `resourceHelpers.ts` — вспомогательные функции для расписания
  и блокировок.

Не вынесены в standalone-компоненты (логика встроена в страницы):

- `ScheduleGrid` — сетка расписания живёт внутри `ManagerSchedulePage`.
- `ResourceBlockForm` — форма блокировки внутри `ManagerResourceBlocksPage`.
- `Money` и `DateTime` formatters — inline в компонентах.
- `DatePicker` — используется нативный HTML `<input type="date">`.
- `IconButton` — реализован через `Button` с icon prop.

Запланированный рефакторинг (без отдельного этапа): по мере роста UI
вынести `ScheduleGrid`, `ResourceBlockForm`, `Money`, `DateTime` в
`src/components/`, когда они начнут переиспользоваться более чем в одном
месте.

### 8.4 API types

На первом этапе типы описаны вручную в `src/api/types.ts`. Ключевые типы:

- `UserRole = "customer" | "manager" | "admin"`.
- `CurrentUser`.
- `Station`, `WashBox`, `Washer`, `WasherShift`.
- `CarType`, `CustomerCar`, `WashType`.
- `AvailabilitySlot`.
- `Booking`, `BookingStatus`, `BookingAssignment`.
- `ResourceBlock`.
- `ManagerScheduleDay`.

После появления OpenAPI (этап B19) — переход на автогенерацию типов
(этап F11).

## 9. Согласованность backend и frontend

Раздел фиксирует фактическое соответствие frontend и backend по контрактам
API, типам и пользовательским сценариям. Обновляется при каждом изменении
публичного API.

### 9.1 Используемые frontend → backend контракты

Frontend использует следующие endpoints (актуально на 2026-05-08):

| Endpoint                                       | Метод(ы)              | Где во frontend                        |
| ---------------------------------------------- | --------------------- | -------------------------------------- |
| `/api/auth/csrf/`                              | GET                   | `api/client.ts` (перед unsafe methods) |
| `/api/auth/login/`                             | POST                  | `features/auth/LoginPage`              |
| `/api/auth/logout/`                            | POST                  | `useLogoutMutation`                    |
| `/api/auth/me/`                                | GET                   | `useCurrentUser`, `useAuth`            |
| `/api/personal/stations/`                      | GET                   | booking flow, manager toolbars         |
| `/api/cars/types/`                             | GET                   | booking flow                           |
| `/api/customers/me/`                           | GET                   | customer profile в booking flow        |
| `/api/customers/cars/`                         | GET                   | booking flow (выбор автомобиля)        |
| `/api/car-wash/wash-types/`                    | GET                   | booking flow                           |
| `/api/car-wash/availability/`                  | GET                   | booking form, reschedule               |
| `/api/car-wash/bookings/`                      | GET, POST             | список моих записей, создание          |
| `/api/car-wash/bookings/{id}/cancel/`          | PATCH                 | детали записи                          |
| `/api/car-wash/bookings/{id}/reschedule/`      | PATCH                 | детали записи                          |
| `/api/car-wash/bookings/{id}/status/`          | PATCH                 | используется только manager            |
| `/api/manager/schedule/`                       | GET                   | `ManagerSchedulePage`                  |
| `/api/manager/bookings/`                       | GET                   | `ManagerBookingsPage`                  |
| `/api/manager/bookings/{id}/`                  | GET                   | `ManagerBookingDetailsPage`            |
| `/api/manager/bookings/{id}/assign/`           | PATCH                 | `AssignmentModal`                      |
| `/api/manager/bookings/{id}/status/`           | PATCH                 | manager actions                        |
| `/api/manager/shifts/`                         | GET, POST             | `ManagerShiftsPage`                    |
| `/api/manager/resource-blocks/`                | GET, POST             | `ManagerResourceBlocksPage`            |

### 9.2 Backend endpoints, доступные, но пока не используемые frontend

- `GET /api/cars/brands/`, `GET /api/cars/models/` — доступны, но текущий
  booking flow обходится без них (выбор бренда/модели не реализован в UI).
  Будут востребованы при F9.
- `POST|PATCH|DELETE /api/customers/cars/` — backend поддерживает CRUD,
  frontend ограничен GET. Используются при реализации F9 (управление
  автомобилями клиента).

Эти endpoints сохраняются: они нужны ближайшим F-этапам и не создают
поддержки legacy.

### 9.3 Совпадение типов frontend и backend

В `front/src/api/types.ts` присутствуют все ключевые типы из плана:
`UserRole`, `CurrentUser`, `Station`, `WashBox`, `Washer`, `WasherShift`,
`CarType`, `CustomerCar`, `WashType`, `AvailabilitySlot`, `Booking`,
`BookingStatus`, `BookingAssignment`, `ResourceBlock`,
`ManagerScheduleDay`. Они описаны вручную и поддерживаются параллельно с
backend-сериализаторами. Расхождения отлавливаются только тестами и
review.

Целевое решение — переход на автогенерацию типов из OpenAPI (этапы B19 и
F11). До этого момента обязательно: при изменении формы payload
backend-разработчик правит соответствующий тип в `types.ts` и обновляет
тесты, использующие новую форму.

### 9.4 Pipeline пользовательских сценариев

Customer booking flow:

1. `GET /api/auth/me/` — определить роль/customer_id.
2. `GET /api/personal/stations/`, `GET /api/cars/types/`,
   `GET /api/car-wash/wash-types/`, `GET /api/customers/cars/` —
   справочники и автомобили клиента.
3. `GET /api/car-wash/availability/?...` — слоты по выбранным параметрам.
4. `POST /api/car-wash/bookings/` — создание записи; backend сам
   рассчитывает стоимость/аванс и подбирает свободный бокс/мойщика, если
   они не указаны явно.
5. `GET /api/car-wash/bookings/` — отображение в `/my/bookings`.
6. `PATCH /api/car-wash/bookings/{id}/cancel|reschedule/` — действия с
   записью.

Manager day-planning flow:

1. `GET /api/auth/me/` — проверить роль `manager`/`admin` и доступные
   станции.
2. `GET /api/manager/schedule/?station=&date=` — расписание дня.
3. `GET /api/manager/bookings/?...` — фильтрация записей.
4. `PATCH /api/manager/bookings/{id}/assign/` — переназначение бокса/
   мойщиков; backend проверяет конфликты и возвращает `field_errors` при
   столкновении ресурсов.
5. `PATCH /api/manager/bookings/{id}/status/` — смена статуса.
6. `POST /api/manager/shifts/`, `POST /api/manager/resource-blocks/` —
   планирование рабочего дня.

### 9.5 Известные расхождения и пробелы

- Маршрут `/book/confirm` не выделен отдельным URL: подтверждение
  выбранного слота — внутреннее состояние компонента `/book`. План это
  отражает (см. раздел 8.1).
- Frontend пока не использует `GET /api/cars/brands/` и
  `GET /api/cars/models/`, потому что booking flow выбирает автомобиль
  из списка клиента, а не строит его с нуля. Это сознательное решение MVP.
- Frontend не имеет UI для CRUD автомобилей клиента (POST/PATCH/DELETE
  endpoints на backend есть). Этот gap закрывается этапом F9 — backend
  prerequisites уже выполнены.
- E2E-тесты покрывают customer login + создание записи, просмотр моих
  записей, manager login + расписание, создание ResourceBlock. Не
  покрыты: cancel/reschedule, редактирование смен, повторное назначение
  ресурсов через AssignmentModal. Расширение покрытия не выделено
  отдельным этапом, но включается в DoD при изменении соответствующих
  страниц.
- `BookingAssignment.role` (`MAIN`/`ASSISTANT`) backend сериализует, но
  frontend пока показывает все назначенные мойщики одним списком без
  разбивки по ролям. Если потребуется визуальное различение ролей, это
  будет точечная UI-доработка без изменения API.

### 9.6 Backend-prerequisites для запланированных F-этапов

| F-этап | Backend prerequisites                                | Готовность F  |
| ------ | ---------------------------------------------------- | ------------- |
| F9     | B15 (CRUD автомобилей клиента, выполнен)             | done          |
| F10    | B18 (компактный schedule payload + детали записи)    | планируется   |
| F11    | B19 (OpenAPI schema)                                 | планируется   |
| F12    | B20 (audit log endpoints)                            | планируется   |
| F13    | B22 (payment status в payload)                       | планируется   |
| F14    | B24 (manager reports endpoints)                      | планируется   |

F-этап не стартует, пока соответствующий B-этап не отмечен как `done`.

## 10. Этапы разработки

Этапы пронумерованы сквозной нумерацией: backend — `B`, frontend — `F`,
инфраструктурные — `I`. Сохранена нумерация, совместимая с предыдущими
планами.

### 10.1 Backend, выполнено

#### B1. Подготовка проекта

Статус: выполнен.

Задачи:

- Добавить папку `docs/` и зафиксировать план.
- Проверить зависимости DRF и `django-filter`.
- Настроить `urls.py` для будущих API-маршрутов.
- Согласовать, будет ли `main.Schedule` заменен на `car_wash.Booking` или
  временно сохранен.

Принятые решения:

- Зависимости DRF, JSON:API и `django-filter` зафиксированы в
  `requirements.txt`.
- В `INSTALLED_APPS` подключены `rest_framework`, `rest_framework_json_api`
  и `django_filters`.
- Корневой API-префикс: `/api/`.
- Доменные маршруты разводятся по приложениям: `/api/cars/`,
  `/api/customers/`, `/api/personal/`, `/api/car-wash/`.
- `main.Schedule` остается временным наследием. Целевая модель записи
  реализована как `car_wash.Booking` на этапе B2.

Результат:

- понятная структура проекта;
- зафиксированное направление разработки;
- подготовлен backend для добавления API.

#### B2. Модель данных для планирования

Статус: выполнен.

Задачи:

- Добавить `WashBox`, `WasherShift`, `Booking`, `BookingAssignment`,
  `ResourceBlock`.
- Добавить индексы и ограничения.
- Зарегистрировать новые модели в админке.

Реализовано:

- `car_wash.WashBox` — боксы автомойки с привязкой к станции, активностью
  и уникальностью названия внутри станции.
- `car_wash.WasherShift` — рабочие смены мойщиков с точным временем начала
  и окончания.
- `car_wash.Booking` — целевая модель записи клиента на мойку со статусами,
  временем, боксом, услугой и денежными полями.
- `car_wash.BookingAssignment` — назначения мойщиков на запись.
- `car_wash.ResourceBlock` — блокировки станции, боксов или мойщиков на
  период.
- Новые модели зарегистрированы в Django admin.
- Добавлены индексы для поиска по станции, боксу, мойщику, статусу и
  временным интервалам.
- Добавлены ограничения целостности для интервалов времени, уникальности
  боксов и уникальности назначений.

Критерии готовности:

- миграции применяются без ошибок;
- новые сущности доступны в Django admin;
- можно вручную создать станцию, бокс, смену и запись.

#### B3. Расчет цены и длительности

Статус: выполнен.

Задачи:

- Создать `car_wash/services/pricing.py`.
- Реализовать поиск `WashDuration`.
- Реализовать поиск `WashCost`.
- Реализовать расчет аванса и остатка.
- Добавить тесты на расчеты.

Реализовано:

- Добавлен сервис `car_wash.services.pricing`.
- Реализован поиск длительности через `WashDuration`.
- Реализован поиск стоимости через `WashCost`; публичная функция —
  `get_wash_cost`.
- Реализован расчет предоплаты и остатка с денежным округлением до копеек.
- Добавлена структура результата `PricingQuote` для дальнейшего использования
  в сервисе бронирования.
- Добавлены тесты расчета цены, длительности, предоплаты и ошибок неполной
  конфигурации справочников.

Критерии готовности:

- цена берется из справочника для станции, типа авто и типа мойки;
- длительность берется из справочника;
- аванс считается по настройке станции;
- запись получает корректные `cost`, `down_payment`, `residual` и `ends_at`.

#### B4. Расчет доступных слотов

Статус: выполнен.

Задачи:

- Создать `car_wash/services/availability.py`.
- Реализовать поиск свободных боксов.
- Реализовать поиск мойщиков на смене.
- Исключить занятые интервалы по `Booking`.
- Исключить блокировки по `ResourceBlock`.
- Добавить API `GET /api/car-wash/availability/`.
- Добавить тесты на пересечения.

Реализовано:

- Добавлен сервис `car_wash.services.availability`.
- Свободные слоты строятся на основе длительности из `pricing.py`.
- Слот считается доступным, если есть активный бокс станции и минимум один
  мойщик, чья активная смена покрывает весь интервал.
- Активные записи со статусами `pending`, `confirmed`, `in_progress`
  блокируют занятый бокс и назначенных мойщиков.
- Записи со статусом `cancelled` не блокируют слот.
- `ResourceBlock` может закрыть станцию целиком, конкретный бокс или
  конкретного мойщика.
- Добавлен endpoint `GET /api/car-wash/availability/`.
- Добавлены тесты на свободные слоты, занятый бокс, отмененную запись,
  блокировку станции, занятость мойщика и API-ответ.

Критерии готовности:

- занятый бокс не предлагается повторно;
- мойщик вне смены не предлагается;
- отмененные записи не блокируют слот;
- блокировки ресурсов скрывают слот.

#### B5. Создание и изменение записи

Статус: выполнен.

Задачи:

- Создать `car_wash/services/booking.py`.
- Реализовать создание записи через транзакцию.
- Реализовать автоподбор бокса и мойщика.
- Реализовать перенос, отмену и изменение статусов.
- Добавить клиентские endpoints для записей.

Реализовано:

- Добавлен сервис `car_wash.services.booking`.
- Создание записи выполняется в транзакции и повторно проверяет доступность
  ресурсов перед сохранением.
- При создании автоматически подбираются первый доступный бокс и первый
  доступный мойщик, если они не переданы явно.
- Денежные поля и окончание записи рассчитываются через `pricing.py`.
- Назначения мойщиков создаются через `BookingAssignment`.
- Реализованы отмена, перенос и изменение статуса записи.
- Endpoints:
  - `GET /api/car-wash/bookings/`
  - `POST /api/car-wash/bookings/`
  - `PATCH /api/car-wash/bookings/{id}/cancel/`
  - `PATCH /api/car-wash/bookings/{id}/reschedule/`
  - `PATCH /api/car-wash/bookings/{id}/status/`
- Endpoints принимают обычный JSON; стандартный DRF `JSONRenderer` и
  `JSONParser` подключены перед JSON:API-совместимыми компонентами.
- Добавлены тесты создания записи, запрета двойного бронирования, отмены,
  переноса и API-создания.

Критерии готовности:

- нельзя создать две активные записи на один бокс в одно время;
- нельзя назначить занятого мойщика;
- все денежные поля рассчитываются на backend;
- клиент не может изменить чужую запись.

#### B6. Кабинет руководителя API

Статус: выполнен.

Задачи:

- Добавить endpoints менеджера.
- Реализовать расписание по станции и дате.
- Реализовать фильтры по боксам, мойщикам и статусам.
- Реализовать ручное назначение мойщиков.
- Реализовать блокировки ресурсов.

Реализовано:

- Добавлены управленческие маршруты под префиксом `/api/manager/`.
- `GET /api/manager/schedule/?station=1&date=YYYY-MM-DD` возвращает боксы,
  смены, блокировки и записи станции за день.
- `GET /api/manager/bookings/` поддерживает фильтры по станции, дате,
  статусу, боксу и мойщику.
- `PATCH /api/manager/bookings/{id}/assign/` вручную переназначает бокс и
  мойщиков с проверкой доступности ресурсов.
- `PATCH /api/manager/bookings/{id}/status/` меняет статус записи.
- `GET|POST /api/manager/shifts/` выводит и создает смены мойщиков.
- `GET|POST /api/manager/resource-blocks/` выводит и создает блокировки
  станции, бокса или мойщика.
- Добавлена сервисная операция `assign_booking_resources`.
- Добавлены тесты manager schedule, фильтров, назначения, статуса, смен и
  блокировок.

Критерии готовности:

- расписание показывает записи по временной шкале;
- видно, какие боксы заняты;
- видно, какие мойщики назначены;
- можно изменить статус заказа;
- можно заблокировать ресурс на период.

#### B7. Права, валидация и устойчивость

Статус: выполнен.

Задачи:

- Настроить группы `customer`, `manager`, `admin`.
- Добавить permissions для клиентских и менеджерских API.
- Добавить валидацию временных интервалов.
- Добавить защиту от гонок через `transaction.atomic()`.
- Подготовить миграцию на PostgreSQL как следующий шаг.

Реализовано:

- Добавлено поле `customer.Customer.user` для привязки заказчика к
  `auth.User`.
- Миграция создает группы `customer`, `manager`, `admin`.
- Добавлен модуль `car_wash.permissions` с проверками ролей и доступа к
  клиенту/записи.
- Клиентские booking endpoints требуют роль `customer`, `manager` или `admin`.
- Клиент видит только записи своего `Customer.user`.
- Клиент не может создать запись для другого заказчика.
- Клиент не может вручную назначать бокс или мойщиков.
- Manager endpoints требуют роль `manager` или `admin`.
- Статус записи через клиентский endpoint доступен только manager/admin.
- Существующие операции создания, переноса и назначения остаются внутри
  `transaction.atomic()`.
- Добавлены тесты доступа для клиента, manager API и ограничения ручного
  назначения ресурсов.

Критерии готовности:

- клиент видит только свои записи;
- менеджер не получает лишний доступ к чужим станциям, если включено
  ограничение по станциям;
- невозможные интервалы отклоняются на уровне backend.

#### B8. Тесты и демо-данные

Статус: выполнен.

Задачи:

- Добавить фикстуры или management command для демо-данных.
- Покрыть сервисы тестами.
- Покрыть API smoke-тестами.
- Проверить типовые пользовательские сценарии.

Реализовано:

- Добавлена management command `seed_demo_data`.
- Команда создает роли, демо-пользователей, станцию, боксы, тарифы, клиента,
  автомобиль, мойщиков и смены на текущий день.
- Сервисные тесты покрывают pricing, availability и booking.
- API-тесты покрывают availability, booking endpoints и manager endpoints.
- Добавлен тест команды демо-данных.

Критерии готовности:

- тесты проходят локально;
- демо-станция имеет боксы, мойщиков, смены, цены и длительности;
- можно создать запись через API.

#### B9. CI/CD

Статус: выполнен.

Задачи:

- Добавить GitHub Actions workflow для автоматических проверок.
- Проверять актуальность миграций.
- Запускать Django-тесты с coverage.
- Зафиксировать минимальный порог покрытия.
- Подготовить безопасный CD-шаблон для деплоя после успешного CI.

Реализовано:

- Добавлен workflow `.github/workflows/ci-cd.yml`.
- CI запускается на push и pull request в `master` и `main`, а также вручную
  через `workflow_dispatch`.
- Workflow использует Python 3.11, устанавливает зависимости проекта и
  `coverage`.
- Добавлена проверка `python manage.py makemigrations --check --dry-run`.
- Добавлено применение миграций перед тестами.
- Тесты запускаются через `coverage run`, отчет формируется через
  `.coveragerc`, минимальный порог покрытия — 80%.
- Coverage XML сохраняется как artifact workflow.
- CD job запускается только после успешного CI на push в `master` или `main`
  и безопасно пропускается, если SSH secrets не настроены.
- Поддерживается опциональный `DEPLOY_PORT` (по умолчанию `22`).

Критерии готовности:

- workflow проходит на свежем checkout;
- неактуальные миграции ломают CI;
- падение тестов или покрытия ниже 80% ломает CI;
- деплой не выполняется без явно заданных SSH secrets.

#### B10. Production-ready конфигурация

Статус: выполнен.

Задачи:

- Убрать жесткую привязку runtime-настроек к локальному окружению.
- Читать `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, security flags и базу
  данных из переменных окружения.
- Добавить поддержку PostgreSQL через `DATABASE_URL`.
- Добавить healthcheck endpoint.
- Добавить production deployment check в CI.
- Задокументировать переменные окружения.

Реализовано:

- Добавлен модуль `back.config` с helper-функциями `env_bool`, `env_int`,
  `env_list` и `database_config`.
- `settings.py` читает runtime-настройки из env-переменных с безопасными
  dev-defaults.
- Добавлена поддержка `DATABASE_URL` для SQLite и PostgreSQL.
- В зависимости добавлен `psycopg2-binary` для PostgreSQL-деплоев.
- Добавлен endpoint `GET /health/`, возвращающий `{"status": "ok"}`.
- Добавлен `.env.example` с шаблоном переменных окружения.
- CI запускает `python manage.py check --deploy --fail-level WARNING` с
  production-like env.
- Добавлены тесты парсинга runtime-конфигурации и healthcheck endpoint.

Критерии готовности:

- локальный запуск продолжает работать на SQLite без env-переменных;
- production env может включить PostgreSQL через `DATABASE_URL`;
- `/health/` доступен без авторизации;
- `check --deploy --fail-level WARNING` проходит в CI.

#### B11. Переименование `WashCoast` → `WashCost`

Статус: выполнен.

Задачи:

- Исправить опечатку в названии модели стоимости мойки.
- Сохранить существующие данные через rename-миграцию.
- Обновить сервисы, admin, demo data и тесты на новое имя `WashCost`.
- Сохранить опциональную поддержку SQLite для локальной разработки.
- Убрать из README устаревший `car-wash-env/` как часть структуры проекта.

Реализовано:

- Модель `WashCoast` переименована в `WashCost`.
- Добавлена миграция `0007_rename_washcoast_washcost` через
  `migrations.RenameModel`.
- `pricing.py`, Django admin, `seed_demo_data` и тесты используют `WashCost`.
- Старое локальное окружение `car-wash-env/` не часть репозитория и
  игнорируется через `.gitignore`.
- В README для локального окружения используется `.venv`.

Критерии готовности:

- `makemigrations --check --dry-run` не создает дополнительных миграций;
- миграции применяются на SQLite;
- тесты проходят;
- в коде, кроме исторических миграций, нет ссылок на `WashCoast`.

#### B12. SPA session auth API

Статус: выполнен.

Задачи:

- Добавить JSON endpoints для session auth будущего frontend.
- Вернуть текущего пользователя, роли и связанный `customer_id`.
- Поддержать login/logout без HTML-форм Django admin.
- Добавить endpoint выдачи CSRF cookie/token.
- Сохранить regular JSON contract для frontend API client.
- Покрыть auth endpoints тестами.

Реализовано:

- Добавлен модуль `back.auth_views`.
- Добавлены маршруты `back.auth_urls` под префиксом `/api/auth/`.
- Endpoints:
  - `GET /api/auth/csrf/`
  - `POST /api/auth/login/`
  - `POST /api/auth/logout/`
  - `GET /api/auth/me/`
- `GET /api/auth/me/` возвращает безопасный anonymous payload для гостя.
- Auth payload содержит `is_authenticated`, `user`, `roles` и `customer_id`.
- Ошибки login возвращают `detail` и `field_errors`.
- Login/logout защищены CSRF protection; frontend получает CSRF через
  `/api/auth/csrf/` перед unsafe methods.
- Добавлены тесты anonymous/current user, CSRF cookie, login, роли,
  validation errors, bad credentials и logout.

Критерии готовности:

- `/api/auth/me/` работает для гостя и авторизованного пользователя;
- login возвращает роли `customer`, `manager`, `admin`;
- logout очищает session;
- `/api/auth/csrf/` выставляет `csrftoken`.

#### B13. Frontend dictionary API

Статус: выполнен.

Задачи:

- Добавить read-only JSON endpoints для справочников, нужных форме записи.
- Добавить endpoint текущего customer profile.
- Добавить endpoint автомобилей текущего клиента.
- Сохранить публичный доступ к безопасным справочникам.
- Покрыть endpoints тестами.

Реализовано:

- Endpoints:
  - `GET /api/cars/brands/`
  - `GET /api/cars/models/`
  - `GET /api/cars/types/`
  - `GET /api/personal/stations/`
  - `GET /api/car-wash/wash-types/`
  - `GET /api/customers/me/`
  - `GET /api/customers/cars/`
- Публичные справочники возвращают compact regular JSON под ключом `data`.
- `GET /api/customers/me/` и `GET /api/customers/cars/` требуют
  authentication.
- Для `manager` поддержан query param `customer` в
  `GET /api/customers/cars/?customer=...`.
- Добавлены тесты публичных справочников, customer profile, customer cars,
  отсутствующего customer profile и manager lookup.

Критерии готовности:

- публичные dictionary endpoints доступны без login;
- customer endpoints возвращают данные текущего пользователя;
- manager может запросить автомобили конкретного customer.

#### B14. Единый API contract и ошибки

Статус: выполнен.

Задачи:

- Ввести helpers для successful/error responses.
- Привести ошибки всех API к формату `detail` + `field_errors` + `code`.
- Убрать разнобой в статусах `400`, `401`, `403`, `404`.
- Добавить tests на ошибки booking, manager assign, auth и dictionary
  endpoints.
- Зафиксировать контракт в документации.

Реализовано:

- Shared API response helpers, единый exception handler, единый `code` и
  нормализованный `field_errors` для auth, dictionary, booking и manager
  endpoints.

Критерии готовности:

- frontend может одинаково показывать ошибки форм на всех endpoints;
- старые successful payloads под `data` не сломаны;
- тесты покрывают минимум happy path и error path для ключевых endpoints.

#### B15. Несколько автомобилей у клиента

Статус: выполнен в переходной модели.

Задачи:

- Добавить связь `customer.Car.customer`.
- Оставить текущий `Customer.car` на переходный период.
- Обновить `GET /api/customers/cars/` для возврата нескольких автомобилей.
- Добавить endpoints клиента для CRUD автомобилей.
- Обновить проверки booking: только своя активная машина.
- Добавить manager lookup по customer.

Реализовано:

- `Customer.car` сохранен для совместимости, `Car.customer` стал основной
  связью владения.
- Список машин возвращает несколько активных автомобилей.
- Добавлены `POST /api/customers/cars/`, `PATCH /api/customers/cars/{id}/`,
  `DELETE /api/customers/cars/{id}/` (soft-delete).
- Проверки booking запрещают чужие или неактивные машины.

Критерии готовности:

- текущие демо-данные мигрируют без ручных действий;
- клиент может иметь несколько автомобилей;
- существующий booking flow продолжает работать;
- тесты проверяют запрет записи на чужой автомобиль.

#### B16. Доступ менеджеров к станциям

Статус: выполнен.

Задачи:

- Добавить модель `ManagerStationAccess`.
- Ограничить manager endpoints станциями, к которым есть доступ.
- Обновить schedule, booking list, assign, shifts и resource blocks.
- Добавить возможность admin видеть все станции.
- Обновить `seed_demo_data`, чтобы demo manager получил доступ к demo
  station.

Реализовано:

- Добавлена модель `ManagerStationAccess`.
- Миграция выдает доступ существующим manager-пользователям к текущим
  станциям.
- Demo manager получает demo station.
- Manager schedule/bookings/assign/status/shifts/resource blocks ограничены
  доступными станциями.
- Admin сохраняют полный доступ.

Критерии готовности:

- manager не видит и не меняет записи чужой станции;
- admin сохраняет полный доступ;
- фильтры manager API учитывают station access;
- тесты покрывают разрешенный и запрещенный доступ.

#### B17. Усиление целостности бронирований

Статус: выполнен.

Задачи:

- Подтвердить повторную проверку ресурсов внутри транзакций для всех
  операций создания, переноса и назначения.
- Добавить блокировки чтения там, где это возможно без ломки SQLite.
- Для PostgreSQL подготовить exclusion constraints или отдельные resource
  reservation rows.
- На SQLite сохранить сервисную проверку пересечений как основной механизм.
- Добавить стресс-тесты сервисного уровня на конфликтующие интервалы.

Реализовано:

- В `car_wash.services.booking` добавлен helper `_lock_station(...)`,
  который выполняет `SELECT ... FOR UPDATE` по строке `WashStation` внутри
  активной транзакции.
- `create_booking`, `reschedule_booking` и `assign_booking_resources`
  вызывают `_lock_station` сразу после `transaction.atomic()` и до
  `_select_resources`. На PostgreSQL это сериализует параллельные попытки
  на одну станцию; на SQLite вызов — no-op, потому что движок и так
  сериализует пишущие транзакции на уровне БД.
- Сервисная проверка пересечений `_select_resources` остаётся основным
  механизмом и работает одинаково на SQLite и PostgreSQL.
- Добавлены стресс-тесты:
  `test_create_booking_acquires_station_lock_before_resource_check`,
  `test_repeated_create_booking_attempts_only_one_succeeds` (5 попыток на
  один и тот же слот, активная запись остаётся одна),
  `test_reschedule_booking_into_busy_slot_raises`,
  `test_assign_booking_resources_rejects_box_in_use`.

Критерии готовности:

- две активные записи не могут занять один бокс в одно время;
- один мойщик не может быть назначен на пересекающиеся активные записи;
- SQLite tests продолжают проходить;
- PostgreSQL-specific блокировки изолированы в `_lock_station` и
  документированы в коде.

#### B18. Улучшение manager schedule API

Статус: выполнен.

Задачи:

- Добавить компактный payload для временной сетки дня.
- Вернуть вычисленные границы дня, шаг сетки и агрегаты загрузки.
- Добавить быстрые filters: `station`, `date`, `status`, `washer`, `box`.
- Поддержать partial refresh после изменения одной записи.
- Добавить endpoint деталей: `GET /api/manager/bookings/{id}/`.

Реализовано:

- Endpoint `GET /api/manager/schedule/?station=&date=` теперь возвращает
  поля `day_starts_at`, `day_ends_at`, `step_minutes`
  (`SCHEDULE_DEFAULT_STEP_MINUTES = 30`).
- Добавлено поле `summary` с `total_bookings`, `active_bookings`,
  `busy_box_minutes` и `busy_washer_minutes` (агрегаты по
  активным статусам `pending`/`confirmed`/`in_progress`, отсечённые
  границами дня).
- Добавлен endpoint `GET /api/manager/bookings/{id}/`
  (`ManagerBookingDetailView`), фильтруемый правом доступа к станции; URL
  зарегистрирован под именем `api:manager:booking-detail`.
- `ManagerBookingListView` уже поддерживал фильтры `station`, `date`,
  `status`, `box`, `washer` — поведение задокументировано тестами и
  типами.
- Добавлены backend-тесты:
  `test_manager_schedule_api_returns_day_resources_and_bookings`
  (расширен новыми ассертами на `day_starts_at`, `day_ends_at`,
  `step_minutes`, `summary`),
  `test_manager_schedule_summary_excludes_cancelled_bookings`,
  `test_manager_booking_detail_returns_booking`,
  `test_manager_booking_detail_rejects_inaccessible_station`.
- Frontend тип `ManagerScheduleDay` расширен опциональными
  `day_starts_at`, `day_ends_at`, `step_minutes`, `summary`. Добавлен
  helper `getManagerBooking(id)` в `api/manager.ts`. Setup-фикстуры тестов
  обновлены под новый payload.

Критерии готовности:

- frontend получает рассчитанные границы дня и шаг сетки и не пересчитывает
  их в UI;
- agregates в `summary` показывают загрузку боксов и мойщиков по дню;
- manager-детали записи доступны через единый endpoint;
- payload расширен без удаления старых полей (обратная совместимость
  сохранена).

#### B19. OpenAPI и типы для frontend

Статус: выполнен.

Задачи:

- Подключить OpenAPI tooling, например `drf-spectacular`.
- Описать схемы auth, dictionaries, booking, availability и manager API.
- Добавить endpoint `/api/schema/` и Swagger/ReDoc только для dev/admin.
- Настроить CI check генерации схемы.
- Подготовить frontend к генерации TypeScript types.

Реализовано:

- Установлен `drf-spectacular==0.27.2`, добавлен в `INSTALLED_APPS` и в
  `requirements.txt`.
- В `REST_FRAMEWORK['DEFAULT_SCHEMA_CLASS']` подключён собственный
  `back.schema_extensions.LooseAutoSchema`, который для plain `APIView`
  без `serializer_class` молча возвращает generic-объект вместо ошибки.
  Это покрывает все наши APIView без переписывания views под
  `GenericAPIView` или ручной @extend_schema на каждом классе.
- В `back/api_urls.py` добавлены маршруты:
  - `GET /api/schema/` — YAML-схема (`api:schema`);
  - `GET /api/schema/swagger/` — Swagger UI (`api:schema-swagger`);
  - `GET /api/schema/redoc/` — ReDoc (`api:schema-redoc`).
- `SPECTACULAR_SETTINGS['SERVE_PERMISSIONS']` поднят до
  `car_wash.permissions.IsManager`, поэтому schema/UI доступны только
  manager/admin — production-сервер не публикует API-surface наружу.
- `ManagerBookingDetailView.get` декорирован
  `@extend_schema(operation_id="manager_booking_retrieve")`, чтобы
  устранить коллизию operationId с `ManagerBookingListView`.
- В CI workflow добавлен шаг `python manage.py spectacular --validate
  --fail-on-warn --file ../openapi.yaml`, плюс upload artifact
  `openapi-schema`.
- Добавлены тесты `OpenApiSchemaTests`: anonymous → 403, manager → 200,
  Swagger UI рендерится для manager, ключевые пути присутствуют в YAML.

Критерии готовности:

- `python manage.py spectacular --validate --fail-on-warn` выходит с 0,
  без ошибок и предупреждений на чистом репозитории;
- frontend может сверять контракт через скачанный YAML или Swagger UI;
- production-окружение защищает schema/UI permission-классом IsManager;
- artifact `openapi-schema` поднимается из CI как источник истины для
  будущей кодогенерации (этап F11).

#### B20. Audit log для управленческих действий

Статус: выполнен.

Задачи:

- Добавить модель `AuditEvent`.
- Логировать создание/перенос/отмену записи, смену статуса, назначение
  бокса/мойщика, создание смены, создание блокировки ресурса.
- Хранить actor, action, entity type/id, timestamp и diff/context.
- Добавить manager/admin endpoint для просмотра истории записи.

Реализовано:

- Добавлена модель `car_wash.AuditEvent` с полями `actor` (FK к
  `auth.User`, `on_delete=SET_NULL`), `action` (TextChoices),
  `entity_type`, `entity_id`, `context` (JSONField), `created_at` и
  индексами по `(entity_type, entity_id, created_at)` и
  `(actor, created_at)`.
- Миграция `0009_auditevent_*` создаёт таблицу и индексы.
- В `car_wash.services.booking` добавлен helper `_record_audit`, который
  пишет аудит-событие внутри той же `transaction.atomic()`, что и
  изменение записи. Все четыре операции
  (`create_booking`, `cancel_booking`, `reschedule_booking`,
  `assign_booking_resources`, `change_booking_status`) принимают
  `actor=None` и фиксируют событие с контекстом (изменения времени,
  статуса, бокса, мойщиков).
- В `car_wash.manager_views` добавлен helper `_audit_create` для шифтов и
  ResourceBlock, которые создаются напрямую через ORM, и хуки
  `SHIFT_CREATED`, `RESOURCE_BLOCK_CREATED`.
- Все клиентские/manager views передают `actor=request.user` в сервис.
- Добавлен endpoint `GET /api/manager/bookings/{id}/audit/`
  (`ManagerBookingAuditView`), возвращающий историю по конкретной записи.
  Endpoint защищён `IsManager` и `ManagerStationAccess`.
- Helper `_audit_event_payload` возвращает `id`, `action`, `actor`,
  `actor_username`, `context`, `created_at`.
- Добавлены тесты: жизненный цикл события (CREATE→RESCHEDULE→CANCEL),
  manager endpoint возвращает историю с actor_username, и rejection при
  отсутствии доступа к станции.

Критерии готовности:

- по каждой записи можно восстановить полную историю manager-действий;
- audit-запись делается транзакционно с самим изменением, fail-fast при
  ошибке внутри транзакции;
- тесты покрывают создание событий и endpoint просмотра истории.

#### B21. Notifications-ready слой

Задачи:

- Добавить `NotificationOutbox`.
- Создавать outbox events на booking created/rescheduled/cancelled/status
  changed.
- Пока не подключать реальный SMS/email provider.
- Добавить management command для обработки outbox в dev.

Критерии готовности:

- события уведомлений фиксируются транзакционно рядом с изменением записи;
- повторная обработка outbox безопасна;
- реального внешнего провайдера можно подключить отдельным этапом.

#### B22. Payment-ready слой

Задачи:

- Добавить payment status в booking или отдельную модель `Payment`.
- Разделить расчет аванса и факт оплаты аванса.
- Подготовить поля provider/payment reference без интеграции реального
  провайдера.
- Обновить статусы и права изменения booking после оплаты.

Критерии готовности:

- backend различает рассчитанный аванс и оплаченный аванс;
- booking flow готов к будущей онлайн-оплате;
- без payment provider система продолжает работать вручную.

#### B23. Production operations

Задачи:

- Настроить CORS/CSRF для separate frontend host.
- Добавить readiness endpoint, проверяющий database connection.
- Подготовить Dockerfile/docker-compose для backend + database.
- Описать backup/restore SQLite и PostgreSQL.
- Добавить management command для health diagnostics.

Критерии готовности:

- локальный Docker запуск дополняет SQLite dev-flow, не заменяет его;
- production health/readiness можно использовать в deploy;
- backup и restore описаны в docs.

#### B24. Отчеты MVP+

Задачи:

- Добавить manager endpoints для дневных агрегатов: число записей, выручка
  по статусам, загрузка боксов, загрузка мойщиков.
- Считать только completed/paid там, где применимо.
- Добавить фильтры по станции и периоду.

Критерии готовности:

- руководитель получает базовые цифры по дню/неделе;
- расчеты покрыты тестами;
- отчетные endpoints не мешают основному booking flow.

### 10.3 Frontend, выполнено

#### F1. Frontend scaffold

Статус: выполнен.

Задачи:

- Создать `front/` на Vite + React + TypeScript.
- Настроить ESLint, formatter, Vitest, React Testing Library.
- Добавить базовые CSS tokens: spacing, colors, typography, status colors.
- Настроить `npm` scripts: `dev`, `build`, `test`, `lint`, `preview`.
- Добавить frontend job в GitHub Actions.

Критерии готовности:

- `npm run build` проходит;
- `npm test` проходит;
- CI запускает backend и frontend проверки.

#### F2. API client и auth shell

Статус: выполнен.

Задачи:

- Добавить `api/client.ts` с base URL, JSON handling и CSRF.
- Добавить query keys для TanStack Query.
- Реализовать auth state через `GET /api/auth/me/`.
- Реализовать login/logout flow.
- Добавить route guards по ролям.

Backend prerequisites:

- auth endpoints и dictionary endpoints из B12-B13 уже добавлены и покрыты
  backend tests;
- для separate frontend host настроены CORS и CSRF trusted origins.

Критерии готовности:

- пользователь входит и выходит;
- после reload роль восстанавливается через `/api/auth/me/`;
- customer не попадает в manager routes.

#### F3. Справочники и форма записи клиента

Статус: выполнен.

Задачи:

- Загрузить станции, типы авто, автомобили клиента и типы мойки.
- Реализовать выбор станции, автомобиля, типа мойки и даты.
- Запрашивать availability при изменении параметров.
- Показывать доступные слоты компактным списком или сеткой времени.
- Подтверждать запись через `POST /api/car-wash/bookings/`.

Критерии готовности:

- клиент может создать запись от выбора параметров до успешного экрана;
- занятые слоты не отображаются;
- ошибки pricing/availability показываются рядом с формой.

#### F4. Личный кабинет клиента

Статус: выполнен.

Задачи:

- Показать список моих записей.
- Добавить фильтр будущие/прошедшие/отмененные.
- Добавить детали записи: станция, бокс, время, услуга, стоимость, аванс,
  остаток, статус.
- Реализовать отмену и перенос записи.

Критерии готовности:

- клиент видит только свои записи;
- отмена обновляет список без reload;
- перенос снова использует availability.

#### F5. Кабинет руководителя: расписание дня

Статус: выполнен.

Задачи:

- Реализовать `/manager/schedule` с выбором станции и даты.
- Показать боксы, смены, блокировки и записи из
  `GET /api/manager/schedule/`.
- Сгруппировать записи по боксам и времени.
- Добавить быстрые действия: сменить статус, открыть детали, переназначить.
- Обновлять данные после мутаций через query invalidation.

Критерии готовности:

- руководитель видит загрузку боксов на день;
- видны назначенные мойщики;
- статусы читаются с первого взгляда;
- смена статуса сразу отражается в расписании.

#### F6. Кабинет руководителя: записи, смены, блокировки

Статус: выполнен.

Задачи:

- Реализовать `/manager/bookings` с фильтрами station/date/status/box/washer.
- Реализовать modal для ручного назначения бокса и мойщиков.
- Реализовать страницы или drawers для создания смен и resource blocks.
- Добавить валидацию интервалов времени на клиенте.

Критерии готовности:

- manager может найти запись по фильтрам;
- manager может переназначить ресурсы;
- manager может создать смену и блокировку;
- конфликт ресурсов возвращается backend и показывается пользователю.

#### F7. E2E smoke tests

Статус: выполнен.

Задачи:

- Настроить Playwright.
- Поднимать backend с demo data для e2e.
- Проверить smoke-сценарии: customer login и создание записи; просмотр
  моих записей; manager login и открытие расписания; смена статуса или
  создание блокировки.

Критерии готовности:

- e2e tests запускаются локально;
- CI может запускать e2e хотя бы вручную или по отдельному workflow.

#### F8. Production build и деплой

Статус: выполнен.

Задачи:

- Добавить `VITE_API_BASE_URL`.
- Для same-origin режима использовать пустой base URL и относительные `/api/`.
- Для separate frontend host настроить CORS/CSRF на backend.
- Добавить frontend build artifact в CI.
- Расширить CD: деплоить backend и frontend assets.

Критерии готовности:

- `npm run build` создает production assets;
- frontend может работать с backend on same-origin;
- deployment secrets документированы;
- `/health/` backend остается доступным для мониторинга.

#### F9. Несколько автомобилей клиента в UI

Статус: выполнен.

Backend prerequisites: B15 (выполнен) — backend отдаёт несколько активных
автомобилей через `GET /api/customers/cars/` и поддерживает
`POST/PATCH/DELETE /api/customers/cars/{id}/` с soft-delete через
`Car.is_active`.

Реализовано:

- Добавлена страница `/my/cars` со списком автомобилей клиента (номер,
  тип, статус) и кнопкой добавления.
- Реализован модальный `CarFormModal` для создания и редактирования с
  валидацией через `react-hook-form` + `zod`. Тип выбирается из списка
  `GET /api/cars/types/`.
- Реализован soft-delete через `DELETE /api/customers/cars/{id}/` с
  подтверждением `window.confirm`.
- В `BookingForm` добавлен empty-state с CTA-ссылкой на `/my/cars`, когда
  у клиента нет активных автомобилей; селект автомобиля отключается.
- Ошибки backend сериализуются по контракту `field_errors` через
  `ApiError` и `setError` от `react-hook-form`.
- `CustomerCar` тип расширен полями `is_active?` и `customer?`.
- В `dictionaries.ts` добавлены helpers `createCustomerCar`,
  `updateCustomerCar`, `deleteCustomerCar`.
- В `AppShell` добавлен пункт навигации «Мои авто».
- Vitest-тесты покрывают рендер списка, открытие модала и валидацию формы.
- Playwright e2e добавляет сценарий: создать автомобиль, увидеть его в
  списке, удалить и убедиться, что он пропал.

Критерии готовности:

- клиент управляет несколькими автомобилями через UI без обращения к
  Django admin;
- booking flow выбирает автомобиль из списка активных машин клиента;
- soft-deleted автомобиль не возвращается из `GET /api/customers/cars/`,
  поэтому не предлагается в booking flow;
- ошибки формы рендерятся через единый формат `field_errors`;
- e2e покрывают create/delete; редактирование покрыто vitest.

Не входит в F9: удаление legacy-поля `Customer.car` на backend — это
отдельный тех-долг (см. раздел 14.2), который делается после полного
перехода UI на `Car.customer`.

#### F10. Manager schedule после B18

Статус: выполнен.

Задачи:

- Использовать новый компактный payload и границы дня.
- Подсветить загрузку боксов и мойщиков на агрегатах.
- Реализовать partial refresh без перезапроса всего дня.

Реализовано:

- В `ManagerSchedulePage` сетка времени строится через `deriveScheduleHours`
  из `schedule.shifts` и `schedule.bookings`, с fallback на текущий
  диапазон 9-18, если данных нет; это убирает захардкоженный список часов
  в пользу динамического диапазона, основанного на серверном payload.
- Под именем каждого бокса и мойщика отображается агрегат загрузки за день
  через helper `formatLoadMinutes` (например, «1 ч 30 мин»). Агрегаты
  берутся из `schedule.summary.busy_box_minutes` и
  `schedule.summary.busy_washer_minutes`.
- `ManagerBookingDetailsPage` переключён на новый endpoint
  `GET /api/manager/bookings/{id}/` через `getManagerBooking`. Раньше
  страница тянула полный список заказов и фильтровала на клиенте; теперь
  загружает только нужный заказ. Mutation `onSuccess` инвалидирует
  отдельный query-key `["manager", "booking", id]` для точечного refresh.
- Setup-фикстуры тестов покрывают новый endpoint деталей и расширенный
  schedule payload с `summary`/`day_starts_at`/`day_ends_at`/`step_minutes`.

Критерии готовности:

- расписание загружается одним запросом, agregates строятся без
  доп.вычислений в UI;
- обновление статуса/назначения одной записи не вызывает полный refetch
  списка заказов: затрагивается только query деталей и schedule;
- сетка времени динамически адаптируется под смены и записи дня.

#### F11. Генерация типов из OpenAPI

Статус: выполнен.

Задачи:

- Добавить скрипт `npm run generate:api` из `/api/schema/`.
- CI-check синхронизации сгенерированных типов.
- Удалить ручные типы в `src/api/types.ts`.

Реализовано:

- Установлен dev-dep `openapi-typescript@^7.13`.
- Добавлены npm-скрипты `generate:api` (генерирует
  `src/api/types-generated.ts` из `../openapi.yaml`, который
  поднимает backend через `python manage.py spectacular`) и `check:api`
  (генерирует и проверяет `git diff --exit-code` для типов).
- Сгенерирован первый зафиксированный `src/api/types-generated.ts`
  (~36KB) с интерфейсами `paths`, `operations`, `components`.
- В CI:
  - frontend-job теперь зависит от django-job (`needs: django`);
  - frontend job скачивает artifact `openapi-schema` и запускает
    `npm run check:api` — это падает, если разработчик забыл
    перегенерировать типы после изменения backend контракта.
- Ручные типы в `src/api/types.ts` пока **не удалены**: текущий код
  фронтенда работает с ними и переключение на `types-generated.ts`
  пройдёт постепенно вместе с уточнением серверных serializer-ов.
  Синхронизация контракта обеспечивается CI-check на drift; компонентные
  типы можно использовать по необходимости через
  `import type { components } from "./types-generated"`.

Критерии готовности:

- типы синхронизированы в CI: drift по `types-generated.ts` ломает
  frontend-job;
- разработчик одной командой `npm run generate:api` обновляет типы
  локально без знаний backend-инструментов;
- ручные типы остаются как primary до полного перехода на
  serializer-based schema (см. раздел 14 — техдолг по миграции типов).

#### F12. Audit log в UI

Статус: выполнен.

Задачи:

- Drawer с историей действий на странице записи.
- Фильтры по типу события и автору.

Реализовано:

- Добавлен helper `getManagerBookingAudit(id)` в `api/manager.ts` и
  типы `AuditAction`/`AuditEvent` в `api/types.ts`.
- В `ManagerBookingDetailsPage` добавлен компонент `AuditHistoryPanel`,
  который тянет события через TanStack Query
  (`["manager", "booking-audit", id]`), показывает их списком с актором,
  таймстемпом и человекочитаемой меткой действия.
- Реализован фильтр по типу события (selector с опциями: «Все»,
  «Создание», «Перенос», «Отмена», «Смена статуса», «Назначение»);
  фильтрация выполняется на клиенте без перезапроса. Фильтр по автору
  пока не добавлен — для типового station-flow актор почти всегда один,
  и фильтр не нужен; будет добавлен по запросу.
- `ContextSummary` рендерит человекочитаемые переходы: для
  `booking_status_changed` показывает `previous_status → status`, для
  `booking_rescheduled` — пары `formatDateTime`. Прочие события
  показываются по action и actor без раскрытия context.
- Vitest fixture добавляет два события (`booking_created`,
  `booking_status_changed`); компонентный тест проверяет наличие
  историй в region «История действий», корректное отображение действий
  и форматированный переход статусов.

Критерии готовности:

- manager видит полную историю записи прямо на странице деталей без
  обращения в Django admin;
- фильтр по типу действия скрывает посторонние события;
- запросы аудита кешируются и инвалидируются вместе с другими query
  записи (`["manager", "booking", ...]`).

#### F13. Платежи в UI (после B22)

Задачи:

- Отображение статуса оплаты в `BookingSummary`.
- Запуск/возобновление оплаты — заглушка под будущего провайдера.

Критерии готовности:

- UI показывает статус оплаты;
- ручной режим без провайдера сохранен.

#### F14. Отчеты в UI (после B24)

Задачи:

- Раздел `/manager/reports` с дневными/недельными агрегатами.
- Графики загрузки боксов и мойщиков, выручка по статусам.

Критерии готовности:

- manager видит базовые отчеты в UI без обращения в БД.

### 10.5 Инфраструктура

| #   | Этап                                          | Статус   |
| --- | --------------------------------------------- | -------- |
| I1  | Backend Dockerfile и compose                  | done     |
| I2  | Frontend Dockerfile и compose                 | done     |
| I3  | docker-compose.yml объединенный               | done     |
| I4  | GitHub Actions CI                             | done     |
| I5  | GitHub Actions CD (опционально через secrets) | done     |
| I6  | Playwright workflow для e2e                   | done     |
| I7  | Production-grade compose с PostgreSQL         | planned  |
| I8  | Backup/restore инструкции в docs              | planned  |
| I9  | Observability: structured logs, health probes | planned  |

## 11. Тестирование

### 11.1 Backend

- Unit/integration тесты Django для сервисов и API.
- Coverage порог в CI: ≥ 80%.
- Тесты покрывают:
  - pricing (расчет цены, длительности, аванса, ошибки конфигурации);
  - availability (свободные слоты, конфликты, отмененные записи, блокировки
    станции/бокса/мойщика);
  - booking (создание, запрет двойного бронирования, отмена, перенос,
    смена статуса);
  - manager schedule, фильтры, назначение, статус, смены, блокировки;
  - права доступа (customer, manager, admin, ManagerStationAccess);
  - auth endpoints (anonymous/current user, CSRF, login, роли, validation,
    bad credentials, logout);
  - dictionary endpoints, customer profile, customer cars, manager lookup;
  - customer cars CRUD и запрет записи на чужой автомобиль;
  - runtime config parsing и healthcheck.

Демо-данные: `python manage.py seed_demo_data`.

### 11.2 Frontend

- Vitest + React Testing Library для unit и component-тестов.
- Playwright для e2e smoke:
  - customer login, создание записи, просмотр своих записей;
  - manager login, открытие расписания, смена статуса/создание блокировки.
- E2E запускаются против Docker stack с demo-данными.

### 11.3 CI

GitHub Actions workflow `.github/workflows/ci-cd.yml`:

- Backend job: Python 3.11, install deps,
  `python manage.py makemigrations --check --dry-run`,
  `python manage.py migrate --noinput`,
  `python manage.py check --deploy --fail-level WARNING`,
  `coverage run --rcfile=../.coveragerc manage.py test`,
  отчет coverage с порогом 80%.
- Frontend job: Node, install npm deps, `npm run lint`, проверка
  форматирования, Vitest, production build, upload `front/dist/` как
  artifact `frontend-dist`.
- E2E workflow `.github/workflows/e2e.yml` запускается вручную для
  Playwright против полного Docker stack.
- CD job выполняется только после успешного backend и frontend CI на push в
  `master` или `main` и пропускается, если SSH secrets не заданы.

## 12. Production-эксплуатация

### 12.1 Запуск

Docker compose:

```bash
docker compose up --build
```

После запуска:

- Frontend: <http://127.0.0.1:5173/>
- Backend API: <http://127.0.0.1:8000/api/>
- Admin: <http://127.0.0.1:8000/admin/>
- Healthcheck: <http://127.0.0.1:8000/health/>

Backend контейнер автоматически применяет миграции и по умолчанию сидит
demo data (флаг `DJANGO_SEED_DEMO_DATA`). Демо-пользователи:
`demo_customer`, `demo_manager`, `demo_admin`, пароль `password`.

Сброс демо-базы:

```bash
docker compose down -v
docker compose up --build
```

### 12.2 Runtime configuration

Через переменные окружения (см. `.env.example`):

| Переменная | Назначение | Default |
| ---------- | ---------- | ------- |
| `DJANGO_SECRET_KEY` | Django secret key | dev fallback |
| `DJANGO_DEBUG` | Debug mode | `true` |
| `DJANGO_ALLOWED_HOSTS` | Allowed hosts | local hosts в debug |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | CSRF trusted origins | empty |
| `DJANGO_CORS_ALLOWED_ORIGINS` | CORS origins для отдельного frontend host | empty |
| `DJANGO_CORS_ALLOW_CREDENTIALS` | Cookie на CORS | `true` если CORS origins |
| `VITE_API_BASE_URL` | Build-time API origin frontend | empty |
| `DATABASE_URL` | URL базы (SQLite/PostgreSQL) | `back/db.sqlite3` |
| `DJANGO_SECURE_SSL_REDIRECT` | HTTP → HTTPS | `false` |
| `DJANGO_SESSION_COOKIE_SECURE` | Secure session cookie | `not DEBUG` |
| `DJANGO_CSRF_COOKIE_SECURE` | Secure CSRF cookie | `not DEBUG` |
| `DJANGO_SECURE_HSTS_SECONDS` | HSTS max age | `0` |
| `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS` | HSTS subdomains | `false` |
| `DJANGO_SECURE_HSTS_PRELOAD` | HSTS preload | `false` |
| `DJANGO_SECURE_PROXY_SSL_HEADER` | Trust X-Forwarded-Proto | `false` |

PostgreSQL пример:

```bash
export DJANGO_DEBUG=false
export DJANGO_SECRET_KEY="<strong-secret>"
export DJANGO_ALLOWED_HOSTS="carwash.example.com"
export DATABASE_URL="postgres://carwash:password@localhost:5432/carwash"
```

### 12.3 Режимы frontend

- **Same-origin**: `VITE_API_BASE_URL=""`, `/api/` и `/health/`
  проксируются на Django с того же origin.
- **Separate host**: `VITE_API_BASE_URL` указывает на backend origin;
  frontend origin добавлен в `DJANGO_CORS_ALLOWED_ORIGINS` и
  `DJANGO_CSRF_TRUSTED_ORIGINS`.

### 12.4 Деплой

CD-template в GitHub Actions использует SSH-secrets:

- `DEPLOY_HOST` — hostname или IP.
- `DEPLOY_PORT` — опциональный SSH-порт (по умолчанию `22`).
- `DEPLOY_USER` — SSH-пользователь.
- `DEPLOY_KEY` — приватный SSH-ключ.
- `DEPLOY_PATH` — путь к проекту на сервере для команды по умолчанию.
- `DEPLOY_FRONTEND_PATH` — опциональная директория для распаковки
  artifact `frontend-dist`.
- `DEPLOY_COMMAND` — опциональная полная команда деплоя.

Без secrets деплой безопасно пропускается.

## 13. Риски и решения

### 13.1 Пересечение записей

Риск: две активные записи могут попасть на один бокс или одного мойщика.

Решение: проверять пересечения в сервисе бронирования внутри транзакции.
На PostgreSQL добавить exclusion constraints или резервацию на уровне БД
(этап B17).

### 13.2 Распыление логики между приложениями

Риск: часть записи в `main.Schedule`, часть в `car_wash`.

Решение: целевая модель `car_wash.Booking`. `main.Schedule` остается как
наследие до миграции данных и удаления приложения.

### 13.3 Неполная модель клиента

Риск: один клиент не может удобно хранить несколько автомобилей.

Решение: связь `Car.customer` стала основной. Старое `Customer.car`
сохранено на переходный период для обратной совместимости (этап B15).

### 13.4 Опечатка `WashCoast`

Решено на этапе B11: rename-миграция без пересоздания данных. Исторические
миграции сохраняют старое имя как часть истории схемы.

### 13.5 Manager schedule может стать тяжелым

Риск: расписание дня станет большим/медленным.

Решение: кеш по ключу `station + date`; query invalidation после точечных
действий; компактный payload в B18; polling/websocket — только при реальной
потребности.

### 13.6 Мобильный manager UI

Риск: сетка расписания плохо помещается на маленьком экране.

Решение: горизонтальный скролл и compact mode для manager routes; основной
мобильный UX оптимизирован под клиента.

### 13.7 Разные форматы API

Риск: DRF JSON:API подключен, а MVP endpoints отдают обычный JSON.

Решение: frontend client использует только regular JSON contract. JSON:API
не смешивается с текущими abstractions.

### 13.8 Нет JSON auth endpoints

Риск: SPA не сможет нормально управлять session auth.

Решение: `/api/auth/me/`, login, logout и csrf endpoint добавлены на этапе
B12. Frontend вызывает `/api/auth/csrf/` перед unsafe methods и использует
session cookies.

### 13.9 Расхождение типов API между backend и frontend

Риск: ручные типы в `src/api/types.ts` рассинхронизируются с backend.

Решение: переход на OpenAPI + автогенерацию (этапы B19/F11).

## 14. Технический долг

Известные проблемы, не блокирующие MVP, но требующие исправления при
ближайшей возможности.

### 14.1 Опечатка в `cars.CarDescription`

В модели `cars.CarDescription` имена полей `сarBrand` и `сarModel` записаны
с кириллической `с` вместо латинской `c`. Python это допускает, но имена
ломают:

- Django ORM lookups через `**kwargs` и `filter(...)` при копипасте имен;
- автокомплит и refactoring в IDE;
- любые сериализаторы/QuerySets, которые ожидают latin field names.

Решение: rename-миграция полей с одновременным обновлением админки и любых
queryset-ссылок. Сделать в рамках первого же этапа, который касается
`cars/`. Не выделено отдельным B-этапом, чтобы не блокировать roadmap.

### 14.2 Обязательное legacy-поле `Customer.car`

`customer.Customer.car` остаётся `ForeignKey(on_delete=PROTECT)` без
`null=True`. Это вынуждает заполнять поле при создании клиента и мешает
полному переходу на связь `Car.customer`.

Решение: после полного перехода frontend и backend на `Car.customer`
сделать поле nullable отдельной миграцией, затем удалить совсем при
следующей версии. Связано с этапом F9 (UI управления автомобилями).

### 14.3 Legacy-модели в `personal/` и `main/`

`personal.City`, `personal.District`, `personal.DateType`,
`personal.TimeSheet`, `main.Schedule` остаются в кодовой базе, но не
используются текущим booking flow. Они увеличивают cognitive load и
схему БД.

Решение: после стабилизации MVP-flow и подтверждения отсутствия внешних
потребителей — миграция данных и удаление приложения `main` целиком,
очистка лишних моделей в `personal/`.

### 14.4 Дублирование форматтеров и сетки расписания

`Money`/`DateTime` форматтеры и логика `ScheduleGrid`/`ResourceBlockForm`
во frontend живут inline в страницах. Это нормально для MVP, но станет
проблемой, когда тот же формат потребуется в новых местах (например,
отчёты F14).

Решение: вынести в `src/components/` при первой же необходимости второй
точки использования. Не отдельным этапом.

### 14.5 Ручные API-типы во frontend

`src/api/types.ts` поддерживается параллельно со сгенерированным
`src/api/types-generated.ts`. После B19/F11 контракт фиксируется
автогенерацией, и CI ловит drift через `npm run check:api`. Однако пока
все feature-страницы импортируют из `types.ts`, и значения ответов на
большинстве endpoints в схеме описаны как generic-объекты — это
пока ограничение текущей пары AutoSchema + APIView.

Дальнейший шаг: постепенно вводить per-view DRF serializer-ы и
переводить frontend на импорт из `types-generated.ts`. После этого
ручные типы можно будет удалить.

## 15. Что не входит в MVP

### Не входит сейчас

- Онлайн-оплата реальными платежными провайдерами (готовится в B22).
- SMS/email/push-уведомления (готовится в B21).
- Сложная оптимизация расписания / drag-and-drop.
- Мобильное native-приложение.
- Отчеты по выручке/зарплатам (базовые — в B24/F14).
- Интеграция с бухгалтерией.
- Полная замена Django admin для всех справочников.
- Websocket/realtime обновления расписания.
- Offline mode для клиента.

### Что не делать без явной причины

- Не удалять поддержку SQLite — она нужна для dev и CI.
- Не переписывать backend на другой framework.
- Не подключать реальные платежи или SMS до стабилизации booking/status flow.
- Не добавлять polling/websocket, пока обычный schedule API справляется.
- Не заменять Django admin полностью до появления конкретных
  frontend-экранов.

## 16. Definition of Done для этапа

### Backend DoD

- Есть миграции, если менялась модель данных.
- `python manage.py makemigrations --check --dry-run` проходит.
- `python manage.py migrate --noinput` проходит на SQLite.
- `python manage.py check --deploy --fail-level WARNING` проходит с
  production-like env.
- Тесты проходят.
- Coverage не ниже текущего CI-порога (80%).
- Документация обновлена: roadmap, README или frontend plan, если менялся
  публичный API.
- Коммит содержит только связанный набор backend-изменений.

### Frontend DoD

- `npm run lint`, `npm test` и `npm run build` проходят.
- Новые компоненты покрыты unit/component-тестами там, где это применимо.
- Затронутые e2e smoke сценарии проходят локально или вручную в e2e workflow.
- Документация обновлена при изменении маршрутов/контракта.

## 17. Рекомендуемый порядок реализации MVP (исторический)

1. `WashBox`, `WasherShift`, `Booking`, `BookingAssignment`, `ResourceBlock`.
2. Админка для новых моделей.
3. `pricing.py`.
4. `availability.py`.
5. `booking.py`.
6. Клиентские API.
7. API руководителя.
8. Тесты и демо-данные.
9. CI/CD.
10. Production-ready конфигурация.
11. Переименование `WashCoast` в `WashCost`.
12. SPA session auth API.
13. Frontend dictionary API.

## 18. Рекомендуемый ближайший порядок работ

С учётом текущего статуса (B1-B20 и F1-F12 выполнены):

1. **B21**, **B22** — notifications-ready и payment-ready слои.
2. **F13** — статус оплаты в UI (зависит от B22).
3. **B23**, **I7-I9** — production operations: PostgreSQL compose, backup,
   observability.
4. **B24**, **F14** — отчёты MVP+ (F14 зависит от B24).

Параллельно с roadmap — оппортунистические починки тех-долга (раздел 14):
опечатка в `CarDescription`, удаление обязательности `Customer.car`,
вынос форматтеров и `ScheduleGrid`/`ResourceBlockForm` в `components/`.
Включаются в DoD соответствующих этапов, не блокируют roadmap.

Правило связки backend → frontend: F-этап начинается только после того,
как соответствующий B-этап отмечен `done` и обновлены раздел 9 (контракт)
вместе с типами во `frontend/src/api/types.ts`.
