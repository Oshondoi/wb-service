# Active Context

## Latest Session (Jan 19, 2026) - ✅ ФИНАНСОВЫЙ ОТЧЕТ КАК НА WB:

**🎯 CURRENT FOCUS**: Полная структура финансового отчета как на сайте WB - 71 колонка с переносом слов и выравниванием

### Что было сделано:

**1. FULL FINANCIAL REPORT STRUCTURE - 71 колонка как на WB!**:
- **Проблема**: Таблица не соответствовала структуре WB - было 38 колонок, нужно 71
- **Исследование**: 
  - Проанализированы скриншоты с сайта WB Partners
  - Изучена Google таблица (Excel экспорт) - 85 колонок
  - **Решение**: Использовать структуру САЙТА WB (71 колонка), не Excel (пользователи привыкли к сайту)
- **Реализация**:
  - Переделаны заголовки таблицы (~71 <th> тег)
  - Обновлена функция `renderFinReportData()` - теперь выводит все 71 колонку
  - Colspan изменён с 38 на 71
- **Колонки включают**: №, Номер поставки, Предмет, Код номенклатуры, Бренд, Артикул, Название, Размер, Баркод, Тип документа, Обоснование для оплаты, Даты, Количество, Цены, Скидки (СПП, промокод, итоговая), кВВ (размеры, проценты), Возмещения, Эквайринг, НДС, К перечислению, Логистика, Штрафы, Хранение, Технические данные (ШК, Srid, КИЗ, короба, партнеры, склады)
- **Код изменён**: 
  - index.js lines 1451-1530 - полная структура заголовков
  - index.js lines 3291-3368 - функция renderFinReportData() с 71 колонкой
- **Результат**: ✅ **Точная копия структуры WB сайта**

**2. WORD WRAP IN HEADERS - Перенос слов в заголовках**:
- **Проблема**: Колонки были слишком широкие из-за `white-space:nowrap`
- **Решение**: 
  - Убран `white-space:nowrap` из всех заголовков
  - Добавлен `word-wrap:break-word`
  - Установлены `min-width` и `max-width` для каждой колонки (от 40px до 190px)
- **Код изменён**:
  - index.js lines 1451-1530 - все 71 заголовок обновлены
- **Результат**: ✅ Компактные колонки с переносом текста как на WB

**3. TEXT ALIGNMENT - Выравнивание заголовков**:
- **Задача**: Все заголовки должны быть выровнены по левому краю
- **Решение**: 
  - Массовая замена `text-align:right` и `text-align:center` на `text-align:left`
  - Применено ко ВСЕМ заголовкам таблиц (финансовый отчет, продажи, заказы)
- **Команда**: PowerShell regex replace на весь index.js
- **Результат**: ✅ Все заголовки выровнены слева

**PREVIOUS SESSION - FULL HISTORY SYNC + DATE FILTERS**:

**4. FULL HISTORY SYNC - Загрузка за всё время!**:
- **Проблема**: Система загружала только последние 90 дней, хотя WB API может отдать всю историю
- **Исследование**: 
  - `/api/v1/supplier/sales` и `/orders` - лимит 90 дней
  - `/api/v5/supplier/reportDetailByPeriod` - **БЕЗ лимитов!** Можно запросить за всё время!
- **Решение**:
  - Добавлена функция `getFullDateRange()` - загружает с 2019 года (начало статистики WB)
  - Изменён `syncFinancialReport()` - теперь использует `getFullDateRange()` вместо `getMaxDateRange()`
  - Sales и Orders остались с лимитом 90 дней (ограничение WB API)
- **Код изменён**: 
  - sync-service.js ~line 57 - добавлена `getFullDateRange()`
  - sync-service.js ~line 252 - `syncFinancialReport()` использует полный период
- **Результат**: ✅ **Загружено 4041 запись для магазина 1 и 5338 для магазина 2 - ВСЯ история!**

**5. TIMEZONE FIX - Время синхронизации по Бишкеку**:
- **Проблема**: Cron был настроен на 3:30 МСК, нужно было 3:30 по Бишкеку (= 00:30 МСК)
- **Решение**: 
  - Изменён cron с `'30 3 * * *'` на `'30 0 * * *'`
  - Обновлены все сообщения: "3:30 утра (Бишкек)"
- **Код изменён**:
  - index.js ~line 3604 - изменено расписание cron
  - index.js ~line 3617 - обновлено консольное сообщение
  - index.js ~line 3712 - обновлено сообщение о следующей синхронизации
- **Результат**: ✅ Автосинхронизация теперь в 3:30 утра по Бишкеку (00:30 МСК)

