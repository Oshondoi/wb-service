# Tech Context

Stack:
- Node.js (>=18), Express 5, axios, cors, express-session, cookie-parser
- **@supabase/supabase-js** for Supabase PostgreSQL + Auth (email/password)
- **xlsx** for generating true `.xlsx` exports on backend
- **crypto** (built-in) for password hashing

Database:
- Supabase PostgreSQL (managed schema in `supabase-schema.sql`)
- Module: `database.js` with async CRUD operations
- Schema: accounts (users) → businesses (companies with WB API keys)
- Foreign keys enabled with CASCADE DELETE

Setup:
- Runtime entry is modular: `index.js` -> `src/server.js` -> `src/app.js`; `npm start` runs `node index.js`
- Database auto-initialized on first run
- Auto-migration from `wb-api-key.txt` if exists
- Deployed to Vercel; public endpoints needed for Sheets

Constraints:
- External Wildberries endpoints can be slow/unreliable
- Local container may have limited external access
- SQLite database stored locally (not suitable for distributed serverless)
- Supabase Auth email confirmation must be enabled for new signups
- Для recovery flow пароля в Supabase должен быть разрешён redirect URL приложения (`/auth?mode=recovery`) в `Authentication -> URL Configuration`

Dependencies:
- Wildberries card API v2/v1, basket CDN, product HTML pages, seller page HTML
- WB Statistics API v1 (sales, orders) and v5 (reportDetailByPeriod)

Tool Usage:
- `UrlFetchApp` on Google Apps Script; `IMPORTDATA` in Sheets
