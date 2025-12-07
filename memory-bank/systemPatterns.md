# System Patterns

Architecture:
- Node.js + Express single-file server (`index.js`)
- **SQLite database** (`database.js` module) for accounts & businesses
- Database-driven authentication with password hashing
- Multi-company support (one account → many businesses)
- Session-based auth protects UI and rich endpoints
- Public CSV/plain endpoints for Sheets

Key Decisions:
- Multi-source data pipeline: v2 → v1 → basket CDN → HTML
- Price extraction prioritizes smallest positive price across candidate fields
- Image proxy endpoint `/wb-image` with cascade of CDN URLs
- **Database-first approach**: All users and API keys stored in SQLite
- **CASCADE DELETE**: Removing account deletes all its businesses
- **Auto-migration**: First run migrates old `wb-api-key.txt` to database

Design Patterns:
- Fallback chaining for external data
- Safe getters (`safeGet`) for CSV formatting
- Summarization of stocks to collect `warehouses` and `stocksQty`
- Category extraction from API `entity` field (auto-capitalized for display)
- **Auth via httpOnly cookies** (token = account.id) for serverless compatibility
- **Password hashing** with SHA256 + salt (pbkdf2, 1000 iterations)
- **Business ownership verification**: API checks that business belongs to current account

Database Patterns:
- `initializeDatabase()`: Creates schema if not exists
- `migrateFromLegacyApiKey()`: One-time migration on first run
- CRUD operations via prepared statements (SQL injection safe)
- Foreign keys enabled with `PRAGMA foreign_keys = ON`
- Indexes on `account_id` and `is_active` for performance

Critical Paths:
- `/api/login`: POST endpoint authenticates via DB, returns account ID as token
- `/api/businesses`: GET/POST for listing and creating companies
- `/api/businesses/:id`: PUT/DELETE for updating and removing companies
- `/api/wb-finance`: GET financial data for specific business (via `businessId` param)
- `/wb-price-csv`: minimal, fast, public; returns `price,name`
- `/wb-max`: rich JSON with seller info, stocks, rating, images (requires auth)
- `/fin-report`: Financial dashboard with business selector and management UI
