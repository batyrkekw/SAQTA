# SAQTA verification record

Verified locally on **24 October 2026**, Asia/Qyzylorda. Python 3.12.5; Node.js 25.2.1; Windows PowerShell. Exact dependencies: [VERSIONS.md](VERSIONS.md).

| Check | Actual result |
|---|---|
| Backend Pytest | 38 passed, including 5 guarded-bootstrap tests |
| Backend Ruff | All checks passed |
| Python dependency consistency | `pip check`: no broken requirements |
| Python compilation | `compileall` passed |
| Alembic | Fresh SQLite upgrade → schema check → downgrade to base → reupgrade passed in automated test |
| Existing SQLite database | Upgraded to both shipped revisions; `alembic check` found no drift |
| Reproducible seed | 42 days, 5 products, 2 locations; loaded successfully |
| Frontend Vitest / RTL | 18 passed across 5 files |
| Frontend ESLint | Passed with zero warnings |
| Strict TypeScript | `tsc --noEmit` passed |
| Production frontend | `next build --webpack` passed for all application routes |
| npm audit | 0 reported vulnerabilities in installed dependency graph |
| Local running API | Health, settings, catalog, inventory, dashboard, listings, orders and impact returned data; forecast POST persisted a result |
| Deployment HTTP/API rehearsal | 22/22 checks passed locally with isolated synthetic writes; 18/18 read-only checks passed against ports 3000/8000 |
| Vercel build configuration | Missing, localhost and malformed API URLs rejected; public HTTPS URL accepted in an isolated configuration check |
| Browser | Landing renders, dashboard location filter changes totals, forecast generates explained demand/production/MAE; demo order creation and cancellation show confirmation and restore listing availability; production quantity edited 55 → 56 → 55 successfully in the production build |
| Production startup | `npm start` serves the built standalone application and copied public/static assets on port 3000 |
| Keyboard accessibility | Modal focus trap/restoration and Escape covered by RTL; offscreen mobile sidebar removed from focus navigation with CSS visibility |

Backend tests include forecasting without future leakage, exact production buffer rounding, missing history, invalid/negative inputs, record changes and historical ledger constraints, atomic CSV rejection, listing allocation, order lifecycle, concurrent SQLite overselling prevention, economics, impact snapshots, baseline coverage, data-source protection and major endpoints. Frontend tests cover economics assumptions and interactions, safe API errors and CSV row details, stale filter response suppression, modal keyboard behavior, and production/sales/write-off edit payloads with disabled selectors.

Initial lint/test failures were fixed and the affected checks rerun. The backend reports one upstream Starlette/AnyIO deprecation warning; it does not fail tests. No tests are deliberately skipped or marked expected failure. Synthetic MAE and synthetic impact totals are not real operating outcomes.

## Deployment preparation follow-up

The Render Blueprint now explicitly chooses free API/PostgreSQL plans, Frankfurt and PostgreSQL 17, with public database IP access disabled. Container startup runs migrations, guarded demo bootstrap and Uvicorn. Automatic seeding is opt-in, preserves existing data and refuses real-data workspaces. The full backend suite passes 38 tests and Ruff is clean. Frontend lint/type checks pass with the Vercel API configuration guard.

`scripts/verify_live.py` was rehearsed locally: `artifacts/local-deployment-rehearsal.json` records 22 passing checks with labeled QA mutations, and `artifacts/local-deployment-readonly.json` records 18 read-only checks. The script independently recomputes held-out MAE and verifies cancellation, overselling rejection, collection and exact impact changes. QA product/listing were deactivated and remaining QA stock reconciled. These reports are **not public-cloud verification**.

Account access is pending: both hosting integrations are unconnected and their browser dashboards show sign-in pages. The local source has no Git remote. Public deployment and browser verification at live hosts remain outstanding; see [DEPLOYMENT.md](DEPLOYMENT.md).

## Verification boundaries

* **No public deployment was performed.** There is no verified public URL, hosting account or deployment credential in this repository.
* **Docker is unavailable on this machine.** Dockerfiles and Compose configuration are supplied, but image builds and Compose startup were not executed.
* **No PostgreSQL service was available locally.** ORM schema and migrations support PostgreSQL, with psycopg installed and URL normalization checked, but migrations/concurrency tests executed against SQLite. Run deployment smoke tests against managed PostgreSQL before relying on a hosted installation.
* Browser checks used the in-app browser at its available responsive viewport. They are targeted smoke checks, not a full cross-browser/accessibility certification.
* There is no authentication, tenancy isolation or payment processing. Do not use a shared public deployment for confidential business data.

Deployment setup and exact remaining external steps are in [README.md](../README.md#deployment).
