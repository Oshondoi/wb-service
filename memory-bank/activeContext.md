# Active Context

Last Session Completed (Dec 7, 2025 - Late Evening):
- ✅ SQLite database architecture implemented
- ✅ Multi-company support (accounts → businesses hierarchy)
- ✅ CASCADE DELETE on account removal
- ✅ Database migration from file-based API keys
- ✅ New authentication system via DB
- ✅ Business management UI with modal
- ✅ Company selector in fin-report
- ✅ All API endpoints updated for multi-company
- ✅ Product cost management feature added
- ✅ New table: product_costs with CASCADE DELETE

Current Focus:
- Database-driven multi-company architecture fully operational
- Cost management per business (product costs stored in DB)
- Users can track product costs (себестоимость) for each company
- Cost data auto-loads from saved values when opening modal
- Each company has independent cost tracking

Recent Changes (Dec 7, 2025 - Late Evening):

**✅ COMPLETED - PRODUCT COST MANAGEMENT (СЕБЕСТОИМОСТЬ):**
- **NEW BUTTON**: "💰 Себестоимость" button added after "📦 Заказы" button
- **NEW MODAL**: Dedicated modal for product cost management
- **NEW DB TABLE**: `product_costs` (business_id, nm_id, subject, brand, cost)
- **CASCADE DELETE**: Removing business deletes all its product costs
- **DATABASE FUNCTIONS**:
  - `upsertProductCost()` - save/update single product cost
  - `bulkUpsertProductCosts()` - batch save multiple costs
  - `getProductCostsByBusiness()` - load all costs for a business
  - `getProductCost()` - get cost for specific product
  - `deleteProductCost()` - remove product cost
- **API ENDPOINTS**:
  - GET `/api/product-costs/:businessId` - list all costs
  - POST `/api/product-costs/:businessId/bulk` - bulk save costs
  - GET `/api/product-costs/:businessId/:nmId` - get single cost
  - DELETE `/api/product-costs/:businessId/:nmId` - delete cost
- **UI FEATURES**:
  - Modal with fixed size (max-width: 1000px, max-height: 80vh)
  - Internal scrolling for large datasets
  - "🚀 Запустить загрузку" button to fetch products from WB API
  - Products auto-load from sales data (via `/api/wb-sales-grouped`)
  - "💾 Сохранить" button to persist costs to database
  - 4 columns: Артикул WB, Предмет, Бренд, Себестоимость (₽)
  - Manual cost input per product (number input field)
  - Auto-load saved costs when opening modal
  - Costs persist across sessions per business
- **DATA FLOW**:
  - Modal uses parent's `currentBusinessId` for API calls
  - No API key stored in modal itself
  - Fetches product list via sales endpoint
  - Merges saved costs from DB with fresh product data
  - Each business has independent cost tracking

**✅ COMPLETED - DATABASE & MULTI-COMPANY ARCHITECTURE:**
- **DATABASE**: SQLite with `better-sqlite3` package
- **TABLES**: 
  - `accounts` (id, username, password_hash, email, timestamps)
  - `businesses` (id, account_id, company_name, wb_api_key, description, is_active, timestamps)
- **RELATIONS**: CASCADE DELETE on account removal (deletes all businesses)
- **SECURITY**: Password hashing with SHA256 + salt (pbkdf2)
- **MIGRATION**: Auto-migration from `wb-api-key.txt` to database on first run
- **DEFAULT ACCOUNT**: Created automatically: admin / tarelkastakan

**✅ COMPLETED - AUTHENTICATION SYSTEM:**
- **OLD SYSTEM REMOVED**: Static ADMIN_LOGIN/ADMIN_PASSWORD constants deleted
- **NEW SYSTEM**: Database-driven authentication via `database.js` module
- **LOGIN**: POST `/api/login` returns account ID as token (stored in httpOnly cookie)
- **MIDDLEWARE**: `requireAuth` checks cookie token and loads account from DB
- **SESSION**: Account object attached to `req.account` on each request

**✅ COMPLETED - BUSINESS MANAGEMENT UI:**
- **OLD MODAL REMOVED**: "Добавить API ключ" button and modal deleted
- **NEW UI**: "🏢 Управление компаниями" button opens business manager modal
- **FEATURES**:
  - List all companies with status badges (active/inactive)
  - Add new company with form (name, API key, description)
  - Toggle active/inactive status per company
  - Delete company with confirmation
  - Company selector dropdown in header
  - Auto-load first active company on page load

**✅ COMPLETED - FINANCIAL REPORTS WITH MULTI-COMPANY:**
- **PAGE**: `/fin-report` - financial dashboard per selected company
- **API ENDPOINTS UPDATED**:
  - `/api/wb-finance?businessId=X` - financial data for specific company
  - `/api/wb-sales?businessId=X` - sales for specific company
  - `/api/wb-orders?businessId=X` - orders for specific company
  - `/api/wb-sales-grouped?businessId=X` - grouped sales
  - `/api/wb-fin-report?businessId=X` - full WB financial report (82 columns)
- **BUSINESS APIS**:
  - GET `/api/businesses` - list all companies of current account
  - POST `/api/businesses` - create new company
  - PUT `/api/businesses/:id` - update company (name, key, status)
  - DELETE `/api/businesses/:id` - delete company
  - GET `/api/businesses/default` - get first active company
- **REPORT TYPES**: 
  - 📈 Financial Report (82 columns - full WB report structure)
  - 💰 Sales Report (10 columns - grouped by unique articles)
- **UI FEATURES**:
  - Company selector with auto-switch
  - Business manager modal with CRUD operations
  - All load functions check `currentBusinessId` before API calls
  - Date range selector (custom periods)
  - Toggle buttons for report types
  - 5 dashboard cards (revenue, commission, logistics, profits)
  - Dynamic table headers (82 vs 10 columns)
  - Sticky header on scroll

