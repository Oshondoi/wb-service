# Progress

## Latest Update (Jan 17, 2026) - ✅ DATABASE VALIDATION & LOCALSTORAGE:

### 🎯 COMPLETED TASKS:

**1. COLUMN VALIDATION & CLEANUP (Financial Reports)**:
- ✅ Проверено соответствие схемы БД с WB API reportDetailByPeriod
- ✅ Подтверждено: **65 колонок данных** точно соответствуют WB API
- ✅ Удалены 14 лишних колонок из HTML таблицы:
  - Заголовки: удалены через PowerShell (dlv_prc, fix_tariff_date_from, fix_tariff_date_to и др.)
  - Данные: удалены через replace_string_in_file в renderFinReportData()
- ✅ Добавлена недостающая колонка `rid` (существовала в БД, но не отображалась)
- ✅ colspan изменён с 82 на 69
- ✅ Обновлён комментарий в supabase-schema.sql
- **РЕЗУЛЬТАТ**: Таблица финансового отчёта теперь точно соответствует схеме БД (69 колонок)

**2. LOCALSTORAGE FOR BUSINESS SELECTION**:
- ✅ Добавлено сохранение выбранного магазина в localStorage
- ✅ При загрузке страницы восстанавливается последний выбор
- ✅ Автоматическая загрузка данных для восстановленного магазина
- **КОД ИЗМЕНЁН**:
  - `loadBusinesses()` — восстановление из localStorage перед updateBusinessSelector
  - `switchBusiness()` — сохранение выбора при переключении
- **РЕЗУЛЬТАТ**: Пользователь не теряет выбор магазина при обновлении страницы

**🗂️ FILES MODIFIED**:
- `index.js` (~line 1800, 1989, 3280) — localStorage + удаление лишних колонок
- `supabase-schema.sql` (line 115) — исправлен комментарий "65 колонок данных + 3 системных"

**✅ TESTING**: Server restarted, localStorage working, column count matches DB schema

---

## Previous Update (Jan 14, 2026) - ✅ SUPABASE MIGRATION & AUTO-SYNC COMPLETE:

### 🎯 MAJOR MILESTONE: Полная миграция на Supabase PostgreSQL + автоматическая синхронизация WB

**🗄️ DATABASE MIGRATION**:
- **FROM**: Локальный SQLite (database.js с синхронными функциями)
- **TO**: Supabase PostgreSQL (все функции async/await)
- **Schema**: 7 таблиц (accounts, businesses, product_costs, wb_sales, wb_orders, wb_financial_reports, sync_logs)
- **Connection**: Supabase client с service role key через .env

**🔄 SYNC SERVICE (sync-service.js)**:
- **Автоматическая синхронизация**: node-cron каждый день в 3:30 AM (МСК)
- **Период загрузки**: 90 дней назад (максимум WB API)
- **Данные**: Продажи (sales) + Заказы (orders) + Финансовые отчёты (reportDetailByPeriod с 82 колонками)
- **Batch insert**: Загрузка по 500 записей для оптимизации
- **Логирование**: Все операции записываются в sync_logs с временными метками и статусами
- **Функции**: `syncSales()`, `syncOrders()`, `syncFinancialReport()`, `syncAllData()`, `syncAllBusinesses()`

**🚀 NEW STORE AUTO-SYNC**:
- При создании нового магазина через POST `/api/businesses`:
  - Магазин создаётся в БД
  - Автоматически запускается `syncService.syncAllData()` в фоне
  - Загружаются данные за 90 дней (не блокирует ответ)
  - Пользователь получает сообщение: "Магазин создан, синхронизация данных запущена"
  - После завершения данные доступны в отчётах

**📊 API ENDPOINTS REFACTORING**:
- ✅ `/api/wb-finance` → читает из `db.getSalesFromCache()`
- ✅ `/api/wb-sales` → читает из `db.getSalesFromCache()` (только с sale_id)
- ✅ `/api/wb-orders` → читает из `db.getOrdersFromCache()`
- ✅ `/api/wb-fin-report` → читает из `db.getFinancialReportFromCache()`
- **Преимущества**: Быстрые запросы, нет лимитов WB API, работа с кэшированными данными

**🔄 MANUAL SYNC**:
- Кнопка "🔄 Ручное обновление" в интерфейсе
- POST `/api/sync/:businessId` запускает синхронизацию вручную
- GET `/api/sync-status/:businessId` показывает статус последней синхронизации
- Загружает данные за 90 дней, **исключая сегодняшний день**