**6. DATE FILTER AUTO-RELOAD**:
- При нажатии "Применить" в календаре автоматически загружаются данные
- `applyDateRange()` ~line 2585 - добавлен вызов `loadFinancialData()`

**7. LOCALSTORAGE FOR DATE RANGE**:
- Период сохраняется в localStorage при применении
- При загрузке страницы восстанавливается сохраненный период
- `applyDateRange()` ~line 2586-2587 - сохранение в localStorage
- `DOMContentLoaded` ~line 2612-2628 - восстановление из localStorage

**8. QUICK RANGE BUTTONS FIX**:
- Кнопки Неделя/Месяц/Квартал/Год теперь сразу применяют период и загружают данные
- `selectQuickRange()` ~line 2521 - автовызов `applyDateRange()`
- Конечная дата = сегодня, чтобы грузить строго выбранный период

**STATUS**: ✅ Система полностью работает! 
- Финансовый отчет точная копия WB сайта (71 колонка)
- ВСЯ история WB загружена для всех магазинов
- При создании нового магазина автоматически загрузится вся история (не только 90 дней)
- Автосинхронизация в 3:30 утра (Бишкек) каждый день
- Все фильтры периода работают и сохраняются в localStorage

---

## Previous Session (Jan 17, 2026) - ✅ DATABASE VALIDATION & LOCALSTORAGE:

**🎯 CURRENT FOCUS**: Валидация колонок финансового отчёта + Добавление памяти выбора магазина

### Что было сделано:

**1. COLUMN VALIDATION (Financial Reports)**:
- Проверка соответствия схемы БД (supabase-schema.sql) с данными WB API
- **Результат**: Схема полностью соответствует! 65 колонок данных в wb_financial_reports
- Удалены 14 лишних колонок из отображения таблицы:
  - dlv_prc, fix_tariff_date_from, fix_tariff_date_to
  - acquiring_percent, payment_processing, srv_dbs
  - assembly_id, is_legal_entity, trbx_id
  - installment_cofinancing_amount, wibes_wb_discount_percent
  - cashback_amount, cashback_discount, cashback_commission_change
- Добавлена недостающая колонка `rid` в отображение
- Обновлён комментарий в supabase-schema.sql: "65 колонок данных + 3 системных" (было "82 колонки")
- **Теперь**: Таблица отображает ровно 69 колонок (точное соответствие с БД)

**2. LOCALSTORAGE FOR SELECTED BUSINESS**:
- При выборе магазина из dropdown → сохранение в `localStorage.setItem('selectedBusinessId', id)`
- При загрузке страницы → восстановление из `localStorage.getItem('selectedBusinessId')`
- Автоматическая загрузка данных для восстановленного магазина
- **Функции изменены**:
  - `loadBusinesses()` — восстанавливает сохранённый магазин перед вызовом updateBusinessSelector()
  - `switchBusiness()` — сохраняет выбранный магазин в localStorage
- **Результат**: Пользователь не теряет выбор магазина при обновлении страницы

**3. CODE CHANGES**:
- index.js ~line 1800: loadBusinesses() восстанавливает selectedBusinessId из localStorage
- index.js ~line 1989: switchBusiness() сохраняет выбор в localStorage
- index.js ~line 3280: удалены лишние колонки из renderFinReportData()
- supabase-schema.sql line 115: исправлен комментарий "65 колонок данных"

**STATUS**: ✅ Сервер запущен, изменения применены, localStorage работает

---

## Previous Session (Jan 14, 2026) - ✅ SUPABASE MIGRATION COMPLETE:

**🎯 MAJOR ACHIEVEMENT**: Полная миграция на Supabase PostgreSQL с автоматической синхронизацией данных WB

### Что было сделано:

**1. MIGRATION TO SUPABASE**:
- Создана схема из 7 таблиц в Supabase PostgreSQL (supabase-schema.sql)
- Полностью переписан database.js: все функции async/await вместо синхронных SQLite
- Установлены зависимости: @supabase/supabase-js, node-cron, dotenv
- Настроен .env с Supabase URL и Service Role Key
- Создан supabase-client.js для инициализации подключения

**2. AUTO-SYNC SYSTEM (sync-service.js)**:
- Cron job: каждый день в 3:30 AM (МСК) запускает `syncAllBusinesses()`
- Функции синхронизации:
  - `syncSales(businessId, wbApiKey)` — загрузка продаж за 90 дней
  - `syncOrders(businessId, wbApiKey)` — загрузка заказов за 90 дней
  - `syncFinancialReport(businessId, wbApiKey)` — загрузка полного фин. отчёта (82 колонки)
  - `syncAllData(businessId, wbApiKey)` — запуск всех трёх синхронизаций
  - `syncAllBusinesses()` — синхронизация всех активных магазинов
