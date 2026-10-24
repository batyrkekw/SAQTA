# SAQTA verification record

All times in this report use **24 October 2026, Asia/Qyzylorda** unless explicitly marked UTC. Local runtime: Python 3.12.5, Node.js 25.2.1, Windows PowerShell. The previous public service uses Node 24, a Python 3.12 container and Render PostgreSQL 17.

## Current unified-product update: release status

**Local tests, lint, type checking, production build, SQLite migrations and seed checks have passed for this update. Updated public deployment, live integration and PostgreSQL migration verification remain pending.** The stable public URL already exists from a previous release; its historical checks below are not proof that new code is live. Do not treat pending rows as passed.

| Current-source check | Actual status at this documentation update |
|---|---|
| New Forecast targeted tests | 18 passed: savings formulas/invalid inputs, pricing/config/paid modal, backtest source/insufficient/zero-WAPE states, computed explanations and interactive savings |
| New Forecast TypeScript/ESLint | Type checking passed; lint passed with zero warnings after these feature changes |
| Source inspection | Local read-only analysis of 1 XLSX worksheet, 16 columns, 1 Google Forms response, 0 missing cells/duplicates; 0 verified daily sales observations |
| Source preservation | Original before/after SHA256 matched; sanitized structural report in DATA_REPORT.md; actual answers/private outputs remain ignored and local |
| Full backend suite | 86 Pytest tests passed; one upstream Starlette/AnyIO deprecation warning, no test failures |
| Backend static checks | Ruff passed |
| Full frontend suite | 63 tests passed across 12 files |
| Full frontend types/lint | TypeScript passed; ESLint passed with zero warnings |
| Production frontend build for update | Passed; generated 12 static pages. An initial Windows EBUSY lock was resolved by stopping the previously owned Node process and rerunning the build successfully |
| SQLite migrations and seed | Fresh database upgraded through all 3 revisions to c83f42d78b91; reproducible 42-day synthetic seed verified |
| Additive PostgreSQL migration c83f42d78b91 | Updated existing public database upgrade verification remains pending |
| Local API integration | 14/14 new product checks and 22/22 preserved compatibility checks passed using generated synthetic fixtures; CSV/XLSX, atomic rejection, repeat/concurrent import deduplication, backtest and explanation independently checked |
| Local browser | Forecast numeric input samples/formula, backtest, exact paid-plan notice, savings example (75,000 × 50% − 15,000 = 22,500 KZT), and Save text generation/copy/explicit insertion worked in the production frontend |
| CSV/XLSX inspect/preview/commit at public origin | Pending updated API deployment and explicit synthetic-only checks |
| Public unified Forecast/Save/About browser flows | Pending updated frontend deployment and browser checks |
| Real-data forecast quality | Not established: questionnaire answers do not supply a daily forecasting ledger |

New code includes actual rolling historical forecasts, MAE/WAPE and simple-baseline comparison; per-day input samples and production formulas; manual scenario savings starting at 0%; preliminary pricing with exact informational connection notice; and deterministic Save announcement text. Their local presence is distinct from deployed availability.

The complete backend/frontend commands are in README.md. Local final counts above were supplied from executed root integration checks. New public release IDs and live evidence should replace remaining pending statuses only after actual execution. No real source file may be used as a public import test.

## Previous release: executed local checks

These results belong to the earlier, separately verified application release, before the unified-product update.

| Check | Previous actual result |
|---|---|
| Backend Pytest | 38 passed, including 5 guarded-bootstrap tests |
| Backend Ruff | Passed |
| Dependency consistency / Python compilation | pip check and compileall passed |
| Alembic SQLite | Fresh upgrade, schema check, downgrade/reupgrade passed; existing database upgraded through ee2260d736c6 with no schema drift |
| Synthetic seed | 42 days, 5 products, 2 locations loaded successfully |
| Frontend Vitest / RTL | 18 passed across 5 files |
| Frontend ESLint / strict TypeScript | Passed with zero warnings / tsc passed |
| Production frontend | next build --webpack passed for previous application routes |
| npm audit | 0 vulnerabilities reported at that run |
| Local API / rehearsal | Health, settings, catalog, inventory, analytics, listings/orders and persisted forecast passed; automated rehearsal 22/22 synthetic-write checks and 18/18 read-only checks |
| API configuration | Missing/localhost/malformed deployment URL rejected; public HTTPS accepted |
| Browser | Landing navigation, date/location data changes, forecast, inventory edits and order reserve/cancel succeeded |
| Production startup | Standalone app/static assets served on port 3000 |
| Keyboard accessibility | Modal trap/restoration/Escape covered by RTL; hidden mobile navigation removed from focus order |

