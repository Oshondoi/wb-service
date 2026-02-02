# System Patterns

Architecture:
- Node.js + Express main server file (`fin-report.js`) loaded by `index.js`
- **Supabase PostgreSQL** (через `database.js` + `supabase-client.js`)
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
- Supabase schema managed via `supabase-schema.sql`
- CRUD operations via Supabase client (async/await)
- CASCADE DELETE on accounts → businesses
- Indexes on `account_id` and `is_active` for performance

Critical Paths:
- `/api/login`: POST endpoint authenticates via DB, returns account ID as token
- `/api/businesses`: GET/POST for listing and creating companies
- `/api/businesses/:id`: PUT/DELETE for updating and removing companies
- `/api/wb-finance`: GET financial data for specific business (via `businessId` param)
- `/api/cash/transactions`: cashflow CRUD (income/expense)
- `/api/cash/debts`: debts CRUD
- `/api/cash/transactions/bulk`: bulk delete cashflow operations
- `/api/cash/debts/bulk`: bulk delete debt records
- `/wb-price-csv`: minimal, fast, public; returns `price,name`
- `/wb-max`: rich JSON with seller info, stocks, rating, images (requires auth)
- `/`: Cashflow (ДДС) main page
- `/fin-report`: Financial dashboard with business selector and management UI

Cashflow UX Patterns:
- В ДДС «Создать новый…» сначала сохраняет в памяти, запись в БД — только после «Добавить»
- Перед сохранением операции/долга показывается модалка подтверждения
- Редактирование операций/долгов выполняется через модалки с сохранением по кнопке

Multi-Company Reporting Patterns:
- **Sales Report**: Aggregates data by `nmId + brand + company_name` when "All active companies" selected
- **Financial Report Tabs**: Groups data by `company_name`, creates clickable tabs for switching
- **Tab Switching**: Uses numeric index instead of company names to avoid quote escaping in onclick
- **Sortable Columns**: Global state management (`salesSortState`) tracks sort column/direction
- **Default Sort**: Company name alphabetically for better organization
- **Data Flow**: `loadFromAllBusinesses()` → parallel API calls → adds `company_name` to each item → callback
