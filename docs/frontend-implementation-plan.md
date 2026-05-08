# План имплементации frontend для Car Wash

Документ описывает frontend-приложение для текущего Django backend: клиентскую
запись на автомойку и кабинет руководителя для планирования загрузки боксов,
мойщиков, смен и блокировок.

Статус: этапы 1-8 выполнены до production build/deploy включительно.

## 1. Цели frontend MVP

Frontend должен дать две рабочие поверхности:

1. Клиент записывается на мойку: выбирает станцию, автомобиль, тип мойки, дату
   и свободный слот, видит стоимость, аванс и остаток, затем создает запись.
2. Руководитель планирует день: видит расписание станции по боксам и мойщикам,
   назначает ресурсы, меняет статусы заказов, создает смены и блокировки.

Администрирование справочников в MVP можно оставить в Django admin. Frontend
должен фокусироваться на ежедневных рабочих сценариях, а не дублировать всю
админку.

## 2. Предлагаемый стек

- Vite + React + TypeScript.
- React Router для маршрутизации.
- TanStack Query для API-запросов, кеша и invalidation после мутаций.
- React Hook Form + Zod для форм и клиентской валидации.
- CSS Modules или обычный CSS с design tokens на первом этапе; UI-kit можно
  добавить позже, если появится повторяемая библиотека компонентов.
- Playwright для e2e smoke-сценариев.
- Vitest + React Testing Library для unit/component tests.

Причины выбора:

- быстрый старт без тяжелой инфраструктуры;
- хорошая типизация API-контрактов;
- удобный кеш для расписания и списков записей;
- простая интеграция в существующий GitHub Actions workflow.

## 3. Структура проекта

Рекомендуемая структура:

```text
front/
  index.html
  package.json
  vite.config.ts
  tsconfig.json
  src/
    app/
      App.tsx
      router.tsx
      queryClient.ts
    api/
      client.ts
      auth.ts
      bookings.ts
      dictionaries.ts
      manager.ts
      types.ts
    components/
      Button.tsx
      Field.tsx
      Modal.tsx
      StatusBadge.tsx
      Toolbar.tsx
    features/
      auth/
      booking/
      manager-schedule/
      manager-bookings/
      manager-resources/
    layouts/
      AppShell.tsx
      CustomerLayout.tsx
      ManagerLayout.tsx
    styles/
      tokens.css
      base.css
    tests/
      fixtures.ts
```

Frontend должен быть отдельным приложением внутри monorepo, но без смешивания с
Django templates. На production его можно отдавать через отдельный static host
или через Django/Nginx как собранный `dist/`.

## 4. UX и визуальный подход

Это рабочий сервис, а не промо-сайт. Интерфейс должен быть спокойным,
утилитарным и плотным:

- первый экран после входа сразу ведет к записи или расписанию, без landing
  page;
- карточки использовать для отдельных записей и модальных окон, не складывать
  карточки в карточки;
- расписание руководителя делать таблицей/сеткой по времени, боксам и
  мойщикам;
- статусы показывать компактными badges;
- основные действия размещать в toolbar: дата, станция, фильтры, создание
  смены, блокировка, обновление;
- на мобильном клиентский booking flow должен быть пошаговым, manager view
  допускает горизонтальный скролл расписания.

## 5. Backend API, на который опирается frontend

Уже есть:

- `GET /api/auth/csrf/`
- `POST /api/auth/login/`
- `POST /api/auth/logout/`
- `GET /api/auth/me/`
- `GET /api/cars/brands/`
- `GET /api/cars/models/`
- `GET /api/cars/types/`
- `GET /api/customers/me/`
- `GET /api/customers/cars/`
- `GET /api/personal/stations/`
- `GET /api/car-wash/wash-types/`
- `GET /api/car-wash/availability/`
- `GET|POST /api/car-wash/bookings/`
- `PATCH /api/car-wash/bookings/{id}/cancel/`
- `PATCH /api/car-wash/bookings/{id}/reschedule/`
- `PATCH /api/car-wash/bookings/{id}/status/`
- `GET /api/manager/schedule/`
- `GET /api/manager/bookings/`
- `PATCH /api/manager/bookings/{id}/assign/`
- `PATCH /api/manager/bookings/{id}/status/`
- `GET|POST /api/manager/shifts/`
- `GET|POST /api/manager/resource-blocks/`
Оставшиеся backend-доработки для полноценной SPA:

- единый формат ошибок для форм: field errors + general detail.
- при отдельном домене frontend добавить CORS и CSRF trusted origins; при
  same-origin деплое этого можно избежать.

## 6. Роли и маршруты

Публичные:

- `/login` - вход.
- `/health` или `/status` во frontend необязателен; backend healthcheck уже
  есть на `/health/`.

Клиент:

- `/book` - пошаговая запись.
- `/book/confirm` - подтверждение выбранного слота и цены.
- `/my/bookings` - мои записи.
- `/my/bookings/:id` - детали, отмена, перенос.