**🐛 BUGS FIXED**:
- Boolean comparison: PostgreSQL возвращает `true/false`, исправлены все проверки `is_active`
- getBusinessById/getDefaultBusiness: теперь async функции с await
- database.js: все функции мигрированы на async/await для Supabase

**📦 NEW DEPENDENCIES**:
- `@supabase/supabase-js` — клиент для Supabase PostgreSQL
- `node-cron` — планировщик задач для ночной синхронизации
- `dotenv` — управление переменными окружения (SUPABASE_URL, SUPABASE_SERVICE_KEY)

**📂 NEW FILES**:
- `.env` — Supabase credentials
- `supabase-client.js` — инициализация клиента
- `sync-service.js` — сервис синхронизации (432 строки)
- `supabase-schema.sql` — SQL схема для создания таблиц в Supabase

**✅ ARCHITECTURE**:
```
WB API (с ключами) → Sync Service → Supabase DB → API (без ключей) → Frontend
```

**STATUS**: ✅ Полностью работает, сервер запущен, автосинхронизация настроена

---

## Previous Update (Jan 14, 2026) - ✅ PRODUCT COSTS MODULE COMPLETE:
- **💰 COST MANAGEMENT SYSTEM**: Полнофункциональный модуль учёта себестоимости товаров
- **🎨 UI IMPROVEMENTS**:
  - Убрана кнопка "🚀 Запустить загрузку" (загрузка автоматическая при открытии)
  - Кнопка "💾 Сохранить" неактивна по умолчанию (серая, disabled)
  - Активация кнопки при вводе данных (любое изменение в полях)
  - После успешного сохранения кнопка снова становится неактивной
- **📊 TABLE STRUCTURE** (5 колонок):
  - 📸 **Фото товара** — автоматическая загрузка изображений 50×50px из WB CDN
  - **Бренд** — из данных WB API
  - **Артикул WB** — nmId товара
  - **Название товара** — редактируемое поле (input text) для пользовательских названий
  - **Себестоимость (₽)** — редактируемое числовое поле
- **🗄️ DATABASE**:
  - Добавлено поле `custom_name TEXT` в таблицу `product_costs`
  - Миграция БД через `ALTER TABLE` при старте сервера
  - Функция `migrateAddCustomName()` проверяет наличие колонки
  - Обновлены функции `bulkUpsertProductCosts` для работы с custom_name
- **🖼️ IMAGE HANDLING**:
  - Формула WB CDN: `https://basket-{host}.wbbasket.ru/vol{vol}/part{part}/{nmId}/images/big/1.webp`
  - Корректное определение host (01-14) на основе vol (диапазоны 0-143, 144-287, etc.)
  - Fallback на SVG-заглушку 📦 при ошибке загрузки
- **🔄 AUTO-LOAD**: При открытии модалки автоматически загружаются товары из текущего периода
- **💾 SMART SAVE**: Сохранение происходит через `POST /api/product-costs/:businessId/bulk`
- **STATUS**: ✅ Полностью работает, данные сохраняются и загружаются из БД

## Previous Update (Jan 13, 2026) - ✅ MAIN PAGE RESTRUCTURE:
- **🏠 NEW MAIN PAGE**: Финансовый отчет теперь главная страница (`/`)
- **📍 ROUTING CHANGES**:
  - `/` → Финансовый отчет (ранее `/fin-report`)
  - `/products` → Анализ товаров MAX UI (ранее `/`)
  - Удалён маршрут `/fin-report`
- **🎨 UI UPDATES**:
  - Главная страница: добавлена кнопка "🔍 Анализ товаров"
  - Страница `/products`: кнопка "📈 Фин отчёт" → "🔍 Главная"
- **🔄 LOGIN FLOW**: После авторизации редирект на главную (`/` = финансовый отчет)
- **💡 REASONING**: Финансовый отчет — основной функционал, должен быть на главной странице
- **STATUS**: ✅ Сервер перезапущен, изменения применены

Previous Update (Dec 23, 2025) - ✅ COMPANIES DROPDOWN AUTO-LOAD FIX:
- **🐛 BUG IDENTIFIED**: Companies dropdown showed "Загрузка..." but never populated actual data
- **🔍 ROOT CAUSE**: `loadBusinesses()` function existed and worked correctly when manually triggered, but wasn't being called on page initialization
- **📍 CODE ISSUE**: Function was only invoked from `openBusinessManager()` event handler (line 1685), not during page DOMReady
- **✅ FIX APPLIED**: Added DOMContentLoaded event listener in closing `</script>` tag of `/fin-report` route (index.js lines 2955-2962)
- **CODE**: 
  ```javascript
  <script>
  window.addEventListener('DOMContentLoaded', function() {
    loadBusinesses();
  });
  </script>
  ```
