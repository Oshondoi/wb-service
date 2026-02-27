# Project Brief

Purpose: Build a small Node.js/Express service focused on **financial reporting for Wildberries sellers** with multi-company support, plus product analytics tools. Supabase PostgreSQL manages accounts and businesses.

Core Goals:
- **PRIMARY**: ДДС (движение денег) как главная страница (`/`)
- **SECONDARY**: Финансовый отчёт по компаниям (`/fin-report`)
- **TERTIARY**: Product analytics - maximum product data: price, name, brand, seller info, rating, reviews, images, stocks, warehouses (`/products`)
- Keep `/wb-price-csv` public and minimal: returns two columns `price,name` reliable for `IMPORTDATA`
- Ensure multi-layer data fallback: API v2 → v1 → basket CDN → HTML parsing
- Integrate smoothly with Google Sheets via Apps Script

Scope:
- Entrypoint `index.js` запускает модульный серверный путь `src/server.js -> src/app.js`
- Separate `database.js` module for Supabase operations
- **Main page (`/`)**: Cashflow (ДДС) + долги
- **Secondary page (`/fin-report`)**: Financial Report dashboard with per-company reporting
- **Third page (`/products`)**: Product analysis MAX UI with detailed product research
- **Additional page (`/shipments`)**: Пошаговый процесс отгрузок (поставка → склады → короба → сканирование)
- **Comparison page (`/shipments-2`)**: Альтернативный UI для сравнения UX отгрузок на тех же FBO-сущностях
- Database-driven authentication with password hashing (Supabase)
- Multi-company architecture: accounts → businesses hierarchy
- CASCADE DELETE: removing account deletes all its businesses
- Session-based auth for private endpoints (httpOnly cookies)
- Public endpoints strictly limited to CSV/plain for Sheets
- Auto-migration from old file-based API key system
