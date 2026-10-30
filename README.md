# SAQTA

SAQTA combines **SAVE**, a marketplace for available food, and **FORECAST**, private demand analysis based on a business’s own data. The interface supports **Қазақша · Русский · English**, including forms, validation, notifications and charts.

The home page at `/` offers direct access to SAVE and FORECAST, an interactive buyer/business overview and a short FAQ. Decorative motion can be paused and respects reduced-motion preferences. The SAQTA logo returns to this overview from either module.

The existing stack is preserved: **Next.js / React / TypeScript → FastAPI / SQLAlchemy → PostgreSQL**, with SQLite for local development. Production targets remain Vercel and Render. There is no Go server in this repository.

## Run locally

Requirements: Node.js 20.9+, Python 3.12+, and optionally Docker for PostgreSQL.

```sh
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.lock.txt
npm ci --prefix frontend
cp backend/.env.example backend/.env
./scripts/dev-local.sh
```

Open **http://127.0.0.1:3000**. The script applies migrations and starts the API on port 8001 and the frontend on 3000, with the matching API URL. It refuses to take over occupied ports. To use PostgreSQL, configure `DATABASE_URL` in `backend/.env` before starting.

The default workspace is **real and empty**. `AUTO_SEED_DEMO=false`. Existing synthetic records remain archived with their provenance; changing the server mode does not relabel or publish them. New users receive isolated organizations with no example products or made-up sales. Do not put secrets or operational files in Git.

## SAVE

- Public real offers, search, category/city/price/discount and charity filters, product details, pickup windows, expiry and optional photos.
- Consumer reservations and cancellations; seller collection; status history. Stock changes and idempotency are enforced in transactions.
- Verified businesses publish and edit their own offers after confirming physical availability. A forecast never creates an offer or stock.
- Verified charities request bulk quantities, beneficiary counts and logistics; sellers approve or reject requests. Offers support discounted, free or negotiated terms.
- Signup records the requested role but grants only consumer access. An operator verifies the business outside the application, then runs:

```sh
cd backend
.venv/bin/python -m app.roles_admin --email owner@example.com --role business
# Use --role charity after verifying a charity, or consumer to revoke the role.
```

Photos are validated and re-encoded, then stored in the database. No ephemeral local upload directory is needed. Monetary transfers, payment processing and legal verification services are not integrated. Existing 5% commission accounting is retained as an internal ledger calculation, not a charge.

## FORECAST

1. **Upload CSV/XLSX:** inspect sheets and columns → map fields → preview rows, duplicates and errors → explicitly confirm. New products require an explicit unit. Import does not create physical stock.
2. **Start without history:** five steps for business, products, demand, external factors and review. Blank means unknown; zero remains zero. Estimates belong to one selected location and are stored separately from actual observations.
3. Download a genuine XLSX with `Business`, `Products`, `HistoricalData` and `Assumptions`. Without recorded daily history, `HistoricalData` contains headers only. Reimport the questionnaire for review, or import its historical sheet through the same verified pipeline.
4. Add daily actuals or repeat imports, run analysis explicitly and revisit persisted results. Opening a page does not train models. Identical calculations reuse the stored result.

At least 3 observed dates are needed for a numerical historical baseline. With 28+ observations, SAQTA compares last-value, recent-mean and weekday baselines on a chronological validation period, then evaluates the selected method on a separate final 7-observation rolling holdout. At 98+ observations it also compares a regularized regression implemented with NumPy. MAE, RMSE and WAPE are computed from predictions made using earlier observations only. Unknown stock, missing dates, stale history and insufficient evaluation data are disclosed. No confidence interval or guaranteed accuracy is invented.

Questionnaire estimates are explicitly provisional and have no accuracy metrics. Weather, holidays and promotions are retained as context; a causal effect is not claimed. Production recommendations use a disclosed 10% buffer and known available inventory; calculated surplus is conditional and is never automatically listed in SAVE.

## Optional language model

Core forecasting and factual explanations work without an LLM. An optional server-side adapter can call a **self-hosted Qwen3** endpoint using `LLM_BASE_URL`, `LLM_MODEL` and optional `LLM_API_KEY`. Only aggregated metrics and an allowlist of explanation fact IDs are sent. The model may prioritize these facts; it cannot supply forecasts, change numbers or invent explanation claims. Invalid responses, timeouts and unavailable inference fall back to deterministic explanations.

No weights or inference server are deployed by this repository. There is no mandatory paid API, browser model or dependency on a developer’s laptop. See [model licensing and deployment constraints](docs/MODELS.md).

## Verification and deployment

```sh
cd backend
.venv/bin/alembic upgrade head
.venv/bin/alembic check
.venv/bin/pytest -q
.venv/bin/ruff check app tests
cd ../frontend
npm test -- --maxWorkers=2
npm run lint
npm run typecheck
npm run build
```

To exercise the new workflows against PostgreSQL as well as SQLite, set `SAQTA_TEST_DATABASE_URL` to a **disposable test database**. Tests create and remove their own schemas. Never supply production credentials to tests.

- **Render:** preserve the existing database and service; apply the additive Alembic migration through the existing Docker startup. Set `WORKSPACE_MODE=real`, `AUTO_SEED_DEMO=false`, `FORECAST_REQUIRES_SUBSCRIPTION=false`, and the exact frontend HTTPS origin in `CORS_ORIGINS`. Keep `DATABASE_URL` server-only. `render.yaml` preserves the existing resource names.
- **Vercel:** root directory `frontend`; `NEXT_PUBLIC_API_URL=https://YOUR-API/api`; rebuild after changing this public variable. Hosted builds reject a localhost backend URL.
- Back up the existing production database before migration. Verify health, registration, tenant isolation, a real import and a reservation after rollout. GitHub push is not evidence that either host successfully deployed.

The 29 October 2026 refactor has been checked locally. **A production rollout is not claimed.** Detailed changes, test results, migration behavior and remaining limits are recorded in [the refactor report](docs/REFACTOR_2026_10_29.md). Older architecture, subscription and verification documents describe previous releases and are not current product instructions.
