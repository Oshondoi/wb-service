# Tech Context

Stack:
- Node.js (>=18), Express 5, axios, cors, express-session, cookie-parser
- **better-sqlite3** for local SQLite database
- **crypto** (built-in) for password hashing

Database:
- SQLite file: `wb-service.db` (created automatically)
- Module: `database.js` with CRUD operations for accounts & businesses
- Schema: accounts (users) → businesses (companies with WB API keys)
- Foreign keys enabled with CASCADE DELETE

Setup:
- Single entry `index.js`, `npm start` runs server
- Database auto-initialized on first run
- Auto-migration from `wb-api-key.txt` if exists
- Deployed to Vercel; public endpoints needed for Sheets

Constraints:
- External Wildberries endpoints can be slow/unreliable
- Local container may have limited external access
- SQLite database stored locally (not suitable for distributed serverless)

Dependencies:
- Wildberries card API v2/v1, basket CDN, product HTML pages, seller page HTML
- WB Statistics API v1 (sales, orders) and v5 (reportDetailByPeriod)

Tool Usage:
- `UrlFetchApp` on Google Apps Script; `IMPORTDATA` in Sheets
