# Project Brief

Purpose: Build a small Node.js/Express service focused on **financial reporting for Wildberries sellers** with multi-company support, plus product analytics tools. Local SQLite database for accounts and businesses management.

Core Goals:
- **PRIMARY**: Multi-company financial reporting system with local database (`/` - main page)
- **SECONDARY**: Product analytics - maximum product data: price, name, brand, seller info, rating, reviews, images, stocks, warehouses (`/products`)
- Keep `/wb-price-csv` public and minimal: returns two columns `price,name` reliable for `IMPORTDATA`
- Ensure multi-layer data fallback: API v2 → v1 → basket CDN → HTML parsing
- Integrate smoothly with Google Sheets via Apps Script

Scope:
- One monolithic server file `index.js` managing routes and UI
- Separate `database.js` module for SQLite operations
- **Main page (`/`)**: Financial Report dashboard with per-company reporting
- **Secondary page (`/products`)**: Product analysis MAX UI with detailed product research
- Database-driven authentication with password hashing
- Multi-company architecture: accounts → businesses hierarchy
- CASCADE DELETE: removing account deletes all its businesses
- Session-based auth for private endpoints (httpOnly cookies)
- Public endpoints strictly limited to CSV/plain for Sheets
- Auto-migration from old file-based API key system
