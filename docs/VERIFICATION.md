# SAQTA verification record

All times in this report use **24 October 2026, Asia/Qyzylorda** unless explicitly marked UTC. Local runtime: Python 3.12.5, Node.js 25.2.1, Windows PowerShell. The public service uses Node 24, a Python 3.12 container and Render PostgreSQL 17.

## Current architecture/assortment/subscription/commission source

**Local release checks: 151 backend tests and 78 frontend tests passed; strict TypeScript and lint checks passed after the Save submit-handler correction. The production frontend build passed (12 static pages). This source has not been deployed.** The previously published final documentation commit `19618ed` and its 45 integration checks are historical, not evidence for the new auth, quota, observation, assortment or settlement code. A later executed-release section must identify the new source and actual provider results before claiming publication.

| Focused current-source check | Executed result / boundary |
|---|---|
| Organization access HTTP tests | 11 passed: scrypt and hashed revocable/expiring sessions, inactive/expired plans, import authorization, actual two-tenant raw-ID/analytics/import/order isolation, assortment request replay, one-run usage, failed-request non-consumption, Demo unpaid/real-registration refusal, explicit verification isolation, real-containing DB reset refusal |
| Concurrent last real Forecast allowance | Two different simultaneous assortment requests with one remaining allowance produced exactly one 201 and one 429; persisted monthly usage was 300. Executed with a file-backed SQLite database; not a claim about real-mode PostgreSQL concurrency |
| Fresh migration round trip | SQLite upgrade to current head, Alembic schema check, downgrade to base and upgrade all passed; no public PostgreSQL result inferred |
| Additional focused API checks | Final combined backend suite: 151 passed; one upstream Starlette/AnyIO deprecation warning |
| Final current-source tests/lint/types/build | 151 backend and 78 frontend tests passed; strict TypeScript, ESLint, Ruff and the production frontend build passed. Prior 86 backend / 63 frontend counts below are historical |
| New Render migration / Vercel release | Pending; no new cloud success claimed here |
| Private actual XLSX | Untouched single questionnaire response, zero verified dated sales observations; original/preparation outputs remain local and ignored |

The new code is designed to keep the public service an anonymous synthetic demo while a separate REAL installation requires organization-owned sessions and an active manually activated Forecast subscription. Authentication/tenant tests are HTTP integration tests with only the raw database dependency replaced: the request scope and server gates remain active. This is application-level tenant isolation, not database RLS or penetration testing. Password recovery, email verification, MFA, roles, rate limiting and real payments remain absent.

## Historical unified-product release: executed status

**The unified-product code release is deployed and verified.** Local tests/build, PostgreSQL migration and **45/45 public API/integration checks** passed. Public browser checks below are limited to the flows actually completed; broader coverage is not inferred. Release identifiers below distinguish the first verified code release from later documentation and wording refreshes.

| Historical unified-source check | Actual result at that release |
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
| Additive PostgreSQL migration c83f42d78b91 | Render runtime logs confirmed PostgresqlImpl and ee2260d736c6 → c83f42d78b91; guarded bootstrap retained prior records, without reset |
| Local API integration | 14/14 new product checks and 22/22 preserved compatibility checks passed using generated synthetic fixtures; CSV/XLSX, atomic rejection, repeat/concurrent import deduplication, backtest and explanation independently checked |
| Local browser | Forecast numeric input samples/formula, backtest, exact paid-plan notice, savings example (75,000 × 50% − 15,000 = 22,500 KZT), and Save text generation/copy/explicit insertion worked in the production frontend |
| Public API/integration | 45/45 passed, exit 0: new product checks 14/14, compatibility 22/22, targeted PostgreSQL order race 9/9 |
| CSV/XLSX at public origin | Generated synthetic fixtures passed inspection, mapped preview, explicit commit, atomic rejection, repeat deduplication and simultaneous-import exact-one-increment checks |
| Public browser flows completed | Numeric forecast generation/expanded explanation, historical backtest metrics/source warnings, exact paid-plan modal, compact Forecast/Save/About navigation and close-on-link behavior passed |
| Additional public hydrated browser flows | Savings example returned 22,500 KZT; Save generation, editing, copy, explicit insertion and publication persisted the reviewed text. Test listing 23 was deactivated and available seed stock restored to 15 |
| Real-data forecast quality | Not established: questionnaire answers do not supply a daily forecasting ledger |

New code includes actual rolling historical forecasts, MAE/WAPE and simple-baseline comparison; per-day input samples and production formulas; manual scenario savings starting at 0%; preliminary pricing with exact informational connection notice; and deterministic Save announcement text. The new endpoints and synthetic calculations were also checked at the public PostgreSQL-backed origin.

The complete backend/frontend commands are in README.md. Local final counts above were supplied from executed root integration checks. The new public release and API evidence below were added after actual execution. Later documentation/wording deployment evidence must be recorded separately. No real source file may be used as a public import test.

## Unified-product public release: executed evidence

The first verified code source is `416220352ee4a8852035a0eb5fc4581fda85299f`. Render deployment `dep-dbe8h6e7bikc73avev20` reached LIVE at **15:31:14 (10:31:14 UTC)**. Runtime logs confirmed PostgreSQL dialect, migration `ee2260d736c6` → `c83f42d78b91`, guarded bootstrap preserving records and healthy connected database; the new backtest route returned 200.