- Batch insert по 500 записей для производительности
- Логирование в sync_logs (статус, кол-во записей, ошибки, время)

**3. NEW STORE AUTO-SYNC**:
- При создании магазина через POST `/api/businesses`:
  - Магазин создаётся в Supabase
  - Автоматически запускается `syncService.syncAllData()` в фоне
  - Не блокирует ответ пользователю
  - Данные за 90 дней загружаются в фоновом режиме
  - После завершения доступны во всех отчётах

**4. API ENDPOINTS REFACTORED**:
- `/api/wb-finance` → теперь читает из `db.getSalesFromCache(business_id, dateFrom, dateTo)`
- `/api/wb-sales` → читает из Supabase wb_sales (фильтр по sale_id)
- `/api/wb-orders` → читает из Supabase wb_orders
- `/api/wb-fin-report` → читает из Supabase wb_financial_reports
- Все endpoint'ы теперь **НЕ обращаются к WB API напрямую**
- Быстрые запросы, нет лимитов, работа с кэшированными данными

**5. MANUAL SYNC**:
- Добавлены endpoints:
  - POST `/api/sync/:businessId` — ручной запуск синхронизации
  - GET `/api/sync-status/:businessId` — статус последней синхронизации
- Кнопка "🔄 Ручное обновление" в интерфейсе
- Загружает данные за 90 дней, **исключая сегодня**

**6. BUGS FIXED**:
- Boolean comparison: `is_active === true || is_active === 1` для совместимости PostgreSQL/SQLite
- getBusinessById/getDefaultBusiness: добавлен await (теперь async)
- database.js: все функции с Supabase async (getSalesFromCache, getOrdersFromCache, getFinancialReportFromCache)

**7. FILES STRUCTURE**:
```
.env — Supabase credentials
supabase-client.js — клиент Supabase
sync-service.js — сервис синхронизации (432 строки)
supabase-schema.sql — SQL схема (7 таблиц)
database.js — полностью async (524 строки)
index.js — обновлены все endpoints (4153 строки)
```

**NEXT STEPS** (если понадобится):
- Тестирование полного цикла: создание магазина → авто-синхронизация → отображение данных
- Проверка cron job'а (можно подождать до 3:30 или изменить время для теста)
- Мониторинг логов синхронизации в таблице sync_logs

---

## Previous Session (Jan 13, 2026) - ✅ ROUTING RESTRUCTURE:
- **Major Change**: Финансовый отчет теперь главная страница сервиса
- **New Main Page**: `/` - финансовый отчет с управлением компаниями (ранее был `/fin-report`)
- **Products Page**: `/products` - анализ товаров MAX UI (ранее был `/`)
- **Navigation Updated**: 
  - На главной странице (`/`) добавлена кнопка "🔍 Анализ товаров" → `/products`
  - На странице `/products` кнопка "📈 Фин отчёт" заменена на "🔍 Главная" → `/`
- **Login Redirect**: После авторизации редирект на `/` (финансовый отчет)
- **Code Changes**:
  - `app.get('/')` теперь обслуживает финансовый отчет (index.js ~line 1340)
  - `app.get('/products')` обслуживает MAX UI для анализа товаров (index.js ~line 758)
  - Удалён старый маршрут `/fin-report`
- **Reason**: Финансовый отчет — основной функционал для пользователей, логично сделать его главной страницей
- **Status**: ✅ Server restarted, changes applied

Previous Session (Dec 23, 2025):
- **Issue Found**: Companies dropdown on `/fin-report` shows "Загрузка..." but doesn't populate
- **Root Cause**: `loadBusinesses()` function was defined but only called from `openBusinessManager()` modal, not on page initialization
- **Fix Applied**: Added `DOMContentLoaded` event listener before closing `</script>` tag to auto-call `loadBusinesses()` when page loads
- **Code Location**: index.js lines 2955-2962 (closing `/fin-report` route template)
- **Status**: ✅ Server restarted successfully - fix applied and ready for testing
- **Next Action**: Verify companies now load automatically in dropdown selector on page load

Last Session Completed (Dec 17, 2025 - Evening):
- ✅ New UI/UX workflow for financial reports (modal-based approach)
- ✅ Loading indicators with visual feedback (spinner + badges)
- ✅ Click outside modal to close functionality
- ✅ Data validation before opening reports
- ✅ Error handling improvements for async loading
- ✅ Button "ОБНОВИТЬ ДАННЫЕ" moved to top-right corner
- ✅ All report buttons converted to modal triggers with unique colors

