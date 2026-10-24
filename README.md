# SAQTA

**Predict demand. Save food. Protect tomorrow.**

SAQTA is a working food waste prevention MVP for bakeries, originating in Kazakhstan with an initial focus on Astana. Its name comes from Kazakh **сақта**: keep, preserve or protect. The interface is Russian and money is displayed in Kazakhstani tenge (₸).

**SAQTA Forecast** supports production decisions before surplus occurs. **SAQTA Save** offers eligible remaining products for discounted pickup, with free publication and no publication commission. Forecasts are decision aids; unsold products are not automatically waste.

The updated public synthetic demo is [SAQTA](https://saqta-batyrkekw.vercel.app), with [API documentation](https://saqta-api.onrender.com/docs) and [health status](https://saqta-api.onrender.com/api/health). The unified Forecast/Save/About release was deployed and verified on **24 October 2026**: **45/45 public API/integration checks passed** against PostgreSQL, including new imports/backtesting and the marketplace concurrency case. Public browser checks confirmed numeric forecast explanations, backtest metrics/source warnings, the exact paid-plan notice and compact three-item navigation. Details and remaining verification boundaries are in `docs/VERIFICATION.md`.

The public demo has **no authentication or tenant isolation**. Never upload private bakery files, respondent answers or customer information to it. A separate real-data workspace also requires access controls before private use.

## Product structure

The main navigation is **Прогнозирование · SAQTA Save · О проекте**. Forecast contains related tools inside one workspace, rather than separate top-level panels.

| URL | Functionality |
|---|---|
| `/` | Public product introduction, original SVG identity and working product links |
| `/forecast?view=forecast` | Product/location/date/horizon, production recommendation, history and explanation |
| `/forecast?view=data` | Catalog, production/sales/write-offs, live stock, import preview and CSV export |
| `/forecast?view=data&settings=1` | Bakery profile, safety buffer, source status and explicitly confirmed demo reset |
| `/forecast?view=results` | Historical backtest, with expandable operational analytics and collected-order/write-off reporting |
| `/forecast?view=savings` | Editable bakery cost-saving scenarios; no default assumed improvement |
| `/forecast?view=pricing` | Preliminary Forecast plans and honest connection status |
| `/save` | Free listing publication/editing, generated editable announcement text, reservations, cancellation and collection |
| `/about` | Product purpose, Forecast/Save relationship and connection information |
| `/docs` | Public technical documentation and API links |

Legacy routes remain usable: `/dashboard` and `/impact` redirect to Forecast results; `/inventory` redirects to data; `/settings` opens data/settings; `/economics` redirects to Forecast pricing. Their useful data/API functions are preserved. Internal startup financial calculations are absent from the public interface.

Loading, empty and error states do not fabricate fallback metrics. Synthetic data is labeled DEMO; catalog weights and costs are supplied values, not independent measurements.

## Four implemented tools

1. **Savings scenarios:** user-entered monthly quantities, cost, selling price, subscription and assumed write-off reduction. The assumed reduction starts at **0%**. Loss, revenue, gross profit and cost-saving effect are calculated separately.
2. **Historical backtest:** rolling chronological forecasts using only observations preceding each test date; MAE and WAPE compared with the last observed sales value. Insufficient history returns requirements and null metrics.
3. **Explainable forecasts:** actual contributing sales dates/quantities, recent and same-weekday means, weights, their difference, inventory, buffer and exact production formulas for each forecast day.
4. **Save announcement generator:** deterministic text from the entered product, quantity, prices, pickup window and description. The bakery can edit and copy it before publication. It does not invent ingredients, allergens, certificates, freshness or availability.

No LLM, paid AI API, neural network, GPU or CatBoost is implemented or required. The demand model is an explainable statistical baseline.

## Preliminary Forecast plans

Prices and quotas are configured in one place: `frontend/src/features/forecast/pricing.config.ts`.

| Plan | Preliminary monthly price | Proposed products | Proposed forecast requests/month | Proposed locations |
|---|---:|---:|---:|---|
| Free | 0 ₸ | 3 | 10 | 1 |
| Starter | 15,000 ₸ | 20 | 300 | 1 |
| Pro | 30,000 ₸ | 100 | 1,000 | Multiple configured locations |

These are proposals, not enforced entitlements. All implemented tools remain available in the shared unauthenticated demo. One forecast request covers one product/location and a 1–14-day horizon. Payment and subscription activation are not connected; no plan is shown as active and no payment success is simulated. SAQTA Save publication costs **0 ₸ with 0% publication commission on every plan**, including Free.

Paid buttons display the requested notice, without collecting a request or setting up notifications:

> **Подключение тарифов**
>
> Платные тарифы SAQTA Forecast находятся на этапе подготовки. Выбор тарифа пока не запускает оплату или активацию подписки. Мы сообщим о доступности подключения, когда процесс будет готов. SAQTA Save остаётся бесплатным для размещения остатков.

The notice closes with «Понятно». Forecast accuracy, savings and profit growth are not guaranteed by any proposed plan.

## Architecture

```mermaid
flowchart LR
  User[Bakery manager / demo customer] --> Web[Next.js App Router · Russian UI]
  Web -->|Typed HTTP /api| API[FastAPI + Pydantic]
  API --> Forecast[Statistical forecast / rolling backtest]
  API --> Operations[Inventory / listings / orders]
  API --> Analytics[Recorded operational and impact metrics]
  Files[CSV / XLSX] --> Inspect[Inspect / map / preview / confirm]
  Inspect --> API
  Forecast --> ORM[SQLAlchemy 2.x]
  Operations --> ORM
  Analytics --> ORM
  ORM --> DB[(PostgreSQL / local SQLite)]
  Alembic[Additive Alembic migrations] --> DB
  Synthetic[Separate reproducible DEMO seed] --> DB
```

Forecast calculations are independent of API/database layers. Import preview does not write ledger records. Confirmed imports and orders use database transactions.

## Actual stack and versions

Exact versions are pinned in `frontend/package-lock.json`, `backend/requirements.lock.txt` and documented in `docs/VERSIONS.md`.

| Layer | Installed technology |
|---|---|
| Frontend | Next.js 16.4.3, React/React DOM 19.3.1, strict TypeScript 5.9.3, Tailwind CSS 4.3.3 |
| UI/data | Recharts 3.10.1, Lucide React 1.61.0, React Hook Form 7.91.0, Zod 4.6.7 |
| API | Python 3.12, FastAPI 0.119.0, Pydantic 2.14.1, Uvicorn 0.37.0 |
| Storage | SQLAlchemy 2.0.43, Alembic 1.16.5, psycopg 3.2.10; PostgreSQL deployment / optional SQLite local fallback |
| Data preparation | Pandas 2.3.2, openpyxl 3.1.5, et_xmlfile 2.0.0 |
| Verification | Pytest 8.4.2, Vitest 4.1.12, React Testing Library 16.3.3, Ruff 0.13.1, ESLint 9.39.5 |

Local verification uses Python 3.12.5 and Node.js 25.2.1. Use **Node.js 24 LTS** for deployment. Docker targets Node 24/Python 3.12/PostgreSQL 17; successful local SQLite tests do not verify a Docker or PostgreSQL installation.

## Repository structure

```text
frontend/
  src/app/                 Routes, server boundaries and legacy redirects
  src/features/forecast/   Forecast, explanations, backtest, savings and pricing
  src/features/workspace/  Reusable catalog, analytics and settings
  src/features/save/       Deterministic announcement generation
  src/components/          Responsive shell, forms, import workflow and charts
  src/lib/                 Typed API client
  src/types/               Shared API types
  public/brand/            Original editable SVG identity
  tests/                   Vitest / React Testing Library
backend/
  app/api/                 REST endpoints and import/backtest routers
  app/forecasting/         Baseline, per-day explanation and chronological evaluation
  app/services/            Inventory, orders, validated imports and source guards
  app/models/              Relational schema and import provenance
  app/analytics/           Recorded operational/impact calculations
  alembic/                 Additive migrations
  tests/                   Pytest unit/integration tests
scripts/                   Preparation, public smoke and concurrency checks
data/demo/                 Synthetic example and seed instructions
data/private/              Ignored real source/preparation outputs; never deploy
docs/                      Brand, contract, source report, deployment and verification
docker-compose.yml         PostgreSQL + API + web
render.yaml                Backend/PostgreSQL Blueprint
```

## Prerequisites and local setup

Install Python **3.12+**, Node.js **24 LTS**, npm and optionally Docker Compose. PostgreSQL is recommended for deployment; SQLite is a local fallback. No credentials are committed.

From the repository root in PowerShell:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.lock.txt
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env.local
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

Open [local SAQTA](http://127.0.0.1:3000), [health](http://127.0.0.1:8000/api/health) or [OpenAPI](http://127.0.0.1:8000/docs). On macOS/Linux use `.venv/bin/python` and `cp`. Run backend commands from `backend/`, where relative SQLite paths resolve.

For the local production frontend run `npm run build`, then `npm start`. `NEXT_PUBLIC_API_URL` is embedded at **build time**; rebuild when it changes.

## Environment variables

| Variable | Scope | Purpose |
|---|---|---|
| `DATABASE_URL` | Backend | `sqlite:///./saqta.db` locally or private `postgresql+psycopg://USER:PASSWORD@HOST:5432/DB` |
| `WORKSPACE_MODE` | Backend | `demo` or `real` initialization/reset policy; persisted origin also protects existing data labels |
| `AUTO_SEED_DEMO` | Backend | Default false; optional guarded bootstrap of an empty demo, preserving existing records |
| `CORS_ORIGINS` | Backend | Explicit comma-separated allowed frontend origins |
| `SAQTA_TIMEZONE` | Backend | Default `Asia/Qyzylorda` for local business dates |
| `DEMO_ANCHOR_DATE` | Seed | Optional ISO anchor for reproducible historical dates |
| `NEXT_PUBLIC_API_URL` | Frontend build | API base including `/api`, e.g. `http://127.0.0.1:8000/api` |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Compose | Database configuration in ignored root `.env` |
| `PORT` | Deployment | Provider-assigned application port |

`NEXT_PUBLIC_` values are public. Never place database URLs, tokens or credentials there. Read `.env.example` files for defaults; do not publish actual environment files.

## Database, migrations and demo data

Run `alembic upgrade head` before initialization or startup. The additive revision **`c83f42d78b91`**, after `ee2260d736c6`, adds `import_batches` and unique `import_fingerprints`; it does not erase historical records or relabel origins. Existing databases require this migration before confirmed imports work. Back up durable data before migration; a downgrade removes the new provenance tables.

The reproducible synthetic seed provides **42 days × 5 products × 2 Astana locations**. It includes weekday/weekend patterns, production, sales, write-offs, live stock, listings and demo orders. PRNG seed is `24042`; `DEMO_ANCHOR_DATE=2026-10-24` fixes historical dates. Live pickup windows use execution time. History does not roll forward automatically.

`python -m app.seed` is idempotent for an initialized bakery. Explicit reset is available inside Forecast → Данные → Настройки with confirmation `RESET SAQTA DEMO`, or:

```powershell
cd backend
.venv/Scripts/python -m app.seed --reset
```

Reset deletes the configured demo's records and is refused for real workspaces. Never run it as part of deployment or data migration.

For a **separate private real-data database**, set `WORKSPACE_MODE=real`, `AUTO_SEED_DEMO=false` and its own `DATABASE_URL`, then run:

```powershell
cd backend
.venv/Scripts/python -m alembic upgrade head
.venv/Scripts/python -m app.seed --empty
```

This creates the workspace, placeholder location and settings without synthetic business records. Real origin is persisted in ApplicationSettings. Changing an environment variable cannot convert a synthetic database into a real one. Private access controls remain necessary.

### Relational model and stock rules

Bakery owns BakeryLocation and Product. ProductionRecord, SalesRecord and WasteRecord are the dated stock ledger. InventorySnapshot holds unique product/location live `on_hand` and `reserved` values. Forecast stores computed results and explanation components. SurplusListing allocates stock; Order/OrderItem retain status, reservation price and accounting weight. Write-offs snapshot unit cost and weight. ApplicationSettings stores buffer and source origin. ImportBatch records file hash, source, sheet, mapping and counts; ImportFingerprint prevents repeated semantic rows within a bakery.

Foreign keys, quantity/price constraints, indexes and timestamps are implemented. Money uses **integer KZT**; quantities are integer units and weights grams.

Production adds stock. Normal sales and write-offs consume unallocated inventory. Listings allocate stock; orders reserve listing availability. Collection deducts stock and records sales once; cancellation before deadline restores listing availability. Guarded conditional updates and transactions prevent partial or oversold orders. Conflicting edits surface errors instead of silently changing quantities.

Stock and active listing counts are **live**, independent of period filters. Production/sales/write-offs are date-filtered flows. Operational next-day demand refers to the day after the selected period ends. The bakery must check freshness, expiry, storage and allergens; SAQTA does not certify food safety or track batches.

## Real workbook inspection and preparation

The provided real XLSX was inspected read-only: **1 worksheet, 16 columns, 1 Google Forms response, 0 missing cells and 0 exact duplicate responses**. It is a survey, not a daily operational ledger, and yields **0 verified daily sales observations**. No questionnaire answer was converted into invented historical demand or imported into production records.

The unchanged source SHA256, schema-only quality report, provenance and transformations are documented in `docs/DATA_REPORT.md`. No private answers, respondent names or contacts are reproduced here. Raw and normalized outputs stay in ignored `data/private/` and are excluded from public uploads. The existing synthetic seed remains separate and explicitly labeled.

To repeat preparation in a private environment from the repository root:

```powershell
backend/.venv/Scripts/python scripts/prepare_bakery_data.py --input C:/path/to/workbook.xlsx --output-dir data/private --report docs/DATA_REPORT.md
```

Outputs include normalized survey JSON, provenance/quality JSON and a **header-only** daily-history template. Unicode/whitespace and native dates are normalized; missing values and duplicates remain flagged. No synthetic daily dataset is presented as real. Collect actual dated product/location sales, production and reconciliation records before real forecasting evaluation.

## CSV/XLSX inspect → preview → commit

Inside Forecast → Данные, choose the source origin first. The UI blocks a real-origin file before sending it to a public demo; the backend independently enforces the persisted workspace origin. Do not select DEMO for a real file to bypass this guard.

1. **Inspect:** upload CSV or ordinary XLSX and review sheets, headers, classification and up to five sample rows. Survey files cannot become ledger imports.
2. **Map:** choose a sheet and map date, quantity, record kind, product, location and optional units/price/reason. Product/location/kind may use explicit defaults. Existing names/IDs must resolve unambiguously.
3. **Preview:** validate dates, whole numbers, units, duplicate identities and historical/live inventory. Review ready/duplicate/error rows and warnings before writing.
4. **Commit:** submit the same file/options and preview token with `IMPORT SAQTA`. Any invalid row blocks the batch. Valid semantic duplicates are skipped; concurrent conflicts roll back the whole transaction.

Limits: **2 MB**, **5,000 rows per sheet**, **80 columns**, **25 XLSX sheets**, **32 MB expanded XLSX content**. CSV is UTF-8 with comma, semicolon or tab separation. `.xls`, `.xlsm`, encrypted workbooks and formulas are unsupported. Date format is explicitly ISO or day-month-year; decimal separator selection never rounds fractional quantities into units. Zero quantities are rejected explicitly, not silently dropped. Unit conversions are not guessed.

Deduplication is semantic and works across renamed files; intentionally identical separate operations need aggregation or manual review. Stock is revalidated at commit, so a stale preview may require another check. The raw uploaded file is not stored; provenance and committed records are persisted.

The legacy `POST /api/import` remains compatible for canonical CSV. It performs atomic row validation but **does not provide duplicate prevention**; the UI uses the new flow. `GET /api/export` retains canonical columns and date/location filters. A canonical sample is:

```csv
kind,product_id,location_id,date,quantity,reason,unit_price_kzt
production,1,1,2026-10-24,40,,
sales,1,1,2026-10-24,25,,750
waste,1,1,2026-10-24,2,Повреждение упаковки,
```

## Forecast methodology and historical evaluation

For each product/location and target date:

1. Use only observations strictly before the target.
2. Average the last **7 observed dates**, not necessarily 7 calendar days.
3. Average up to **4 previous observations matching the target weekday**.
4. Demand is **0.6 × recent mean + 0.4 × weekday mean**; without matching weekdays it is the recent mean. Nonnegative demand is rounded to units for production.
5. Production is `max(0, ceil(demand × (1 + buffer_percent/100)) − available_inventory)`. Reserved Save stock is excluded. Across a multi-day horizon the initial stock is consumed once; forecast surplus from future production is not assumed fresh for later days.

Each new forecast response includes actual samples, means, coefficients, weekday difference, buffer, inventory and exact per-day demand/production formulas in `explanation_components`. Earlier saved results can lack this additive field. No reasons or external covariates are invented.

Historical `GET /api/backtest` uses a rolling chronological window, with a minimum **14 prior observations** and **7 test observations** by default. A full requested window is required; insufficient history returns null MAE/WAPE and data requirements. Both models are scored on the same days. The comparison predicts the last observed sales value. MAE is mean absolute error; WAPE is `sum(abs(error)) / sum(actual_sales) × 100`, and is null when total actual sales is zero. Statistical demand is evaluated before final unit rounding. No `100 − WAPE` accuracy claim is made.

Every test prediction excludes that day's sales and all later values. Output includes sample count, test period, training end dates, baseline metrics, origin and reliability warnings. Synthetic results verify mechanics, **not real bakery accuracy**. Small windows are unreliable evidence of future performance.

Completely absent calendar days are not filled. The existing ledger interprets days with production/write-offs but no sale entry as sales zero; this may represent zero sales or missing recording and is exposed as a limitation. Sales can understate demand during stockouts. Weather, holidays, promotions, expiry and stockout censoring are not modelled. Real data needs longer verified daily history, explicit zero-day handling, opening days and availability information. CatBoost remains a future comparison, not an implemented model.

## Savings and impact formulas

The manual savings model assumes one month, one product and one batch **without opening inventory**. It rejects negative values and sold + written-off quantities exceeding produced units.

* Write-off cost loss = written-off units × unit cost.
* Scenario avoided cost = write-off cost loss × **user-entered** reduction percentage, rounded to integer KZT.
* Effect after subscription = scenario avoided cost − monthly subscription cost.
* Sales revenue = sold units × selling price.
* Gross profit on sold units = sales revenue − sold units × unit cost; write-offs are shown separately.

Revenue and gross profit are **not added** to avoided cost to fabricate profit. Avoided production cost is hypothetical: if food is already produced, its cost has already been incurred. Fixed company expenses, taxes and implementation costs are excluded; this is not net profit or demonstrated SAQTA performance.

Recorded result metrics use **collected** order items only. Accounting weight is `sum(quantity × snapshotted catalog grams) / 1000`; recovered value is `sum(quantity × reservation price)`. Write-off weight/cost use snapshotted catalog values. Baseline is the preceding equal-length period under the same location filter. Percentage change is suppressed for a zero baseline or incomplete recorded coverage; coverage is a proxy, not independent verification of opening days. The 42-day seed cannot support a complete preceding 30-day baseline; a recent 14-day comparison can.

No unsupported CO₂ factors, causal impact claims or assumption that every discounted sale otherwise becomes waste is used. Potential avoided waste remains null without evidence. Missing unit cost contributes zero in recorded cost totals and should be completed before business interpretation.

## API documentation

FastAPI serves `/docs` and `/openapi.json`; business routes use `/api`. The typed frontend client uses the configured API base. Full public payloads are in `docs/API_CONTRACT.md`.

| Group | Endpoints under `/api` |
|---|---|
| Workspace | `GET /health`, `GET/PATCH /bakery`, `GET /locations`, `GET/PATCH /settings` |
| Catalog/ledger | `GET/POST /products`, `PATCH /products/{id}`, `GET/POST /records`, `PATCH /records/{kind}/{id}`, `GET /inventory` |
| Forecast | `POST/GET /forecasts`, `GET /history`, `GET /backtest` |
| Data | `POST /imports/inspect`, `POST /imports/preview`, `POST /imports/commit`, legacy `POST /import`, `GET /export`, `POST /demo/reset` |
| Results | `GET /dashboard`, `GET /impact` |
| Save | `GET/POST /listings`, `PATCH /listings/{id}`, `GET/POST /orders`, `POST /orders/{id}/cancel`, `POST /orders/{id}/collect` |

Records support pagination. Date filters are inclusive. Meaningful 422 validation errors and 409 stock/state conflicts use safe messages. CORS is explicitly configured and is not authentication.

## Tests, lint, types and build

```powershell
cd backend
.venv/Scripts/python -m pytest -q
.venv/Scripts/python -m ruff check app tests
.venv/Scripts/python -m pip check
cd ../frontend
npm test
npm run lint
npm run typecheck
npm run build
```

Tests cover calculations, future-data exclusion, chronological comparison, insufficient/zero-demand history, inventory and order transactions, overselling, import validation/rollback/deduplication, source separation, explanations and UI behavior. The current source passed **86 backend tests**, **63 frontend tests across 12 files**, Ruff, ESLint with zero warnings, strict TypeScript and the production frontend build (**12 static pages**). Fresh SQLite upgraded through all three migrations to `c83f42d78b91` and the 42-day synthetic seed loaded. Local browser forecast generation and numeric explanations worked. One upstream Starlette/AnyIO deprecation warning remains. The updated Render API was separately verified after PostgreSQL migration `ee2260d736c6` → `c83f42d78b91`, preserving existing records. The Vercel production release and **45/45 public checks** passed: new product integration 14/14, preserved compatibility 22/22 and a targeted order race 9/9. Public browser forecast, backtest, savings calculation, pricing notice, compact navigation and Save announcement generation/editing/copy/publication checks passed. Labeled synthetic QA ledger/collection/write-off records remain for traceability, so demo aggregates can include verification activity; QA entities were deactivated and their stock reconciled, without deleting records. `docs/VERIFICATION.md` separates these executed checks from broader unverified behavior.

## Deployment

For Docker Compose:

```powershell
Copy-Item .env.example .env
# Choose a strong POSTGRES_PASSWORD and review origins/URLs in the ignored .env.
docker compose up --build -d
docker compose exec backend python -m app.seed
```

Docker Compose was not executed on the current Windows machine. Render container/PostgreSQL deployment and live checks were executed separately from the local verification.

The Vercel frontend uses **Root Directory `frontend`**, Node 24, `npm ci`, `npm run build`, outside-root source access and build-time `NEXT_PUBLIC_API_URL=https://YOUR-API-HOST/api`. The Render Docker backend uses its private PostgreSQL `DATABASE_URL`, exact frontend `CORS_ORIGINS`, `/api/health`, and starts with migrations → guarded bootstrap → Uvicorn on `$PORT`. Never reset during startup. `render.yaml` and `backend/railway.json` support fresh Render/Railway setup.

The existing backend can auto-deploy from its reviewed Git branch; the existing frontend uses reviewed monorepo uploads rather than Git auto-deployment. This documentation edit does not deploy either service. Detailed existing-resource settings, safe update order, PostgreSQL migration requirements and exact remaining release checks are in `docs/DEPLOYMENT.md`.

**Exclude `data/private/`, all real XLSX/XLS files, credentials, local databases, environment files, generated artifacts, dependencies and authentication state from every source upload.** `frontend/scripts/copy-docs.mjs` only publishes README, BRAND and API_CONTRACT; private reports and internal documents are not included. The actual bakery workbook must never enter a public build or demo.

The previously provisioned free PostgreSQL resource expires **23 November 2026 at 14:00:24 Asia/Qyzylorda**, with no backups at initial verification; inspect current provider state before relying on it. Durable storage, backups/restore drills and access controls are required for real business deployment.

## Security, limitations and roadmap

This is an unauthenticated single-workspace MVP. Public visitors can inspect/change synthetic records and explicitly reset the demo. No tenant isolation, real payment, subscription enforcement, outbound notifications, fiscal receipt, batch/expiry system, trained neural model or production security certification is claimed. Real-origin imports require a separate workspace and cannot be made safe merely by changing an environment label.

The inspected real file is a survey, so real forecasting/backtest accuracy remains unestablished. Prices and quotas await validation; private business data needs authorization and access controls. Broader PostgreSQL concurrency/load testing, local Docker Compose, mobile/cross-browser coverage and backup restore drills remain verification boundaries unless a later release report establishes them.

Roadmap: validated daily bakery data; authentication/authorization and tenancy; explicit zero-sales and opening-day modelling; batch/expiry tracking; better stockout-aware demand; longer chronological evaluation and calibrated intervals; optional CatBoost comparison; observability, durable backups and enforceable subscription limits before commercial payments.

## Research and official documentation

* [UNEP — Food Waste Index Report 2024](https://www.unep.org/resources/publication/food-waste-index-report-2024): primary research on food-waste measurement and baselines, not evidence of SAQTA outcomes. The link was checked during the original implementation.
* [TSPM — Kazakhstan food-service establishments](https://www.tspm.kz/en/press/publications/hotels/the-number-of-food-service-establishments-in-kazakhstan-increased-by-17-5/): secondary reporting attributing statistics to official sources. Restaurant/café totals are not a verified bakery customer count; market and willingness-to-pay assumptions require validation. The link was checked during the original implementation.

[Next.js](https://nextjs.org/docs) · [React](https://react.dev/) · [TypeScript](https://www.typescriptlang.org/docs/) · [Tailwind CSS](https://tailwindcss.com/docs) · [FastAPI](https://fastapi.tiangolo.com/) · [SQLAlchemy](https://docs.sqlalchemy.org/) · [PostgreSQL](https://www.postgresql.org/docs/) · [Alembic](https://alembic.sqlalchemy.org/) · [Recharts](https://recharts.org/) · [Docker](https://docs.docker.com/) · [Vercel](https://vercel.com/docs) · [openpyxl](https://openpyxl.readthedocs.io/).

[CatBoost documentation](https://catboost.ai/docs/) is a future-reference link only; CatBoost is not installed or used.

## Brand assets

Original editable assets live in `frontend/public/brand/`: `saqta-symbol.svg`, `saqta-logo.svg`, `saqta-logo-dark.svg`, `favicon.svg`, `app-icon.svg`. The protected grain symbol combines preservation, food and a rising data signal. `docs/BRAND.md` documents colors, typography, spacing and correct usage. No third-party logos, invented customer references or partnerships are used.