- **IMPACT**: Companies now auto-load automatically when `/fin-report` page loads (no manual modal open needed)
- **STATUS**: ✅ Server restarted, fix deployed and ready for testing

What Works:
- Public `/wb-price-csv` reliably returns `price,name` with multi-layer fallback.
- MAX UI shows extended fields with image fallbacks and warehouse badges.
- Auth flows (login/logout) protect private routes.
- `/wb-max` returns correct price, stocks, warehouses in ~2-8 seconds (with parsing).
- `/wb-max-csv` includes all fields with proper helper functions.
- UI обновлено: одна колонка `Продавец (ID)` с форматом `Название (ID)`.
- **Новые колонки**: Категория товара (из subjectId) и Цвет (из colors[])
- **Маппинг**: 40+ популярных категорий WB (одежда, электроника, дом, красота, детям, авто)
- Склады: выводим `Название — N шт` на основе агрегации `sizes[].stocks` по `wh`.
- Модель: добавлена колонка `FBO/FBS`.
- Артикул: ссылка на карточку `wildberries.kg`.
- **LIVE PARSING**: Для КАЖДОГО артикула система пытается получить полное юрлицо продавца с WB!
- **3-tier system**: Static DB → Live parsing → API fallback
- **Caching**: Каждый продавец парсится только 1 раз за сессию (Map cache)
- **Anti-block measures**: Random delays (0.5-2s), realistic Chrome headers, multi-domain tries
- **🆕 FINANCIAL REPORT PAGE**: Страница `/fin-report` с модальным интерфейсом для отчётов

Latest Update (Dec 17, 2025 - Evening) - ✅ MODAL WORKFLOW & LOADING SYSTEM:
- **✅ NEW UI WORKFLOW**:
  - **Single "ОБНОВИТЬ ДАННЫЕ" button**: Loads all 3 reports in parallel (Фин отчёт, Продажи, Заказы)
  - **Modal-based reports**: Each report opens in its own modal window (not inline switching)
  - **Button repositioning**: "ОБНОВИТЬ ДАННЫЕ" moved to top-right with purple style
  - **Color-coded modals**: Purple gradient (Фин), Pink gradient (Продажи), Cyan gradient (Заказы)
- **✅ LOADING INDICATORS**:
  - **Animated loading block**: Shows during data fetch with spinner animation
  - **Per-report badges**: ⏳ badges on each button with pulse animation
  - **Progressive hide**: Each badge disappears when its report completes
  - **Auto-complete**: Main loading block hides when all 3 reports done
  - **CSS animations**: Smooth spin and pulse effects
- **✅ DATA VALIDATION**:
  - **Loading state flags**: `finReportDataLoaded`, `salesReportDataLoaded`, `ordersDataLoaded`
  - **Empty state handling**: Shows "Данные не загружены" when opening before loading
  - **Error resilience**: Flags set even on errors/empty data to prevent infinite loading
  - **Reset on refresh**: All flags reset when "ОБНОВИТЬ ДАННЫЕ" clicked
- **✅ MODAL UX IMPROVEMENTS**:
  - **Click outside to close**: Clicking modal backdrop closes the modal
  - **Event propagation**: Inner content stops propagation to prevent accidental closes
  - **Clean dismiss**: X button and backdrop both work for closing
- **✅ ERROR HANDLING**:
  - **Comprehensive catch blocks**: All async operations handle errors
  - **Flag management**: Loading flags update in success, error, and empty data cases
  - **User feedback**: Clear error messages in red, empty states in gray
- **STATUS**: ✅ PRODUCTION READY - Professional loading UX with modal workflow

Latest Update (Dec 17, 2025 - Afternoon) - ✅ MULTI-COMPANY REPORTING ENHANCED:
- **✅ SALES REPORT ENHANCEMENTS**:
  - **Multi-company mode fixed**: "Все активные компании" now shows all active companies (was showing only one)
  - **Company column**: Added as first column in sales report table
  - **Sortable columns**: All columns clickable with ↕ indicator and purple hover effect
  - **Default sort**: Sales report sorted alphabetically by company name on load
  - **Aggregation logic**: Groups by `nmId + brand + company_name` to avoid duplicate rows
  - **State management**: Global `salesSortState` tracks current sort column and direction
