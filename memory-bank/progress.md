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

Latest Update (Dec 7, 2025):
- **NEW MODULE**: Financial Report module created at `/fin-report`
- **NEW BUTTON**: "📈 Фин отчёт" button added to main page (between Clear and Logout)
- **PLANNED FEATURES**:
  - Integration with Wildberries API for automatic sales data collection
  - Net profit calculation with marketplace commission, logistics, taxes
  - Detailed analytics by products and categories
  - Sales and profit dynamics charts
  - Export reports to Excel/CSV
  - Encrypted API key storage
- **STATUS**: Development stage - placeholder page with feature description
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