Recent Changes (Dec 2, 2025):

**LATEST UPDATE - AUTH FIX FOR VERCEL:**
- **CRITICAL FIX**: Авторизация через httpOnly cookies (работает на serverless)
- **PACKAGE**: Добавлен `cookie-parser` для работы с cookies
- **LOGIN FLOW**: POST /api/login устанавливает cookie с base64 токеном
- **MIDDLEWARE**: requireAuth проверяет cookie (приоритет) и Authorization header (fallback)
- **SECURITY**: httpOnly=true, secure в production, sameSite=lax, maxAge=24h
- **TESTED LOCALLY**: ✅ Все тесты прошли перед деплоем
- **RESULT**: Стабильная авторизация на Vercel без проблем с сессиями

**UPDATE - CATEGORY PARSING FROM API:**
- **CRITICAL CHANGE**: Категории теперь парсятся из поля `product.entity` (API v2)
- **DATA SOURCE**: Поле `entity` содержит название категории на русском языке
- **REMOVED**: Удалён статичный маппинг `subjectId → название` (40+ строк кода)
- **EXAMPLES**: "кроссовки" → "Кроссовки", "юбки" → "Юбки", "зонты пляжные" → "Зонты пляжные"
- **FORMATTING**: Первая буква автоматически становится заглавной для красоты
- **BENEFIT**: Автоматическое покрытие ВСЕХ категорий WB без ручного маппинга
- **PERFORMANCE**: Нулевые накладные расходы, данные уже в API
- **CSV**: Обновлены оба endpoint (/wb-max и /wb-max-csv)

**LATEST UPDATE - SIMPLIFIED SELLER DATA:**
- **DECISION**: Отключен парсинг юридических лиц (WB блокирует все методы)
- **CURRENT STATE**: Показываем только sellerId + storeName (торговое название из API)
- **TWO COLUMNS**: 
  1. `Продавец (ID)` - показывает только ID продавца (например "ID: 1399211")
  2. `Магазин` - торговое название из `product.supplier` (например "Мариям")
- **REASON**: Wildberries блокирует парсинг (код 498, капча, анти-бот защита)
- **FUTURE**: Для полных юрлиц требуется Puppeteer/Selenium на отдельном VPS
- **DATABASE**: `sellers-db.json` оставлен для справки но не используется
- **PERFORMANCE**: Быстрая загрузка ~1-3 сек без попыток парсинга

Previous Changes:
- **NEW FEATURE**: Добавлены колонки "Категория" и "Цвет" между Продавцом и Ценой
- **DATA SOURCE**: Категория извлекается из `product.subjectId` с маппингом на названия (40+ категорий)
- **DATA SOURCE**: Цвет извлекается из `product.colors[0].name` (берем ПЕРВЫЙ цвет - основной для данного артикула)
- **FIX**: Цвет теперь показывает только один цвет товара, а не все через запятую
- **MAPPING**: Расширенный маппинг категорий: одежда, обувь, электроника, дом, красота, детям, авто
- **MAJOR CHANGE**: Убрано ограничение на ИП - теперь показываем ВСЕХ продавцов
- **UI CHANGE**: Колонка "Продавец (ID)" показывает: `Название продавца (ID продавца)`
- **SIMPLIFICATION**: Убрано поле `sellerName` - теперь используется только `storeName` из `product.supplier`
- **SIMPLIFICATION**: Удалена проверка на ИП перед парсингом - берём название из API для всех
- **DATABASE**: В базе 3 продавца (KOTON, QUATRO, АНТАРЕС) - легко расширяется
- **CSV UPDATE**: Обновлён формат CSV - добавлены `category` и `color`, убрана `sellerName`
- **CRITICAL FIX**: Удалён медленный `fetchStoreNameFromProductPage` который делал 3+ HTTP-запроса
- **CRITICAL FIX**: Упрощён `extractPrice` - убраны дублирующиеся проверки, оставлены только рабочие поля
- **CRITICAL FIX**: Удалено дублирование функции `summarizeStocks` (была определена дважды)
- **CRITICAL FIX**: Добавлены недостающие функции `safeGet` и `currencyByDomain` в wb-max-csv
- **UI FIX**: Исправлена проверка цены - теперь `price !== null && price > 0` вместо `typeof price === 'number'`
- **UI FIX**: Исправлены индексы innerHTML - правильно отображаются фото, склады и статус
- **UI FIX**: Товары без остатков показывают "нет в наличии" вместо "0.00"
- **CRITICAL FIX**: Название магазина берётся из `product.supplier` в API v2 (не требует парсинга!)
- Результат: загрузка **~2-8 сек** (с учетом парсинга), показываем полные юрлица или краткие названия
- UI: артикул — ссылка на KG
- UI: колонка `Склады` показывает `Название — N шт`, модель FBO/FBS

Next Steps:
- Добавить кэширование часто запрашиваемых товаров (опционально)
- Расширять словарь `wh → название` по наблюдениям

Decisions:
- Сохранять `/wb-price-csv` публичным и минимальным.
- HTML парсинг имени продавца использовать только для JSON/UI, не утяжеляя CSV.
- В UI поддерживать простоту чтения через раздельные колонки.
- Данные по складам считаются из публичного `sizes[].stocks` (агрегация по `wh`).
- Для аналитики конкурентов используем только публичные данные WB (без приватных ключей).

Preferences:
- Minimal public endpoints; robust fallbacks; readable UI.

Learnings:
- Wildberries APIs can vary; layered fallbacks are essential.
- Sheets `IMPORTDATA` returns headers+data; use `INDEX` to select cells.