Vercel deployment `dpl_DEVVTSiiKUTsFejT6PLTQzmb9nKJ` reached READY after a 91-second build. Its immutable URL is [saqta-pxvi9z5om-saqta.vercel.app](https://saqta-pxvi9z5om-saqta.vercel.app); [saqta-batyrkekw.vercel.app](https://saqta-batyrkekw.vercel.app) serves the production alias. At this first release, 10 requested resources returned 200, five legacy paths returned the exact expected 307 redirect, and three downloadable documentation SHA256 values matched the approved source. Tested internal/private/Excel URLs returned 404. Evidence: ignored `artifacts/vercel-restructure-release.json`. A later documentation/wording refresh is separate; these hashes identify the first approved source, not unverified later text.

| Updated public API suite | Executed result |
|---|---|
| New product integration | **14/14 passed**, exit 0, finished 15:37:41 (10:37:41 UTC); `artifacts/product-update-live.json` |
| Preserved compatibility | **22/22 passed**, exit 0, finished 15:38:12 (10:38:12 UTC); `artifacts/product-update-live-legacy.json` |
| Targeted PostgreSQL order race | **9/9 passed**, exit 0, finished 15:38:47 (10:38:47 UTC); `artifacts/product-update-pg-order-race.json` |
| Combined sequence | **45 passed, 0 failed**; generated synthetic fixtures only |

The new-product suite verified public navigation/redirects, persisted demo origin, no internal planning endpoint in public OpenAPI, independent chronological backtest recomputation, insufficient-history null metrics, real-origin rejection before workbook parsing, CSV and XLSX sheet/mapping preview, confirmation/token guards, atomic invalid-batch rejection, repeated semantic-row deduplication and exact explanation formulas. It never read or sent the real private workbook.

Two simultaneous identical import requests both returned 200 in the observed schedule: one imported one row and one reported one duplicate. Exactly one record/stock increment persisted. This demonstrates the observed effective deduplication; it does not claim that this schedule returned a 409 conflict.

The order race requested one unit twice: A returned 409 and B returned 201, with only order 26 stored. Cancellation and listing deactivation restored original seed stock, and **this race alone** had zero impact deltas. QA products 7/8 and listings 21/22 were deactivated with QA stock reconciled to zero. The new-product and compatibility suites retain labeled synthetic production, sales/collection, write-off and import-audit rows for traceability. At that historical release, demo aggregates could include verification records; the new source adds explicit hiding/markers, whose public migration remains to be checked. Historical cleanup did not delete audit rows or restore every metric to its pre-test value. No database reset or deletion occurred.

### Updated public browser checks completed

* Forecast for seeded product/location 1 returned demand **58**, buffer **10%** → **64**, available inventory **15**, recommended production **49**. Expanded sources showed 18–24 October recent mean **54.57**, previous Sundays mean **62.25**, weights **0.6/0.4**, and `max(0, ceil(58 × 1.1) − 15) = 49`.
* Backtest displayed **42** observed history dates and **7** held-out observations: SAQTA MAE **5.53**, WAPE **10.13%**; simple comparison MAE **6.29**, WAPE **11.52%**. Synthetic-origin and reliability limitations were visible. These are demonstration metrics, not real bakery accuracy.
* Paid-plan selection displayed the exact requested «Подключение тарифов» notice without payment/subscription activation. Compact navigation displayed Forecast, Save and About and closed after following a link.

* The public savings calculator returned `75,000 × 50% − 15,000 = 22,500 KZT`, with the assumed reduction initially 0% and revenue/gross profit displayed separately.
* The public Save form generated text using entered fields, allowed editing/copying and explicit insertion, then published the exact edited synthetic description. API readback confirmed listing 23; UI deactivation left it inactive with available seed stock restored to 15. No order or real payment was made for this browser test.
* The public import form started without an assumed file origin. Selecting real bakery data in DEMO displayed the refusal and left file selection/acknowledgement disabled; no file was chosen or transmitted.

Other local production-browser checks passed as listed above. No full mobile/cross-browser or accessibility certification is implied. The compact live-browser layout and its collapsible navigation were exercised; this is not a device-matrix test.

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

* Local automated database checks use SQLite. The updated public PostgreSQL migration, import transactions/deduplication and a targeted two-order race were verified separately. This is not broader concurrency or load-test coverage.
* Docker is unavailable locally. Render built/ran the updated API container; local image builds and Docker Compose startup were not executed.
* The free PostgreSQL database was provisioned to expire **23 November 2026 at 14:00:24 Asia/Qyzylorda** and had no backups at verification. Recheck current provider state; this is a temporary demonstration tier.
* Earlier browser checks used desktop in-app browsing. They do not certify mobile, cross-browser accessibility, load handling or full security.
* The historical public release had no authentication, tenancy isolation or enforced quotas. Current local source implements owner authentication/isolation/subscription enforcement only for a separate REAL deployment; the public demo remains anonymous and synthetic. No payment processor, payout or automatic paid-plan notification is implemented.
* The private XLSX is a survey. Its untouched original and normalized/provenance outputs are not committed or uploaded. No daily sales were invented from its answers and no model was trained on them.
* The source uses an explainable statistical forecast. Synthetic evaluation verifies calculations, not real accuracy; catalog accounting weight is not a physical food measurement.
* The existing frontend uses source uploads and has no Git auto-deployment; the backend service can auto-deploy backend changes from main. Documentation/source edits alone do not establish a new live release.

Repeatable release steps and existing resource settings are in DEPLOYMENT.md. Preserve earlier evidence and add a separately dated new-release section after running the updated checks.
