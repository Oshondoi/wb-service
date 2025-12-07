# Progress

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
- **🆕 FINANCIAL REPORT PAGE**: Создана страница `/fin-report` с кнопкой доступа на главной

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
