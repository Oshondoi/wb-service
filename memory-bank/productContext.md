# Product Context

Why:
- **Primary focus**: Financial reporting and profit tracking for WB sellers via API integration
- Streamline price/name retrieval for Wildberries goods and internal viewing of rich product data
- Provide comprehensive analytics and business intelligence

Problems Solved:
- Manual profit calculation and scattered financial data — now automated and transparent
- Unreliable external resources (images/CDN) via layered fallbacks and a proxy
- Sheets automation needing a stable, minimal CSV endpoint
- Quick internal lookup of extended data behind simple auth

How It Should Work:
- User logs in to main page with cashflow dashboard (`/`)
- Cashflow module tracks доходы/расходы, долги и баланс
- Financial Report available at `/fin-report` for per-company reporting
- Product analysis available at `/products` for detailed product research
- Sheets call `/wb-price-csv?nm=...` and parse two-line CSV: headers and a single data row

UX Goals:
- **Main page**: Clear cashflow dashboard with income/expense tracking and balance
- **Products page**: Central, readable table with clear badges for warehouses and statuses
- Photo with graceful degradation (webp→jpg→basket→wbstatic) or placeholder
- Simple login page; minimal friction for public CSV use