- **✅ FINANCIAL REPORT TABS**:
  - **Tab system**: Shows tabs when "All active companies" selected with multiple companies
  - **Tab switching**: Click to switch between companies (uses numeric index to avoid quote issues)
  - **Data grouping**: Groups financial data by `company_name` into `finReportDataByCompany` object
  - **Tab design**: Flat style with gray inactive (#f8f9fa), white active with purple text (#6c5ce7)
  - **Active indicator**: 3px colored bottom border on active tab
  - **Visual harmony**: Seamless integration with table design
- **✅ DEFAULT BEHAVIOR**:
  - **Selector default**: Auto-selects "All active companies" when multiple companies exist
  - **Company_name mapping**: Added to both single and multi-company financial report data
- **✅ BUG FIXES**:
  - Fixed syntax errors from improper quote escaping in onclick handlers
  - Removed non-existent `getElementById('datasetBody')` reference
  - Fixed selector defaulting to first company instead of 'all' mode
- **STATUS**: ✅ PRODUCTION READY - Enhanced multi-company experience

Latest Update (Dec 7, 2025) - ✅ FINANCIAL MODULE COMPLETED:
- **✅ FULL IMPLEMENTATION**: Financial Report module fully functional at `/fin-report`
- **✅ WB API INTEGRATION**: Direct integration with Wildberries Statistics API
  - `/api/v5/supplier/reportDetailByPeriod` - 82-field detailed report
  - `/api/v1/supplier/sales` - sales data
  - `/api/v1/supplier/orders` - orders data
  - `/api/wb-sales-grouped` - custom endpoint for grouped sales by unique articles
- **✅ TWO REPORT TYPES**:
  - **📈 Financial Report**: Full 82-column WB report (matches personal cabinet)
  - **💰 Sales Report**: Grouped by unique nmId with quantity aggregation
- **✅ FINANCIAL CALCULATIONS**:
  - Total revenue (retail_amount)
  - WB commission (ppvz_sales_commission)
  - Logistics & costs (delivery_rub + storage_fee + acquiring_fee + penalty + deduction + acceptance)
  - Net profit (ppvz_for_pay - to be transferred)
  - Pure profit calculation (profit after all fees)
- **✅ 5 DASHBOARD CARDS**: Revenue, Commission, Logistics, Net Profit, Pure Profit
- **✅ DATE RANGE FILTER**: Custom period selection (default: last 30 days)
- **✅ DYNAMIC TABLE HEADERS**: 82 columns (finReport) vs 10 columns (salesReport)
- **✅ STICKY HEADER**: Table header stays visible during scroll (position:sticky, top:0, z-index:10)
- **✅ API KEY MANAGEMENT**: Modal window, file storage (wb-api-key.txt), status indicator
- **✅ SALES GROUPING**: Each article (nmId) appears once with summed quantities
- **✅ SORTING**: Sales sorted by quantity (descending)
- **✅ TOGGLE BUTTONS**: Two styled buttons with gradients (purple for finReport, pink for salesReport)
- **STATUS**: ✅ PRODUCTION READY - Full feature set implemented
- **DOCUMENTATION**: Updated README.md and all memory-bank files

Latest Update (Dec 2, 2025):
- **DISABLED parsing**: WB blocks ALL parsing attempts (498, captcha, anti-bot)
- **Current approach**: Show only sellerId + storeName (from API)
- **Two columns**: "Продавец (ID)" shows ID only, "Магазин" shows trade name
- **Decision**: Parsing requires Puppeteer/Selenium on dedicated server (not Vercel)
- **Result**: Fast and reliable, but no legal entity names until proper scraping solution

Performance Fixes (Dec 2, 2025):
- Eliminated slow `fetchStoreNameFromProductPage` (3+ requests per call)
- Simplified `extractPrice` - removed redundant checks
- Fixed duplicate `summarizeStocks` definition
- Added missing `safeGet` and `currencyByDomain` helpers
- **MAJOR FIX**: Store name from `product.supplier` field (no parsing needed!)
- **SIMPLIFICATION**: Removed `sellerName` field - now only `storeName` from API
- **SIMPLIFICATION**: Removed IP-only restriction - show ALL sellers with their legal names
- **NEW**: Added live parsing with caching - slight slowdown (2-8 sec) but full legal entity names!

What's Next:
- **Priority: Implement Financial Report functionality** (WB API integration, profit calculations)
- Optional: response caching for frequently requested products
- Optional: batch CSV endpoint
- Расширять словарь названий складов

Known Issues:
- None currently

Evolution:
- Iterated endpoints from simple price → maximal data
- Performance optimization: removed blocking HTML parsers
- Balanced data richness with response speed
