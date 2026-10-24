# SAQTA verification record

Local and public deployment checks were performed on **24 October 2026**, Asia/Qyzylorda. Local runtime: Python 3.12.5; Node.js 25.2.1; Windows PowerShell. Deployment: Node.js 24 on Vercel, Python 3.12 Docker service and PostgreSQL 17 on Render. Exact application dependencies: [VERSIONS.md](VERSIONS.md).

## Local application checks

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

## Public deployment checks

Public frontend: [saqta-batyrkekw.vercel.app](https://saqta-batyrkekw.vercel.app). API: [saqta-api.onrender.com](https://saqta-api.onrender.com/docs). The source is in private repository [batyrkekw/SAQTA](https://github.com/batyrkekw/SAQTA). The initial API release built commit `af21fef1eb7f3f570f1ec05f9286e623ce9fb372`.

| Check | Actual public result |
|---|---|
| Render API release | `dep-dbe7cavavr4c739u63ag` reached `LIVE` at 14:12:41 Asia/Qyzylorda (09:12:41 UTC) |
| PostgreSQL startup | Render logs confirmed `PostgresqlImpl`, migration `b1b6d5df8d63` → `ee2260d736c6`, successful guarded bootstrap and healthy demo workspace |
| Vercel production build | `dpl_2XcBoyGR4KXT9NQ7Edu3HzZpVbF2` reached `READY`; 74-second build |
| Unauthenticated frontend HTTP | All nine application routes returned 200; four SVG assets and SAQTA manifest passed |
| API integration | Connected database, five initial catalog products, two locations, nonnegative inventory, data-derived dashboard/impact, KZT and synthetic labels |
| CORS | Exact production origin and POST preflight passed |
| Forecast | Forecast ID 1 persisted with `recent_weekday_baseline_v1`; MAE 5.39 independently recomputed from seven chronological held-out synthetic observations |
| Economics | Contribution 21,000 ₸, 70%; LTV 252,000 ₸; LTV/CAC 6.3; payback 1.9048 months; ten-location illustrative ARR 3,600,000 ₸ |
| Inventory/order writes | Negative quantities rejected; reserve and cancel restored balances; overselling returned a conflict without balance changes; collection reduced stock consistently |
| Impact accounting | Test collection added exactly 2 units, 1,000 ₸ and 0.2 kg of catalog accounting weight; synthetic test values, not environmental outcomes |
| QA cleanup | Created test product/listing deactivated and stock reconciled to zero; audit records retained; existing data was not reset or deleted |
| Automated public smoke | **22 passed, 0 failed**, exit code 0; completed 14:14:19 Asia/Qyzylorda (09:14:19 UTC) |
| Targeted PostgreSQL order race | **9 passed, 0 failed**, exit code 0; completed 14:22:33 Asia/Qyzylorda (09:22:33 UTC); two simultaneous one-unit requests returned exactly one 201 and one 409 |

The public report is saved locally as ignored `artifacts/live-smoke.json`. QA trace IDs: product 6, production 421, listing 18, cancelled order 16, collected order 18, write-off 421. The rejected oversell did not create a successful order. These IDs make the retained labeled test records identifiable without exposing credentials.

Earlier local script rehearsals remain in ignored `artifacts/local-deployment-rehearsal.json` (22 checks with labeled QA writes) and `artifacts/local-deployment-readonly.json` (18 read-only checks). Those rehearsal reports are separate from the public run.

The separate targeted concurrency report is ignored `artifacts/postgres-order-race.json`. Requests A and B shared the same 14:22:29.569653 Asia/Qyzylorda launch timestamp for listing 20, quantity one. Only winning order 21 persisted; the losing request returned 409 without a second order. Cancelling order 21 restored one available listing unit, and deactivating listing 20 restored original stock balances (25 on hand, 10 reserved, 15 available). No production/product records were created; recovered value/units/weight and write-off totals were unchanged. This establishes the tested two-request case, not broad load/performance behavior.

## Live browser interaction checks

The following checks passed in an unauthenticated in-app browser at the stable public origin, `https://saqta-batyrkekw.vercel.app`. Values are snapshots of synthetic records at verification time; later demo activity can change them.

| Flow | Verified browser result |
|---|---|
| Landing and dashboard | Landing CTA opened the hydrated dashboard with Render-backed metrics and DEMO labels |
| Dashboard filter | All locations → location 1 changed produced 16,069 → 8,866, sold 12,848 → 7,314, and stock 252 → 132 |
| Forecast | UI-created forecast 2 for product/location 1 on 25 October 2026: demand 58, recommended production 48, inventory 16, expected surplus 6; held-out synthetic MAE shown rounded to 5.4 across seven points |
| Inventory edit | QA product 6 name and price updated through the form; price became 1,100 ₸ and the product remained inactive |
| CSV validation | Invalid headers rejected at row 1 with missing `date`, `location_id` and `product_id` details; no records imported |
| Marketplace cancellation | UI created explicitly synthetic listing 19 and order 19; confirmation displayed, cancellation restored one available unit |
| Marketplace collection | Order 20 confirmed and collected for one croissant at 375 ₸, using 80 g catalog weight; listing 19 subsequently deactivated |
| Impact | Page reflected 21 recovered units, 4.68 kg catalog accounting weight and 9,925 ₸ in the selected synthetic period |
| Economics | Defaults showed 70% contribution, LTV 252,000 ₸, LTV/CAC 6.3 and payback 1.9 months; changing subscription to 40,000 ₸ updated contribution to 31,000 ₸ / 77.5%, LTV 372,000 ₸, ratio 9.3, payback 1.3 months, target eight locations and ARR 4,800,000 ₸; defaults restored |
| Settings | Connected database, DEMO/no-authentication warning and KZT displayed; no demo reset performed |

A subsequent read-only API check confirmed listing 19 is inactive with zero available/reserved stock, order 19 is cancelled, and order 20 is collected for 375 ₸. The test used existing synthetic croissant inventory, with no real product or payment. This supplements the automated write checks rather than replacing them.

The browser report is saved locally as ignored `artifacts/browser-live-verification.json`, recorded at 14:22:45 Asia/Qyzylorda (09:22:45 UTC), with screenshot `artifacts/saqta-live-dashboard.png`.

## Verification boundaries

* Render built and ran the backend container against managed PostgreSQL 17. Docker is unavailable locally; local image builds and Docker Compose startup were not executed.
* Local automated migration/concurrency tests used SQLite. Public checks exercised real PostgreSQL transactions, order accounting and one simultaneous two-order race. Broader concurrency scenarios, sustained load and database performance limits were not tested.
* The free PostgreSQL database expires **23 November 2026 at 14:00:24 Asia/Qyzylorda (09:00:24 UTC)** and has no backups. The API can sleep after inactivity. This is a temporary demonstration deployment.
* Live browser checks used the available in-app desktop browser. Public mobile layout, full cross-browser behavior and accessibility certification were not established by these targeted checks.
* There is no authentication, tenancy isolation or payment processing. Do not use a shared public deployment for confidential business data.
* Synthetic held-out MAE is calculated correctly for the seeded series; it does not establish accuracy on real bakery data. Recovered weight uses catalog weights and is not a physical measurement.
* The Vercel frontend used a source upload and has no Git auto-deployment. Render backend auto-deploys from `main` when files under `backend` change.

Resource identifiers, release configuration, repeatable commands and operational follow-up are in [DEPLOYMENT.md](DEPLOYMENT.md) and [README.md](../README.md#deployment).
