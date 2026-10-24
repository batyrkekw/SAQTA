# SAQTA

**Predict demand. Save food. Protect tomorrow.**

SAQTA is a working food waste prevention MVP for bakeries, originating in Kazakhstan and initially focused on Astana. The name is inspired by the Kazakh **сақта**: keep, preserve, or protect. The application speaks Russian and displays money in Kazakhstani tenge (₸).

Forecast helps bakery managers make production decisions before surplus occurs. Save lets them offer eligible remaining food for discounted pickup. A statistical forecast is a decision aid, never a sales guarantee. Unsold food is not automatically waste.

**Public demo:** [SAQTA](https://saqta-batyrkekw.vercel.app) · [API documentation](https://saqta-api.onrender.com/docs) · [API health](https://saqta-api.onrender.com/api/health). Deployed and checked on **24 October 2026**. This is a shared, unauthenticated workspace containing synthetic data; do not enter private business or customer information.

This repository originally contained a concept document only; there was no application implementation to migrate. This project builds the working application rather than a slide deck.

## Product and features

| Route | Working functionality |
|---|---|
| `/` | Public product introduction, original SVG brand, links into the application |
| `/dashboard` | Database-derived production, sales, stock, write-offs, losses, trends, forecast comparison, recommendations; date/location filters |
| `/forecast` | Product/location/date/horizon, stored explainable forecast, existing inventory, production recommendation, history and chronological MAE |
| `/inventory` | Catalog creation/editing, production/sales/write-off entry and edits, reconciliation, search/sort, CSV import/export |
| `/save` | Surplus listing creation/editing/deactivation, search/filter, demo reservations, cancellation and collection |
| `/impact` | Collected order units, recorded weight and revenue, write-off trends, preceding-period comparison and methodology |
| `/economics` | Editable assumptions, contribution margin, LTV/CAC, payback, revenue target, illustrative acquisition funnel |
| `/settings` | Bakery settings, safety buffer, data source, CSV, explicit demo reset confirmation |
| `/docs` | Human-readable methodology, downloadable README/brand/API reference and live OpenAPI link |

Empty, loading and API-error states do not invent fallback metrics. The demo label identifies synthetic records throughout the application. Catalog weights and costs are supplied data, not independently measured by SAQTA.

## Architecture

```mermaid
flowchart LR
  Manager[Bakery manager / demo customer] --> Web[Next.js App Router · Russian UI]
  Web -->|Typed HTTP client /api| API[FastAPI + Pydantic]
  API --> Stock[Inventory and marketplace transactions]
  API --> Analytics[Dashboard / impact / economics]
  API --> Forecast[Explainable baseline + chronological evaluation]
  Stock --> ORM[SQLAlchemy 2.x]
  Analytics --> ORM
  Forecast --> ORM
  ORM --> DB[(PostgreSQL / local SQLite)]
  CSV[Validated CSV · Pandas] --> API
  Migrations[Alembic migrations] --> DB
  Seed[Reproducible synthetic seed] --> DB
```

Forecasting is separate from the API and database layers. No paid API, LLM, GPU, CatBoost or payment processor is required. CatBoost is a roadmap item, not an implemented feature.

## Actual technology and versions

Exact installed versions are recorded in [`docs/VERSIONS.md`](docs/VERSIONS.md), `frontend/package-lock.json` and `backend/requirements.lock.txt`. Direct backend dependencies are listed in `backend/requirements.txt`; the lock also pins their installed transitive dependencies. The frontend uses Next.js, React, strict TypeScript, Tailwind CSS, Recharts, Lucide, React Hook Form and Zod. The backend uses Python 3.12, FastAPI, Pydantic, SQLAlchemy, Alembic, Pandas and psycopg. Tests use Pytest, Vitest and React Testing Library; linting uses Ruff and ESLint.

The development machine has Python 3.12.5 and Node.js 25.2.1. Use **Node.js 24 LTS** for deployment (the Docker image uses 24). Versions are pinned rather than automatically installing future releases.

## Repository layout

```text
frontend/
  src/app/             App Router routes, layout and design tokens
  src/components/      Responsive shell, shared forms/cards/charts
  src/lib/             Typed API client and economics calculation
  src/types/           API response types
  public/brand/        Editable original SVG logos and icons
  tests/               Vitest / React Testing Library
backend/
  app/api/             REST endpoints
  app/core/            Environment configuration
  app/db/              SQLAlchemy session and engine
  app/models/          Normalized relational entities
  app/schemas/         Validated request models
  app/services/        Inventory, orders and CSV processing
  app/forecasting/     Baseline forecast and chronological evaluation
  app/analytics/       Dashboard, impact and unit economics
  alembic/             Database migrations
  tests/               Pytest unit and integration tests
data/demo/             CSV example and seed instructions
docs/                  Brand, API contract, versions and verification
docker-compose.yml     PostgreSQL + API + web
render.yaml            Render backend/PostgreSQL blueprint
```

## Prerequisites and local installation

Install Python **3.12+**, Node.js **24 LTS**, npm, and optionally Docker Compose. PostgreSQL is recommended for deployment; SQLite provides a zero-service local fallback. No credentials are included.

From the repository root, in PowerShell:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.lock.txt
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env.local
```

Then initialize the backend **from `backend/`** (relative SQLite paths resolve there):

```powershell
cd backend
.venv/Scripts/python -m alembic upgrade head
.venv/Scripts/python -m app.seed
.venv/Scripts/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open [SAQTA locally](http://127.0.0.1:3000), [API health](http://127.0.0.1:8000/api/health) or [OpenAPI](http://127.0.0.1:8000/docs). On macOS/Linux replace `.venv/Scripts/python` with `.venv/bin/python`; copy `.env` files with `cp`.

For a local production frontend: `npm run build` followed by `npm start`. `NEXT_PUBLIC_API_URL` is embedded at **build time**; rebuild after changing it.

## Environment variables

| Variable | Scope | Purpose |
|---|---|---|
| `DATABASE_URL` | Backend | `sqlite:///./saqta.db` for local use or `postgresql+psycopg://USER:PASSWORD@HOST:5432/DB` |
| `WORKSPACE_MODE` | Backend | Initialization/reset policy: `demo` for synthetic workspace; `real` for a separately provisioned empty database. Stored origin labels are persisted with the workspace. |
| `AUTO_SEED_DEMO` | Backend | Optional boolean, default `false`; fill an empty demo after migrations without resetting existing records. The Render Blueprint enables it; real-data workspaces are refused. |
| `CORS_ORIGINS` | Backend | Comma-separated explicit frontend origins; configure the actual HTTPS deployment origin |
| `DEMO_ANCHOR_DATE` | Seed | Optional ISO date for repeatable historical dates; defaults to current Astana date |
| `NEXT_PUBLIC_API_URL` | Frontend build | Backend base including `/api`, e.g. `http://127.0.0.1:8000/api` |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Compose | Database configuration; set a strong password in ignored root `.env` |
| `PORT` | Backend deployment | Hosting provider port; Docker command supports the assigned value |

See the actual example files for defaults. Do not commit `.env`, database files, tokens or credentials. `NEXT_PUBLIC_` values are public; never put secrets there.

## Database migrations, seed and reset

```powershell
cd backend
.venv/Scripts/python -m alembic upgrade head
.venv/Scripts/python -m app.seed
```

The seed creates **42 days × 5 baked products × 2 Astana locations**, with deterministic weekday/weekend variation, production, sales, write-offs, live stock, several listings and demo orders. The PRNG is fixed; set `DEMO_ANCHOR_DATE=2026-10-24` to reproduce historical record dates. Live pickup windows and initial live-order events use execution time so the marketplace can be demonstrated. Seeding never runs automatically on every web request. Stored history does not roll forward automatically; normal user actions and expired-reservation cleanup still update operational records.

Use **Settings → Reset demo** and type the exact confirmation, or call:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/demo/reset -ContentType 'application/json' -Body '{"confirm":"RESET SAQTA DEMO"}'
```

Reset deletes records in the configured demo database. It is refused in `WORKSPACE_MODE=real`. The CLI equivalent is `python -m app.seed --reset` from `backend/` with the virtual environment active. The default seed command is idempotent when a bakery already exists; it does not overwrite it.

For an empty real-data workspace, use a **separate database**, set `WORKSPACE_MODE=real` and its `DATABASE_URL` in `backend/.env`, then initialize it explicitly:

```powershell
cd backend
.venv/Scripts/python -m alembic upgrade head
.venv/Scripts/python -m app.seed --empty
```

`--empty` creates a bakery, one placeholder location and application settings, with no synthetic catalog or business records. Migrations alone do not create this workspace. Enter your catalog and records after initialization. Real mode does not implement authentication or make a public shared installation private.

The workspace's `demo`/`real` origin is saved in ApplicationSettings. Changing an environment variable cannot relabel an existing synthetic database as real data. Use a separate database and the empty initializer for that distinction; there is no UI mode switch that converts data.

### Relational model

Bakery owns BakeryLocation and Product. ProductionRecord, SalesRecord and WasteRecord form the stock ledger and reference product/location pairs. InventorySnapshot stores live `on_hand` and `reserved` stock with unique product/location keys. Forecast stores results and explanations for its product, location, target date and horizon. SurplusListing allocates inventory; Order and OrderItem preserve order status, discounted price and product weight at reservation. WasteRecord snapshots unit cost and product weight at write-off. ApplicationSettings stores the production buffer and persisted workspace origin.

Foreign keys, stock/price/quantity constraints, indexes and timestamps are declared in SQLAlchemy and initialized by Alembic. Currency uses **integer KZT**, quantities integer units, weights grams. No floating-point currency columns are used.

### Stock and order rules

Production increases stock; sales and write-offs reduce unallocated stock. Listings allocate stock so ordinary sales and other listings cannot consume it. Orders reserve available listing quantities. Collection deducts stock, creates the corresponding sale once and contributes to impact; cancellation releases an order reservation back to its listing before the pickup deadline. Guarded conditional database updates and transactions prevent overselling and partial multi-item orders. Conflicting edits return errors; quantities are never silently clamped.

Inventory and dashboard unsold stock are **live balances**, independent of the selected date interval. Date-filtered production/sales/write-offs are period flows; changing dates does not turn current stock into a historical stock snapshot. Active listing counts are also current. Dashboard forecast demand is for the day after the selected period ends, using only earlier history. Verify product freshness, allergens, storage and pickup eligibility operationally before publishing a listing; the MVP does not certify food safety or track batches/expiry.

## CSV import and export

UTF-8, comma-separated CSV, at most **2 MB / 5,000 rows**:

```csv
kind,product_id,location_id,date,quantity,reason,unit_price_kzt
production,1,1,2026-10-24,40,,
sales,1,1,2026-10-24,25,,850
waste,1,1,2026-10-24,2,Повреждение упаковки,
```

`kind` is `production`, `sales` or `waste`; dates are ISO. IDs must exist. Waste requires a reason. Imports validate structure, types, positive quantities and inventory in row order. The transaction is all-or-nothing, with row-level errors. Reimporting a valid file adds additional records; import is **not idempotent**. Review before repeating. Export includes the same columns; date and location filters are supported. An example is in `data/demo/`.

## Forecasting methodology and limitations

For a target date, use only observations strictly before it:

1. Aggregate daily sales for the selected product and location.
2. Compute the mean of the latest seven observed daily sales values.
3. Compute the mean of up to four previous observations on the target weekday.
4. Combine **60% recent mean + 40% weekday mean** when weekday history exists; otherwise use the recent mean. Round the nonnegative demand to units.
5. Recommend `max(0, ceil(predicted_demand × (1 + safety_buffer/100)) − available_inventory)`. Reserved inventory is excluded. Multi-day recommendations consume the initial stock across days; forecast surplus from future production is not assumed to remain fresh for the next day.

The response includes demand, production, considered stock, expected surplus, risk indicator, timestamp, method and explanation. Insufficient history returns an actionable validation message. The risk indicator is a heuristic, not a calibrated probability.

MAE is the average absolute error over chronological held-out predictions: every prediction uses only preceding observations. It is shown only when evaluation points exist; otherwise the interface states **«Недостаточно данных для оценки точности»**. Synthetic held-out scores demonstrate the calculation and are **not evidence of real bakery model accuracy**.

Daily sales can understate demand when stockouts occur. Holidays, weather, promotions, price changes, intraday timing, freshness and stockout censoring are not modelled. Better data needs validated timestamps, opening days, inventory availability, promotions and longer real history. Optional future CatBoost must beat the baseline using chronological validation before adoption.

## Impact methodology

* Recovered units: sum of **collected** marketplace order-item quantities.
* Recovered weight in kg: `Σ(collected quantity × recorded product grams) / 1000`.
* Value recovered: `Σ(collected quantity × reserved discounted unit price)` in KZT.
* Recorded waste: `Σ(write-off quantity × recorded product grams) / 1000`.
* Baseline: immediately preceding equal-length date interval, same selected location. Change is `(selected waste − baseline waste) / baseline waste × 100`; unavailable when baseline is zero or recorded coverage is incomplete. Coverage means at least one production record on every date in each comparison interval under the selected location filter. It is a completeness proxy, not independently verified opening days or complete reporting across every product/location. The response includes baseline `observed_days`, `required_days`, `complete`, and top-level `comparison_complete`.
* Write-off loss: recorded quantity multiplied by the unit cost snapshotted at write-off. Missing unit cost contributes 0 ₸; selling price is not substituted.
* Potential savings: an illustrative **20% of recorded write-off cost** scenario, explicitly separated from achieved results.

Catalog weights are assumptions until a bakery verifies them. Demo outcomes are synthetic. Listing or reserving an item does not count as recovery. No unsupported CO₂ factors, avoided-waste claim, or causal claim is made. `potential_avoided_waste_kg` remains null without evidence.

The seed covers 42 days. The default 30-day comparison therefore has only 12 preceding seeded days and reports an incomplete baseline; a recent 14-day interval can demonstrate two fully covered equal windows. This guards against presenting partial history as a measured reduction.

## Unit economics: hypothetical assumptions

| Input / result | Default |
|---|---:|
| Subscription per location / month | 30,000 ₸ |
| Hosting and database | 3,000 ₸ |
| Forecast computation | 2,000 ₸ |
| Customer support | 3,000 ₸ |
| Backups / miscellaneous | 1,000 ₸ |
| Total variable costs | 9,000 ₸ |
| Contribution margin | 21,000 ₸ / 70% |
| CAC | 40,000 ₸ |
| Lifetime | 12 months |
| Contribution-based LTV | 252,000 ₸ |
| LTV/CAC | 6.3 |
| CAC payback | ≈ 1.9 months |

`contribution = revenue − variable costs`; `margin% = contribution/revenue × 100`; `LTV = contribution × lifetime`; `LTV/CAC = LTV/CAC`; `payback = CAC/contribution`; `customers for target = ceil(monthly revenue target/subscription)`. Undefined denominators display an unavailable value. Contribution margin is **not net profit**. Fixed company expenses, taxes and development costs are excluded.

The editable illustrative funnel is a target: **200 contacted → 60 responses → 30 demonstrations → 15 pilots → 10 paying locations**. Ten continuously paying locations at 30,000 ₸/month imply **3,600,000 ₸ ARR**. Actual first-year revenue can be lower as locations join gradually. These are assumptions to validate, not operating results.

## API and OpenAPI

Interactive docs: `/docs`; machine schema: `/openapi.json` on the backend. All business endpoints use `/api`. See [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) for full payloads.

| Group | Endpoints |
|---|---|
| Status / workspace | `GET /health`, `GET/PATCH /bakery`, `GET /locations`, `GET/PATCH /settings` |
| Catalog | `GET/POST /products`, `PATCH /products/{id}` |
| Operations | `GET/POST /records`, `PATCH /records/{kind}/{id}`, `GET /inventory` |
| Data exchange | `POST /import`, `GET /export`, `POST /demo/reset` |
| Analytics | `GET /dashboard`, `GET /impact`, `POST /economics` |
| Forecast | `POST/GET /forecasts`, `GET /history` |
| Save | `GET/POST /listings`, `PATCH /listings/{id}` |
| Orders | `GET/POST /orders`, `POST /orders/{id}/cancel`, `POST /orders/{id}/collect` |

Records support `page`/`page_size`. Analytics support inclusive `start_date`, `end_date`, `location_id`. HTTP 422 reports validation errors; HTTP 409 reports stock/state conflicts. Expected errors use safe Russian messages. There is no mock API returning static dashboard totals.

## Tests and quality checks

```powershell
cd backend
.venv/Scripts/python -m pytest -q
.venv/Scripts/python -m ruff check app tests
cd ../frontend
npm test
npm run lint
npm run typecheck
npm run build
```

Tests cover forecasts, recommendations, missing history, invalid quantities, CSV validation/rollback, inventory edits, order placement/cancellation/collection, overselling prevention, economics, impact and major endpoints. Frontend tests exercise calculations and user interactions. Actual results and verification limits are recorded in [`docs/VERIFICATION.md`](docs/VERIFICATION.md); no cloud deployment is implied by a successful local build.

## Deployment

### Docker Compose (PostgreSQL)

```powershell
Copy-Item .env.example .env
# Edit .env: choose a strong POSTGRES_PASSWORD, review URLs/origins.
docker compose up --build -d
docker compose exec backend python -m app.seed
```

Visit port 3000. Migrations run before the API starts. Seeding is explicit. To reset, use the confirmed demo UI or API. Data persists in `postgres_data`. `docker compose down` preserves it; do not delete volumes unless you intend to erase that database. Passwords with URL-special characters must be URL-encoded in a custom `DATABASE_URL`; for the Compose interpolation use a URL-safe randomly generated password.

### Vercel frontend + Render backend + PostgreSQL

The verified public demo uses Vercel Hobby project `saqta`, the free Render API `saqta-api`, and free managed PostgreSQL 17 in Frankfurt. Source is stored in the private [batyrkekw/SAQTA repository](https://github.com/batyrkekw/SAQTA). The first API deployment built commit `af21fef1eb7f3f570f1ec05f9286e623ce9fb372`, ran both Alembic revisions against PostgreSQL, and initialized the synthetic workspace. The live HTTP/API smoke run passed **22/22 checks**, including persisted forecasts, inventory changes, cancellation, collection and overselling rejection. A separate **9/9-check concurrent order test** accepted exactly one of two simultaneous requests for one available listing unit on PostgreSQL. Targeted live browser flows also passed. [Deployment details and future release commands](docs/DEPLOYMENT.md) · [Verification evidence and limits](docs/VERIFICATION.md).

The API is linked to GitHub `main` with service root `backend`, Docker context `.`, and Dockerfile `./Dockerfile`; backend changes auto-deploy. The frontend uses reviewed source uploads to the existing Vercel project, rather than GitHub auto-deployment. The monorepo release configuration uses Root Directory `frontend` and includes source files outside that root, allowing the build to copy the README and brand/API documentation. **The frontend does not currently auto-deploy from GitHub.** Deploy reviewed monorepo source from the repository root using the procedure in `docs/DEPLOYMENT.md`, or explicitly connect the existing project to GitHub before switching to Git-based releases.

To provision a separate installation:

1. Push the reviewed source to a Git provider you control, excluding credentials and runtime data.
2. In Render, create the blueprint from `render.yaml`, or a Docker web service with context `backend`, `backend/Dockerfile`, and managed PostgreSQL. The Blueprint explicitly selects **free** API and PostgreSQL plans in Frankfurt, pins PostgreSQL 17 and disables external database IP access. Supply the final Vercel origin as `CORS_ORIGINS`; the Blueprint supplies the private `DATABASE_URL`, `WORKSPACE_MODE=demo` and `AUTO_SEED_DEMO=true`. Standard `postgres://` and `postgresql://` URLs are normalized to psycopg by the backend. Never expose the connection string in frontend variables.
3. The Docker command runs `alembic upgrade head`, guarded `python -m app.bootstrap`, then Uvicorn on `$PORT`; health path is `/api/health`. Bootstrap fills an empty demo once, preserves existing records on restarts and refuses real-data workspaces. Free Render services do not have a hosting shell or one-off jobs, so seeding does not depend on either. For multiple replicas, run migrations once as a release/predeploy step instead of competing startup migrations.
4. For a clean real-data workspace, use a separate database, `WORKSPACE_MODE=real` and `AUTO_SEED_DEMO=false`; initialize only its workspace with `python -m app.seed --empty` after migrations through an authorized administration environment. Public shared installations must remain synthetic demos until access controls exist.
5. In Vercel, import the same repository, choose **Root Directory: `frontend`**, Node 24, install `npm ci`, build `npm run build`. Allow build access to files outside the root directory so the generated downloadable docs can include root README and `docs/`. Set `NEXT_PUBLIC_API_URL=https://YOUR-API-HOST/api` before building.
6. Set Render `CORS_ORIGINS=https://YOUR-VERCEL-HOST` (no trailing slash), restart the backend, and redeploy the frontend if its API URL changed.
7. Verify HTTPS health, populated products/settings, dashboard fetch, forecast, create/edit production, reserve/cancel/collect an order, import errors and mobile layout at the actual URL. Use `scripts/verify_live.py` and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Health alone does not establish working UI/API integration. Provision backups and restore testing for a durable installation.

The current free PostgreSQL database expires **23 November 2026 at 14:00:24 Asia/Qyzylorda (09:00:24 UTC)** and has no backups. The free API sleeps after 15 idle minutes and can take about a minute to wake. These are demonstration tiers. Arrange an export/migration or an explicitly approved paid database before expiry if data must survive. [Render free-instance documentation](https://render.com/docs/free), [Blueprint specification](https://render.com/docs/blueprint-spec).

Vercel builds reject missing, non-HTTPS or localhost API configuration so a public deployment cannot silently target a visitor's machine. Public URLs are recorded only after hosting confirms them and unauthenticated live checks succeed.

### Railway alternative

Set service root to `backend`; the included `railway.json` selects its Dockerfile and health check. Add PostgreSQL, set the same backend variables, run migrations (already in Docker startup) and seed explicitly. Point Vercel at the Railway HTTPS API origin and configure exact CORS origins. Never expose the database connection URL in frontend variables.

**Operational follow-up:** choose durable database storage before the current free database expires, configure backups and restore testing, and add authentication/authorization before storing private information. Local Docker Compose, broader PostgreSQL concurrency scenarios and load testing remain unverified; successful container startup, smoke checks and the targeted two-order race do not establish those broader guarantees.

## Security, privacy and operational limits

This is an **unauthenticated single-workspace MVP**. Anyone with API access can read/change data and reset a demo. It is unsuitable for confidential real-business information in a shared public environment. Restrict network access for demonstrations. Authentication, authorization and tenant isolation are required before private multi-tenant use.

Pydantic validates input; SQLAlchemy performs ORM operations; transactions guard inventory; CSV upload limits and explicit CORS origins are configured. Secrets come from environment variables. CORS is a browser policy, not access control. Real payments, notifications, delivery, fiscal receipts, legal food compliance, batch expiry, rate limiting and audit identity are not implemented. Orders are explicitly demo checkout. The application does not promise production readiness.

## Roadmap

Validated bakery pilots and data quality checks; authentication and tenant isolation; batch/expiry and allergen information; stockout-aware demand estimation; promotion/holiday covariates; calibrated prediction intervals; chronological baseline-vs-CatBoost comparison; PostgreSQL concurrency/load testing; observability, backup restore drills and payment integration if justified.

## Research sources

* [UNEP — Food Waste Index Report 2024](https://www.unep.org/resources/publication/food-waste-index-report-2024): primary international research about measuring food waste in households, retail and food service and establishing baselines. The official landing page was checked and redirects to the UNEP repository. It supports the measurement-first approach; it does not measure SAQTA's effects.
* [TSPM — Kazakhstan food-service establishments](https://www.tspm.kz/en/press/publications/hotels/the-number-of-food-service-establishments-in-kazakhstan-increased-by-17-5/): **secondary publication**, attributing establishment statistics to Kazakhstan's Bureau of National Statistics. Link checked. Restaurant/café totals are not a verified bakery customer count. Market size, willingness to pay and acquisition assumptions need primary validation and customer research.

## Official technology documentation

[Next.js](https://nextjs.org/docs) · [React](https://react.dev/) · [TypeScript](https://www.typescriptlang.org/docs/) · [Tailwind CSS](https://tailwindcss.com/docs) · [FastAPI](https://fastapi.tiangolo.com/) · [SQLAlchemy](https://docs.sqlalchemy.org/) · [PostgreSQL](https://www.postgresql.org/docs/) · [Alembic](https://alembic.sqlalchemy.org/) · [Recharts](https://recharts.org/) · [Docker](https://docs.docker.com/) · [Vercel](https://vercel.com/docs).

[CatBoost documentation](https://catboost.ai/docs/) is a future-integration reference only; CatBoost is not installed or used by this MVP.

## Brand assets

Original editable vector assets: `frontend/public/brand/saqta-symbol.svg`, `saqta-logo.svg`, `saqta-logo-dark.svg`, `favicon.svg`, `app-icon.svg`. The protected grain symbol joins preservation, food and a rising data signal. [`docs/BRAND.md`](docs/BRAND.md) documents exact colors, typography, spacing, background variants and correct/incorrect use. No third-party brand marks or invented partnerships are used.