Руководитель:

- `/manager/schedule` - дневное расписание станции.
- `/manager/bookings` - список записей с фильтрами.
- `/manager/bookings/:id` - детали и действия.
- `/manager/shifts` - смены мойщиков.
- `/manager/resource-blocks` - блокировки ресурсов.

Доступ:

- `customer` видит только клиентские маршруты и свои записи.
- `manager` видит manager routes.
- `admin` видит manager routes; Django admin остается отдельным инструментом.
- Неавторизованный пользователь перенаправляется на `/login`.

## 7. Этапы разработки

### Этап 1. Frontend scaffold

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

### Этап 2. API client и auth shell

Задачи:

- Добавить `api/client.ts` с base URL, JSON handling и CSRF.
- Добавить query keys для TanStack Query.
- Реализовать auth state через `GET /api/auth/me/`.
- Реализовать login/logout flow.
- Добавить route guards по ролям.

Backend prerequisites:

- auth endpoints и dictionary endpoints из раздела 5 уже добавлены и покрыты
  backend tests;
- для separate frontend host настроить CORS и CSRF trusted origins.

Критерии готовности:

- пользователь входит и выходит;
- после reload роль восстанавливается через `/api/auth/me/`;
- customer не попадает в manager routes.

### Этап 3. Справочники и форма записи клиента

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

### Этап 4. Личный кабинет клиента

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

### Этап 5. Кабинет руководителя: расписание дня

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

### Этап 6. Кабинет руководителя: записи, смены, блокировки

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

### Этап 7. E2E smoke tests

Задачи:

- Настроить Playwright.
- Поднимать backend с demo data для e2e.
- Проверить smoke-сценарии:
  - customer login;
  - создание записи;
  - просмотр моих записей;
  - manager login;
  - открытие расписания;
  - смена статуса или создание блокировки.

Критерии готовности:

- e2e tests запускаются локально;
- CI может запускать e2e хотя бы вручную или по отдельному workflow.

### Этап 8. Production build и деплой

Задачи:

- Добавить `VITE_API_BASE_URL`.
- Для same-origin режима использовать пустой base URL и относительные `/api/`.
- Для separate frontend host настроить CORS/CSRF на backend.
- Добавить frontend build artifact в CI.
- Расширить CD: деплоить backend и frontend assets.

Критерии готовности:

- `npm run build` создает production assets;
- frontend может работать с backend на same-origin;
- deployment secrets документированы;
- `/health/` backend остается доступным для мониторинга.

## 8. Минимальный набор компонентов

- `AppShell` - общий layout с навигацией и user menu.
- `ProtectedRoute` - guard по auth/role.
- `Button`, `IconButton`, `Input`, `Select`, `DatePicker`, `Modal`.
- `StatusBadge` - визуализация статусов booking.
- `Money` и `DateTime` formatters.
- `BookingSummary` - единый summary для клиента и manager.
- `ScheduleGrid` - сетка расписания по боксам.
- `AssignmentModal` - выбор бокса и мойщиков.
- `ResourceBlockForm` - блокировка станции/бокса/мойщика.

## 9. API types

На первом этапе типы можно описать вручную в `src/api/types.ts`.

Ключевые типы:

- `UserRole = "customer" | "manager" | "admin"`.
- `CurrentUser`.
- `Station`, `WashBox`, `Washer`, `WasherShift`.
- `CarType`, `CustomerCar`, `WashType`.
- `AvailabilitySlot`.
- `Booking`, `BookingStatus`, `BookingAssignment`.
- `ResourceBlock`.
- `ManagerScheduleDay`.

После появления OpenAPI лучше генерировать типы автоматически.

## 10. Риски и решения

### Нет JSON auth endpoints

Риск: SPA не сможет нормально управлять session auth.

Решение: `/api/auth/me/`, login, logout и csrf endpoint уже добавлены.
Frontend должен вызывать `/api/auth/csrf/` перед unsafe methods и использовать
session cookies.

### Разные форматы API

Риск: часть DRF настроена на JSON:API, а MVP endpoints отдают обычный JSON.

Решение: во frontend API client зафиксировать текущий regular JSON contract и
не смешивать его с JSON:API abstractions.

### Manager schedule может стать тяжелым

Риск: расписание дня со временем станет большим и медленным.

Решение: кешировать по ключу `station + date`, делать query invalidation после
точечных действий, позже добавить polling или websocket только при реальной
потребности.

### Мобильный manager UI сложен

Риск: сетка расписания плохо помещается на маленьком экране.

Решение: для manager routes поддержать горизонтальный скролл и compact mode, а
основной мобильный UX оптимизировать под клиента.

## 11. Что не входит в frontend MVP

- Онлайн-оплата.
- Push/SMS notifications.
- Drag-and-drop оптимизация расписания.
- Графики выручки и зарплат.
- Offline mode.
- Полная замена Django admin для всех справочников.

Эти части стоит добавлять после стабильного customer booking flow и
manager schedule.