Previous Session (Dec 17, 2025 - Afternoon):
- ✅ Multi-company aggregation for sales report ("Все активные компании" mode)
- ✅ Company name column added to sales report (first column)
- ✅ Sortable columns with visual indicators (↕ symbol, hover effects)
- ✅ Default sort by company name (alphabetically)
- ✅ Tabs system for financial report when multiple companies loaded
- ✅ Tab switching using numeric indices (avoids quote escaping issues)
- ✅ Default selector set to "All active companies" when multiple exist
- ✅ Improved tab design: flat style, color-coded, underline indicator

Current Focus:
- Modal-based report viewing system fully operational
- Loading state management with visual indicators
- Better UX for data fetching and error handling
- All 3 reports load in parallel when "ОБНОВИТЬ ДАННЫЕ" clicked

Recent Changes (Dec 17, 2025 - Evening):

**✅ COMPLETED - MODAL WORKFLOW & LOADING INDICATORS:**
- **NEW WORKFLOW**:
  - **"ОБНОВИТЬ ДАННЫЕ" button**: Single button loads all 3 reports at once (parallel loading)
  - **Report buttons**: Now open modals instead of switching views (📈 Фин отчёт, 💰 Продажи, 📦 Заказы)
  - **Button positioning**: "ОБНОВИТЬ ДАННЫЕ" moved to top-right corner with purple style matching other nav buttons
  - **Color-coded buttons**: Each report button has unique gradient (purple, pink, cyan)
- **LOADING INDICATORS**:
  - **Main loading block**: Shows below buttons with animated spinner during data fetch
  - **Badge indicators**: Small ⏳ badges appear on each report button while loading
  - **Progressive completion**: Each badge disappears when its report finishes loading
  - **Auto-hide**: Main loading block hides when all 3 reports complete
  - **CSS animations**: `@keyframes spin` for spinner, `@keyframes pulse` for badges
- **DATA VALIDATION**:
  - **Global flags**: `finReportDataLoaded`, `salesReportDataLoaded`, `ordersDataLoaded`
  - **Empty state message**: "Данные не загружены" (simplified, gray text) when opening unloaded report
  - **Flag reset**: All flags reset to `false` when "ОБНОВИТЬ ДАННЫЕ" clicked
  - **Error handling**: Flags set to `true` even on errors/empty data to prevent infinite loading
- **MODAL IMPROVEMENTS**:
  - **Click outside to close**: Click on modal backdrop closes the modal (using `onclick` with `event.stopPropagation()`)
  - **Modal structure**: Each modal has `onclick` handler, inner content has `stopPropagation()`
  - **Function**: `closeModalOnOutsideClick(event, modalId)` checks if click target is backdrop
- **ERROR HANDLING**:
  - **All fetch operations**: Set loading flags even on error/catch blocks
  - **Empty data**: Set loading flags when `data.items` is empty or null
  - **Prevents infinite wait**: Ensures loading indicators always complete
- **CODE LOCATIONS** (index.js):
  - Lines 1355-1385: Main loading indicator HTML + button badges
  - Lines 1598-1602: Global loading flags declaration
  - Lines 2192-2212: `loadFinancialData()` - resets flags, shows indicators, loads all reports
  - Lines 2214-2223: `checkAllDataLoaded()` - hides indicators when all complete
  - Lines 2225-2255: Modal open functions with data validation
  - Lines 2290-2335: `loadOrders()` with error flag handling
  - Lines 2421-2460: `loadSalesReport()` with error flag handling
  - Lines 2655-2707: `loadFullFinReport()` with error flag handling
  - CSS animations: `@keyframes spin` and `@keyframes pulse` for visual effects

Recent Changes (Dec 17, 2025 - Afternoon):
  - **Console logging**: Added debugging logs for data flow tracking (to be removed later)
  - **Error prevention**: Removed getElementById('datasetBody') causing null reference errors
- **CODE LOCATIONS** (index.js):
  - Lines 2372-2540: `displaySalesReport()` - renders sales with company column, sorting, aggregation
  - Lines 2480-2547: `sortSalesReport()` - handles column sorting with state management
  - Lines 2549-2590: `loadFullFinReport()` - loads financial data, supports 'all' mode
  - Lines 2607-2682: `displayFullFinReport()`, `switchFinReportCompany()`, `highlightActiveFinTab()` - tab system
  - Lines 2684-2750: `renderFinReportData()` - renders financial report table
  - Lines 1803-1848: `updateBusinessSelector()` - defaults to 'all' when multiple companies

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
- **ARCHITECTURE**: Нет статической базы продавцов - используется только API данные
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
- **REMOVED**: Удалена статическая база продавцов (sellers-db.json) - не нужна
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