The previous tests covered inventory consistency, order transactions, insufficient/future-excluded forecasts, CSV validation/rollback, impact/source protections and major endpoints. Synthetic scores/totals were never real bakery operating outcomes. Earlier failures were fixed and affected checks rerun; no deliberately skipped tests were reported.

## Previous public release evidence

Stable frontend: [saqta-batyrkekw.vercel.app](https://saqta-batyrkekw.vercel.app). API documentation: [saqta-api.onrender.com/docs](https://saqta-api.onrender.com/docs). Private source repository: [batyrkekw/SAQTA](https://github.com/batyrkekw/SAQTA).

| Previous public check | Actual historical result |
|---|---|
| Render API release | dep-dbe7cavavr4c739u63ag reached LIVE at 14:12:41 (09:12:41 UTC) |
| PostgreSQL startup | Logs confirmed PostgresqlImpl, migration b1b6d5df8d63 → ee2260d736c6 and guarded demo bootstrap |
| Vercel build | dpl_2XcBoyGR4KXT9NQ7Edu3HzZpVbF2 reached READY; 74-second build |
| Unauthenticated HTTP/assets | Earlier nine routes returned 200; SVG assets and manifest passed |
| Database/CORS | Connected PostgreSQL, data-derived metrics, origin labels, exact production CORS/preflight passed |
| Forecast | Stored chronological synthetic forecast; held-out MAE independently recomputed from 7 observations |
| Stock/order accounting | Negative input rejected; reserve/cancel restored stock; overselling conflicted; collection deducted stock consistently |
| Recorded impact | A labeled synthetic test collection added exactly 2 units, 1,000 ₸ and 0.2 kg catalog accounting weight |
| Automated public smoke | 22 passed, 0 failed, exit 0 at 14:14:19 (09:14:19 UTC) |
| Targeted PostgreSQL race | 9 passed, 0 failed, exit 0 at 14:22:33 (09:22:33 UTC) |

The earlier smoke report is ignored `artifacts/live-smoke.json`; QA entity IDs were retained for traceability and test stock reconciled without database reset. The separate ignored race report is `artifacts/postgres-order-race.json`: two simultaneous one-unit requests produced one 201, one 409 and one stored order. Cancellation and listing deactivation restored original stock; impact/write-off totals did not change. This proves that tested two-request case, not load-test performance.

## Previous live browser checks

The unauthenticated desktop in-app browser verified landing/product navigation; data filters; persisted forecast; catalog editing; invalid CSV rejection; listing publication/deactivation; demo order cancellation/collection; recorded impact and settings. API readback confirmed the UI-created states. No private file, real payment or demo reset was used.

The previous browser report is ignored `artifacts/browser-live-verification.json`, recorded at 14:22:45 (09:22:45 UTC), with screenshot `artifacts/saqta-live-dashboard.png`. These older checks used the earlier navigation. They do not verify new Forecast views, prices, XLSX mapping, import deduplication or announcement generation.

## Boundaries and remaining verification

* Local automated database checks use SQLite. Earlier public checks exercised PostgreSQL stock/orders and one race; new import migration/transactions require updated PostgreSQL verification.
* Docker is unavailable locally. Render built/ran the earlier API container; local image builds and Docker Compose startup were not executed.
* The free PostgreSQL database was provisioned to expire **23 November 2026 at 14:00:24 Asia/Qyzylorda** and had no backups at verification. Recheck current provider state; this is a temporary demonstration tier.
* Earlier browser checks used desktop in-app browsing. They do not certify mobile, cross-browser accessibility, load handling or full security.
* There is no authentication, tenancy isolation, payment processor, enforced subscription quota or automatic paid-plan notification. No real confidential data belongs in the shared public deployment.
* The private XLSX is a survey. Its untouched original and normalized/provenance outputs are not committed or uploaded. No daily sales were invented from its answers and no model was trained on them.
* The source uses an explainable statistical forecast. Synthetic evaluation verifies calculations, not real accuracy; catalog accounting weight is not a physical food measurement.
* The existing frontend uses source uploads and has no Git auto-deployment; the backend service can auto-deploy backend changes from main. Documentation/source edits alone do not establish a new live release.

Repeatable release steps and existing resource settings are in DEPLOYMENT.md. Preserve earlier evidence and add a separately dated new-release section after running the updated checks.
