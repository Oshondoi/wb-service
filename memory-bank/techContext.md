# Tech Context

Stack:
- Node.js (>=18), Express 5, axios, cors, express-session.

Setup:
- Single entry `index.js`, `npm start` runs server.
- Deployed to Vercel; public endpoints needed for Sheets.

Constraints:
- External Wildberries endpoints can be slow/unreliable.
- Local container may have limited external access.

Dependencies:
- Wildberries card API v2/v1, basket CDN, product HTML pages, seller page HTML.

Tool Usage:
- `UrlFetchApp` on Google Apps Script; `IMPORTDATA` in Sheets.
