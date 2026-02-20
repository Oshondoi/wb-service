# System Patterns

Architecture:
- Node.js + Express main server file (`fin-report.js`) loaded by `index.js`
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

Design Patterns:
- Fallback chaining for external data
- Safe getters (`safeGet`) for CSV formatting
- Summarization of stocks to collect `warehouses` and `stocksQty`
- Category extraction from API `entity` field (auto-capitalized for display)
- **Hybrid Auth**: Supabase Auth (email/password, JWT token) + legacy accounts by username
- **Auth via httpOnly cookies** (token = account.id or JWT) for serverless compatibility
- **Password hashing** with SHA256 + salt (pbkdf2, 1000 iterations)
- **Business ownership verification**: API checks that business belongs to current account

Database Patterns:
- Supabase schema managed via `supabase-schema.sql`
- CRUD operations via Supabase client (async/await)
- CASCADE DELETE on accounts → businesses
- Indexes on `account_id` and `is_active` for performance

Critical Paths:
- `/api/login`: POST endpoint authenticates via Supabase (email) or legacy username, returns token
- `/api/register`: POST endpoint creates Supabase user and local account
- `/api/businesses`: GET/POST for listing and creating companies
- `/api/businesses/:id`: PUT/DELETE for updating and removing companies
- `/api/wb-finance`: GET financial data for specific business (via `businessId` param)
- `/api/wb-stocks`: GET WB stocks by API keys (multi-company, supports filtering by businessIds)
- `/api/cash/transactions`: cashflow CRUD (income/expense)
- `/api/cash/debts`: debts CRUD
- `/api/cash/transactions/bulk`: bulk delete cashflow operations
- `/api/cash/debts/bulk`: bulk delete debt records
- `/wb-price-csv`: minimal, fast, public; returns `price,name`
- `/wb-max`: rich JSON with seller info, stocks, rating, images (requires auth)
- `/`: Cashflow (ДДС) main page
- `/fin-report`: Financial dashboard with business selector and management UI
- `/shipments`: Пошаговые отгрузки (источник → поставка → склад в поставке → короб → скан)
- `/shipments-2`: Альтернативный (сравнительный) интерфейс списка поставок на тех же сущностях FBO
- `/auth`: Unified login + registration page

Cashflow UX Patterns:
- В ДДС «Создать новый…» сначала сохраняет в памяти, запись в БД — только после «Добавить»
- Перед сохранением операции/долга показывается модалка подтверждения
- Редактирование операций/долгов выполняется через модалки с сохранением по кнопке
- В «Записях долгов» поддерживаются комбинированные фильтры (тип + контрагент + магазин) и экспорт в Excel
- Для dropdown-меню фильтров использовать безопасную привязку обработчиков (`data-*` + `addEventListener`), избегая сложных inline `onclick`

Navigation UX Patterns:
- Основная навигация вынесена в левый вертикальный сайдбар
- Сайдбар включает отдельный пункт «Отгрузки» (`/shipments`)
- Сайдбар включает пункт сравнения интерфейса отгрузок (`/shipments-2`)
- Пункты меню используют SVG-иконки и подписи; выход в подвале меню с красным hover и красной иконкой
- Настройки профиля открываются из верхней иконки сайдбара через единый обработчик `openProfileModal()`
- Используется единая реализация профиля: `renderProfileModal()` + `renderProfileScript()` на всех страницах
- В профиле `login` и `name` — отдельные поля с разным назначением (логин аккаунта ≠ отображаемое имя)
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
