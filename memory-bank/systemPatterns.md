# System Patterns

Architecture:
- Node.js + Express modular runtime: `index.js` -> `src/server.js` -> `src/app.js`
- **Supabase PostgreSQL** (через `database.js` + `supabase-client.js`)
- Database-driven authentication with password hashing
- Multi-company support (one account → many businesses)
- Session-based auth protects UI and rich endpoints
- Public CSV/plain endpoints for Sheets

Key Decisions:
- Multi-source data pipeline: v2 → v1 → basket CDN → HTML
- **WB card API switched to v4** (v2/v1 now unreliable)
- Price extraction prioritizes smallest positive price across candidate fields
- Image proxy endpoint `/wb-image` with cascade of CDN URLs
- `/wb-image` now перебирает basket‑хосты (01–40) и кэширует найденный домен
- **Database-first approach**: All users and API keys stored in SQLite
- **CASCADE DELETE**: Removing account deletes all its businesses
- **Auto-migration**: First run migrates old `wb-api-key.txt` to database
- **FBO ownership**: если действует сотрудник, owner данных — аккаунт владельца (через account_members scope)
- **FBO hierarchy**: `fbo_batches` (партия, parent) → `fbo_shipments` (child)
- **Profile login immutable**: логин аккаунта не редактируется в профиле (readonly UI + API не обновляет username)
- **Debt Excel export**: используется настоящий `.xlsx` (через библиотеку `xlsx` на backend), а не HTML под видом `.xls`
- **FBO system warehouses policy**: системные склады имеют фиксированный набор имён; их нельзя вручную создать с системным именем и нельзя удалить
- **Shipments-2 warehouse rendering**: отображение склада в `/shipments-2` всегда в едином EN/RU-формате (без пользовательского toggle)

Design Patterns:
- Fallback chaining for external data
- Safe getters (`safeGet`) for CSV formatting
- Summarization of stocks to collect `warehouses` and `stocksQty`
- Category extraction from API `entity` field (auto-capitalized for display)
- **Hybrid Auth**: Supabase Auth (email/password, JWT token) + legacy accounts by username
- **Auth via httpOnly cookies** (token = account.id or JWT) for serverless compatibility
- **Password hashing** with SHA256 + salt (pbkdf2, 1000 iterations)
- **Password recovery flow**: запуск из модалки профиля -> email reset link -> `/auth?mode=recovery` -> установка нового пароля
- **Business ownership verification**: API checks that business belongs to current account

Database Patterns:
- Supabase schema managed via `supabase-schema.sql`
- CRUD operations via Supabase client (async/await)
- CASCADE DELETE on accounts → businesses
- Indexes on `account_id` and `is_active` for performance

Critical Paths:
- `/api/login`: POST endpoint authenticates via Supabase (email) or legacy username, returns token
- `/api/register`: POST endpoint creates Supabase user and local account
- `/api/profile/reset-password`: отправка recovery email из модалки профиля (requires auth)
- `/api/auth/reset-password-confirm`: установка нового пароля по recovery-токену (public)
- `/api/businesses`: GET/POST for listing and creating companies
- `/api/businesses/:id`: PUT/DELETE for updating and removing companies
- `/api/wb-finance`: GET financial data for specific business (via `businessId` param)
- `/api/wb-stocks`: GET WB stocks by API keys (multi-company, supports filtering by businessIds)
- `/api/cash/transactions`: cashflow CRUD (income/expense)
- `/api/cash/debts`: debts CRUD
- `/api/cash/transactions/bulk`: bulk delete cashflow operations
- `/api/cash/debts/bulk`: bulk delete debt records
- `/api/cash/debts/export-xlsx`: формирование и отдача настоящего XLSX-файла по выбранным записям долгов
- `/wb-price-csv`: minimal, fast, public; returns `price,name`
- `/wb-max`: rich JSON with seller info, stocks, rating, images (requires auth)
- `/`: Cashflow (ДДС) main page
- `/fin-report`: Financial dashboard with business selector and management UI
- `/shipments`: Пошаговые отгрузки (источник → поставка → склад в поставке → короб → скан)
- `/shipments-2`: Альтернативный (сравнительный) интерфейс списка поставок на тех же сущностях FBO
- `/api/fbo/batches`: CRUD-минимум для партий (список/создание)
- `/api/fbo/shipments`: список/создание поставок с `batch_id` и owner-scope
- `/api/fbo/warehouses`: список/создание/удаление складов с защитой системного набора и автодозаполнением системных складов на аккаунт
- `/auth`: Unified login + registration page

