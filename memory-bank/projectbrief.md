# Project Brief

Purpose: Build a small Node.js/Express service that fetches and exposes Wildberries product data with robust fallbacks, a protected MAX UI, public CSV endpoints for Google Sheets automation, and **a multi-company financial reporting system with local database**.

Core Goals:
- Provide maximum product data: price, name, brand, seller info, rating, reviews, images, stocks, warehouses, dest, source, currency.
- Keep `/wb-price-csv` public and minimal: returns two columns `price,name` reliable for `IMPORTDATA`.
- Deliver a clean MAX UI (protected by login) with a wide table and image fallbacks.
- Ensure multi-layer data fallback: API v2 → v1 → basket CDN → HTML parsing.
- Integrate smoothly with Google Sheets via Apps Script.
- **🆕 Local SQLite database for accounts and businesses (companies)**
- **🆕 Multi-company support: one account can manage multiple businesses with separate WB API keys**
- **🆕 Build Financial Report module (`/fin-report`) with per-company reporting**
- **🆕 Business management UI: create, update, delete, activate/deactivate companies**

Scope:
- One monolithic server file `index.js` managing routes and UI
- Separate `database.js` module for SQLite operations
- Database-driven authentication with password hashing
- Multi-company architecture: accounts → businesses hierarchy
- CASCADE DELETE: removing account deletes all its businesses
- Session-based auth for private endpoints (httpOnly cookies)
- Public endpoints strictly limited to CSV/plain for Sheets
- **🆕 Financial module with per-company WB API integration**
- **🆕 Auto-migration from old file-based API key system**
