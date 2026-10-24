# SAQTA

**Predict demand. Save food. Protect tomorrow.**

SAQTA is a working food waste prevention MVP for bakeries, originating in Kazakhstan with an initial focus on Astana. Its name comes from Kazakh **сақта**: keep, preserve or protect. The interface is Russian and money is displayed in Kazakhstani tenge (₸).

**SAQTA Forecast** supports production decisions before surplus occurs. **SAQTA Save** offers eligible remaining products for discounted pickup, with free publication and a modeled 5% commission only on confirmed discounted sales. Forecasts are decision aids; unsold products are not automatically waste.

The existing public synthetic demo is [SAQTA](https://saqta-batyrkekw.vercel.app), with [API documentation](https://saqta-api.onrender.com/docs) and [health status](https://saqta-api.onrender.com/api/health). **This architecture/assortment/subscription/5% commission update is local source until a new release is recorded in `docs/VERIFICATION.md`.** The previous unified-product release, final documentation commit `19618ed`, was publicly verified on 24 October 2026; its 45 checks do not verify this new implementation.

Public demo access remains anonymous and synthetic-only. The updated real-data mode implements owner authentication, organization isolation, revocable bearer sessions, and server-enforced manually activated Forecast subscriptions. Use a separate private real-data deployment; never upload private files or respondent/customer information to the shared public demo. Security gaps and exact access behavior are documented in `docs/ACCESS.md`.

## Product structure

The main navigation is **Прогнозирование · SAQTA Save · О проекте**. Forecast contains related tools inside one workspace, rather than separate top-level panels.

| URL | Functionality |
|---|---|
| `/` | Public product introduction, original SVG identity and working product links |
| `/forecast?view=forecast` | Assortment-wide forecast, product priorities/risks, branch/organization scope and per-product explanations |
| `/forecast?view=data` | Catalog, production/sales/write-offs, live stock, import preview and CSV export |
| `/forecast?view=data&settings=1` | Bakery profile, safety buffer, source status and explicitly confirmed demo reset |
| `/forecast?view=results` | Historical backtest, with expandable operational analytics and collected-order/write-off reporting |
| `/forecast?view=savings` | Editable bakery cost-saving scenarios; no default assumed improvement |
| `/forecast?view=pricing` | Preliminary Forecast plans and honest connection status |
| `/save` | Free publication, editable announcements, idempotent reservations, collection and separate 5% modeled commission accounting |
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

Prices and display information live in `frontend/src/features/forecast/pricing.config.ts`; authoritative real-mode entitlements are checked by `backend/app/services/subscriptions.py`. Subscription state belongs to the organization.

| Plan | Preliminary monthly price | Active products eligible for Forecast | Successful forecast runs/month | Locations |
|---|---:|---:|---:|---:|
| Free / inactive Forecast | 0 ₸ | 3 | 0 | 1 |
| Starter | 15,000 ₸ | 20 | 300 | 1 |
| Pro | 30,000 ₸ | 100 | 1,000 | 10 |

Real-mode Forecast/import/backtest operations require an active unexpired Starter/Pro subscription; inactive or expired access returns HTTP 402. Forecast runs are counted atomically by the local calendar month. A successful assortment run costs one run regardless of its product count; exhausted quota returns 429, failures and insufficient-history-only diagnostics do not consume it, and idempotent replays do not consume it twice. Product/location limits for Forecast analysis are enforced on the server. Catalog creation/reactivation and free Save publication are independent of those Forecast product quotas; a fourth or later Save product does not require a paid Forecast plan. Demo access is explicitly unpaid (`access_mode: demo`, `active: false`) and has no paid quota. Free organization-owned Save publication remains available without a Forecast subscription.

No payment provider is connected. An operator can activate an actual registered organization using `python -m app.subscription_admin --email owner@example.com --plan starter --days 30` in a separate real environment; there is no public self-activation endpoint and no money is charged. The real-mode application reports its persisted plan/status/expiry/remaining allowance. SAQTA Save publication costs **0 ₸**; a **5% modeled sales commission** is recorded only on collection, based on the discounted order total. It is not a listing fee or a transfer of real money.

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
  API --> Access[Owner session / tenant scope / subscription checks]
  Access --> Forecast[Assortment forecast / rolling backtest]
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

Forecast calculations are independent of API/database layers. Import preview does not write records. An authenticated request scope restricts ORM reads/writes to the organization, while separate subscription checks gate paid operations. Confirmed imports, forecast usage and orders use database transactions.

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
| `AUTH_SESSION_HOURS` | Backend | Revocable real-owner bearer session lifetime; default 168 hours |
| `AUTH_REGISTRATION_ENABLED` | Backend | Enable real organization registration; default true, ignored for demo registration refusal |
| `NEXT_PUBLIC_API_URL` | Frontend build | API base including `/api`, e.g. `http://127.0.0.1:8000/api` |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Compose | Database configuration in ignored root `.env` |
| `PORT` | Deployment | Provider-assigned application port |

`NEXT_PUBLIC_` values are public. Never place database URLs, tokens or credentials there. Read `.env.example` files for defaults; do not publish actual environment files.

## Database, migrations and demo data

Run `alembic upgrade head` before initialization or startup. The existing import revision `c83f42d78b91` is followed by these additive revisions:

1. `b7a1f2d4e6c8`: organization owner/session/subscription/usage tables and unambiguous order ownership backfill.
2. `d1e2f3a4b5c6`: independently sourced daily forecast observations and persisted idempotent assortment runs.
3. `e4f5a6b7c8d9`: discounted-sale commission/proceeds accounting, order idempotency and explicit verification-record markers.

No migration deletes customer records or resets the demo. Existing collected orders receive a historical 5% business-model estimate with `commission_recorded_at=NULL`, not a retroactive charge. Known historical demo QA records are flagged by tightly constrained provenance; arbitrary names and real customer rows are not deleted. Back up durable data before migration. Downgrades drop the new fields/tables and are maintenance operations, not deployment steps.

The reproducible synthetic seed provides **42 days × 5 products × 2 Astana locations**. It includes weekday/weekend patterns, production, sales, write-offs, live stock, listings and demo orders. PRNG seed is `24042`; `DEMO_ANCHOR_DATE=2026-10-24` fixes historical dates. Live pickup windows use execution time. History does not roll forward automatically.

`python -m app.seed` is idempotent for an initialized bakery. Explicit reset is available inside Forecast → Данные → Настройки with confirmation `RESET SAQTA DEMO`, or:

```powershell
cd backend
.venv/Scripts/python -m app.seed --reset
```

Reset deletes demo records only after refusing any database containing a real organization, including real organizations hidden by the demo request scope. Never run it as part of deployment or data migration.

For a **separate private real-data database**, set `WORKSPACE_MODE=real`, `AUTO_SEED_DEMO=false`, its own `DATABASE_URL`, HTTPS and an exact private frontend origin; run `alembic upgrade head`. Register through the real-mode UI/API to create an organization, one actual branch and its owner. No seed is necessary. Real registration is disabled in DEMO. The legacy `seed --empty` maintenance command creates no owner credentials and is not the new-customer onboarding path. Manual activation and bearer-session details are in `docs/ACCESS.md`.

### Relational model and stock rules

Bakery owns BakeryLocation and Product. ProductionRecord, SalesRecord and WasteRecord are the dated stock ledger. InventorySnapshot holds unique product/location live `on_hand` and `reserved` values. Forecast stores computed results and explanation components. SurplusListing allocates stock; Order/OrderItem retain status, reservation price and accounting weight. Write-offs snapshot unit cost and weight. ApplicationSettings stores buffer and source origin. ImportBatch records file hash, source, sheet, mapping and counts; ImportFingerprint prevents repeated semantic rows within a bakery.

Foreign keys, quantity/price constraints, indexes and timestamps are implemented. Catalog/ledger prices use **integer KZT**; commission and seller proceeds use **integer tiyn** (1 ₸ = 100 tiyn), preserving exact 5% arithmetic. Quantities are integer units and weights grams. AuthUser/AuthSession hold the organization owner and hashed revocable sessions; Subscription/SubscriptionUsage/QuotaEvent hold real access and monthly usage. ForecastObservation retains sourced complete daily totals independently of stock; ForecastRun stores organization-owned assortment results and request identity.

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
2. **Map:** choose a sheet and import mode. `observations` maps date, sold quantity, product/SKU, optional remaining/produced/price/unit/branch. `ledger` retains record-kind accounting imports. Existing product names/IDs must resolve unambiguously; create catalog entries first. A single branch is selected automatically, while multiple branches require a mapping/default.
3. **Preview:** validate dates, whole numbers, units, duplicate identities and historical/live inventory. Review ready/duplicate/error rows and warnings before writing.
4. **Commit:** submit the same file/options and preview token with `IMPORT SAQTA`. Any invalid row blocks the batch. Valid semantic duplicates are skipped; concurrent conflicts roll back the whole transaction.

Limits: **2 MB**, **5,000 rows per sheet**, **80 columns**, **25 XLSX sheets**, **32 MB expanded XLSX content**. CSV is UTF-8 with comma, semicolon or tab separation. `.xls`, `.xlsm`, encrypted workbooks and formulas are unsupported. Date format is explicitly ISO or day-month-year; decimal separator selection never rounds fractional quantities into units. Ledger movement quantities must be positive. Daily observation mode accepts explicit zero sales; absent stock/production stays NULL. Unit conversions are not guessed.

Deduplication is semantic and works across renamed files; intentionally identical separate operations need aggregation or manual review. Stock is revalidated at commit, so a stale preview may require another check. The raw uploaded file is not stored; provenance and committed records are persisted.

Daily observation imports do not invent stock movements or create availability for Save. A dated optional remaining quantity can inform conditional forecast recommendations, with freshness/provenance warnings; observations do not silently overwrite the inventory ledger. Duplicate or conflicting product/branch/day totals are surfaced. The legacy `POST /api/import` remains DEMO-only for canonical CSV, without duplicate protection; real mode requires the preview/confirmation flow. `GET /api/export` retains canonical columns and date/location filters. A canonical sample is:

```csv
kind,product_id,location_id,date,quantity,reason,unit_price_kzt
production,1,1,2026-10-24,40,,
sales,1,1,2026-10-24,25,,750
waste,1,1,2026-10-24,2,Повреждение упаковки,
```

## Forecast methodology and historical evaluation

The main request `POST /api/forecast-runs` takes a date, horizon and optional branch, not a mandatory product. It evaluates every active product/branch pair in the current organization and returns demand, data quality, conditional production, shortage/surplus/volatility/missing-history priorities and numeric explanations. An omitted branch means the whole organization; branches are forecast independently before totals are added. Detail filters do not determine which products are analyzed.

Only dates with actual ledger sales or explicitly imported complete daily sales totals enter the model. An imported daily total takes precedence over ledger sales for the same product/branch/day, with an overlap warning; it is not added twice. Production-only/write-off-only dates and absent calendar days are **not** imputed as zero. Explicit observation sales of zero are retained.

For each target date, use only earlier observations: recent mean of the latest 7 observed dates and mean of up to 4 earlier matching weekdays; demand is `0.6 × recent + 0.4 × weekday`, falling back to the recent mean without matching weekdays. The minimum is 3 observed dates. There is no fitted external-data model.

Production is `max(0, ceil(predicted_demand × (1 + buffer/100)) − available_inventory)` only when stock is supported by inventory records or a recent imported physical snapshot. Save reservations are excluded. If stock is unknown, production/surplus/cost-risk values remain NULL and the API says what is missing. Imported physical stock does not create sellable Save inventory. Across multiple days the initial inventory is considered once; forecast future surplus is not assumed fresh for reuse. Each result exposes actual dates/quantities, means, weights and arithmetic.

`GET /api/backtest` uses an expanding chronological window: by default 14 prior observed dates plus 7 held-out dates. Both the statistical method and last-observed-sales comparison use the same test days, strictly excluding each test date and future outcomes from training. MAE is mean absolute error; WAPE is `sum(abs(error))/sum(actual) × 100`, null when the actual sum is zero. Insufficient history returns null metrics and requirements. Synthetic scores do not establish real bakery accuracy; forecast values are not guarantees.

Weather, holidays, promotions, availability/stockout censoring, expiry and opening days are not modeled. Real sales can understate demand during stockouts. Longer verified daily series and stock reconciliation are needed before operational accuracy claims. CatBoost is a future comparison, not implemented.

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

## SAQTA Save commission accounting

Publishing a listing costs **0 ₸**. Only the transition from reserved to confirmed collected records the modeled platform commission: `discounted_sale_total × 5%`. Original retail price is shown separately and never used as the commission base. For a **2,000 ₸ discounted sale**, the modeled commission is **100 ₸** and seller proceeds **1,900 ₸**. Integer tiyn avoid fractional-tenge rounding: fee = integer-KZT total × 5 tiyn, seller = total × 95 tiyn.

Reserved/cancelled orders have zero due commission and proceeds; a reservation may show a clearly separate estimate. Repeated collection is rejected and cannot record a second sale/commission. Order keys replay the same intended order rather than creating another reservation; a changed body with the same key conflicts. Old collected rows are marked historical estimates with no recorded-charge time, not retroactively charged. Real payment collection, refunds after collection and seller payouts are not integrated; every settlement response says `payments_processed:false`.

## API documentation

FastAPI serves `/docs` and `/openapi.json`; business routes use `/api`. The typed frontend client uses the configured API base. Full public payloads are in `docs/API_CONTRACT.md`.

| Group | Endpoints under `/api` |
|---|---|
| Workspace | `GET /health`, `GET/PATCH /bakery`, `GET /locations`, `GET/PATCH /settings` |
| Catalog/ledger | `GET/POST /products`, `PATCH /products/{id}`, `GET/POST /records`, `PATCH /records/{kind}/{id}`, `GET /inventory` |
| Forecast | `POST /forecast-runs`, legacy `POST/GET /forecasts`, `GET /history`, `GET /backtest` |
| Organization access | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `GET /subscription`, `POST /locations` |
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

Tests cover forecasts/backtesting without future leakage or invented zero days, missing stock, assortment-wide scope, observation imports, authentication/tenant boundaries, server entitlement/expiry, atomic last-slot quota, request replay, order state/overselling and exact commission arithmetic. **Local checks passed: 151 backend tests, 78 frontend tests, strict TypeScript and lint checks**; the production frontend build also passed; this source has not been deployed and must be recorded in `docs/VERIFICATION.md`; older 86/63 unit and 45 public checks belong to the previous release. Local focused authentication and migration tests have executed, but do not establish new public deployment or PostgreSQL behavior.

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

The public demo is anonymous and contains synthetic data only. Separate real mode now implements salted scrypt passwords, hashed expiring/revocable bearer sessions, organization-scoped ORM queries/writes and server-enforced subscriptions. CORS is not authentication. This is application-level isolation, not PostgreSQL RLS or a security certification. Real-mode Save is scoped to the signed-in organization; a public multi-seller buyer identity/checkout system is not implemented.

No real payment, payout, fiscal receipt, email verification/password recovery/MFA, outbound notifications, batch/expiry system, trained neural model or commercial security certification is claimed. Registration/login rate limiting, abuse controls, invitations/roles, audit logging, independent security review, durable backups and restore drills remain necessary before sensitive commercial onboarding. The detailed private setup and limitations are in `docs/ACCESS.md`.

The real workbook is a single questionnaire response, so real forecasting accuracy is unestablished. Catalog entries must exist before importing their observations. Subscription prices require business validation. Broader PostgreSQL concurrency/load tests, local Docker Compose, full mobile/cross-browser and accessibility certification remain unverified unless a later release report establishes them.

Roadmap: verified daily bakery data; opening-day/availability and stockout-aware demand; batch/expiry tracking; longer chronological evaluation/calibrated intervals; optional CatBoost comparison; hardened owner authentication and roles; observability, durable backups and eventual real billing only after the subscription/business process is ready.

## Research and official documentation

* [UNEP — Food Waste Index Report 2024](https://www.unep.org/resources/publication/food-waste-index-report-2024): primary research on food-waste measurement and baselines, not evidence of SAQTA outcomes. The link was checked during the original implementation.
* [TSPM — Kazakhstan food-service establishments](https://www.tspm.kz/en/press/publications/hotels/the-number-of-food-service-establishments-in-kazakhstan-increased-by-17-5/): secondary reporting attributing statistics to official sources. Restaurant/café totals are not a verified bakery customer count; market and willingness-to-pay assumptions require validation. The link was checked during the original implementation.

[Next.js](https://nextjs.org/docs) · [React](https://react.dev/) · [TypeScript](https://www.typescriptlang.org/docs/) · [Tailwind CSS](https://tailwindcss.com/docs) · [FastAPI](https://fastapi.tiangolo.com/) · [SQLAlchemy](https://docs.sqlalchemy.org/) · [PostgreSQL](https://www.postgresql.org/docs/) · [Alembic](https://alembic.sqlalchemy.org/) · [Recharts](https://recharts.org/) · [Docker](https://docs.docker.com/) · [Vercel](https://vercel.com/docs) · [openpyxl](https://openpyxl.readthedocs.io/).

[CatBoost documentation](https://catboost.ai/docs/) is a future-reference link only; CatBoost is not installed or used.

## Brand assets

Original editable assets live in `frontend/public/brand/`: `saqta-symbol.svg`, `saqta-logo.svg`, `saqta-logo-dark.svg`, `favicon.svg`, `app-icon.svg`. The protected grain symbol combines preservation, food and a rising data signal. `docs/BRAND.md` documents colors, typography, spacing and correct usage. No third-party logos, invented customer references or partnerships are used.