Shipments-2 UX Patterns:
- Цветовая индикация статусов поставок в таблице: `draft` (жёлтый), `done` (зелёный), `canceled` (красный)
- Порядок колонок в списке поставок: чекбокс → дата → название → партия → склад → короба → товар → статус → автор → действия
- Размерные метрики `/shipments-2` должны совпадать с главной страницей для визуальной консистентности (чекбокс-колонка 32px, нативный checkbox-size, компактные тулбар-кнопки)
- В тулбаре `/shipments-2` поддерживаются быстрые действия создания сущностей (в т.ч. кнопка «Создать партию»)
- Для inline-скриптов `/shipments-2` критично корректное экранирование спецсимволов (`\\n`) в JS-строках, иначе рендер страницы падает с `Invalid or unexpected token`

Cashflow UX Patterns:
- В ДДС «Создать новый…» сначала сохраняет в памяти, запись в БД — только после «Добавить»
- Перед сохранением операции/долга показывается модалка подтверждения
- Редактирование операций/долгов выполняется через модалки с сохранением по кнопке
- В «Записях долгов» поддерживаются комбинированные фильтры (тип + контрагент + магазин) и экспорт в Excel
- Экспорт «Записей долгов» должен оставаться в формате `.xlsx` без браузерного HTML-экспорта, чтобы избежать предупреждений Excel о формате файла
- Для dropdown-меню фильтров использовать безопасную привязку обработчиков (`data-*` + `addEventListener`), избегая сложных inline `onclick`
- В `Долги -> Список контрагентов` колонка «Магазин» показывается в основной таблице в позиции между «Прогресс» и «Всего»
- В `Долги -> Записи` колонка «Создана» должна быть между «Комментарий» и «Действия», формат даты/времени синхронизирован с разделом `Движение`

Navigation UX Patterns:
- Основная навигация вынесена в левый вертикальный сайдбар
- Сайдбар включает отдельный пункт «Отгрузки» (`/shipments`)
- Сайдбар включает пункт сравнения интерфейса отгрузок (`/shipments-2`)
- Пункты меню используют SVG-иконки и подписи; выход в подвале меню с красным hover и красной иконкой
- Настройки профиля открываются из верхней иконки сайдбара через единый обработчик `openProfileModal()`
- Используется единая реализация профиля: `renderProfileModal()` + `renderProfileScript()` на всех страницах
- В профиле `login` и `name` — отдельные поля с разным назначением (логин аккаунта ≠ отображаемое имя)
- В модалке профиля доступна отдельная action-кнопка сброса пароля на email
- На каждом route с профилем обязательны базовые modal-стили (`.modal`, `.modal-content`, `.modal-header`, `.close-btn`) и профильные классы (`.profile-*`), иначе блок профиля рендерится inline

Stocks (Остатки) UX Patterns:
- «Остатки» — третья вкладка ДДС с двумя подвкладками: API и «У себя на складе»
- Данные WB подтягиваются по API ключам выбранных компаний
- Итоговый остаток = на складе + в пути к клиенту + в пути от клиента
- Стоимость = итоговый остаток × себестоимость (из `product_costs`)
- Мультивыбор магазинов через dropdown в стиле фильтров долгов
- Страница `/stocks` повторяет WB-остатки отдельной таблицей с фиксированными ширинами и скрываемыми колонками деталей

Multi-Company Reporting Patterns:
- **Sales Report**: Aggregates data by `nmId + brand + company_name` when "All active companies" selected
- **Financial Report Tabs**: Groups data by `company_name`, creates clickable tabs for switching
- **Tab Switching**: Uses numeric index instead of company names to avoid quote escaping in onclick
- **Sortable Columns**: Global state management (`salesSortState`) tracks sort column/direction
- **Default Sort**: Company name alphabetically for better organization
- **Data Flow**: `loadFromAllBusinesses()` → parallel API calls → adds `company_name` to each item → callback
