# System Patterns

Architecture:
- Node.js + Express single-file server (`index.js`).
- Session-based auth protects UI and rich endpoints.
- Public CSV/plain endpoints for Sheets.

Key Decisions:
- Multi-source data pipeline: v2 → v1 → basket CDN → HTML.
- Price extraction prioritizes smallest positive price across candidate fields.
- Image proxy endpoint `/wb-image` with cascade of CDN URLs.

Design Patterns:
- Fallback chaining for external data.
- Safe getters (`safeGet`) for CSV formatting.
- Summarization of stocks to collect `warehouses` and `stocksQty`.
- Category extraction from API `entity` field (auto-capitalized for display).
- Auth via httpOnly cookies (token = base64(login:password)) for serverless compatibility.

Critical Paths:
- `/wb-price-csv`: minimal, fast, public; returns `price,name`.
- `/wb-max`: rich JSON with seller info, stocks, rating, images (requires auth).
- `/wb-max-csv`: rich CSV including `sellerName` column.
- `/api/login`: POST endpoint sets httpOnly cookie with auth token.
