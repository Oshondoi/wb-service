# Product Context

Why:
- Streamline price/name retrieval for Wildberries goods and internal viewing of rich product data.
- **🆕 Provide financial reporting and profit tracking for WB sellers via API integration.**

Problems Solved:
- Unreliable external resources (images/CDN) via layered fallbacks and a proxy.
- Sheets automation needing a stable, minimal CSV endpoint.
- Quick internal lookup of extended data behind simple auth.
- **🆕 Manual profit calculation and scattered financial data — now automated and transparent.**

How It Should Work:
- User logs in to view MAX UI and rich JSON endpoints; public CSV remains open.
- Sheets call `/wb-price-csv?nm=...` and parse two-line CSV: headers and a single data row.
- **🆕 Financial Report module (`/fin-report`) integrates with WB API to automatically track sales and calculate net profit.**

UX Goals:
- Central, readable table with clear badges for warehouses and statuses.
- Photo with graceful degradation (webp→jpg→basket→wbstatic) or placeholder.
- Simple login page; minimal friction for public CSV use.
- **🆕 Clear financial dashboard with profit visualization, cost breakdowns, and export capabilities.**
