# SAQTA public demo deployment

The existing SAQTA synthetic demo uses **Vercel frontend + Render API + Render PostgreSQL**. **The new architecture/assortment/subscription/5% commission source is not declared deployed by this document: new release and live PostgreSQL verification are pending.** The previously verified unified release (final documentation commit `19618ed`, first code `4162203`) remains historical evidence. Its 45 public checks do not establish current-source behavior. New real-mode authentication/subscription code does not turn the public anonymous demo into a private customer service.

## Previously verified public resources

Verified on **24 October 2026**, Asia/Qyzylorda:

| Resource | Actual configuration |
|---|---|
| Public frontend | [saqta-batyrkekw.vercel.app](https://saqta-batyrkekw.vercel.app) |
| API base | `https://saqta-api.onrender.com/api`; [health](https://saqta-api.onrender.com/api/health) |
| Interactive API documentation | [saqta-api.onrender.com/docs](https://saqta-api.onrender.com/docs) |
| Source repository | Private [batyrkekw/SAQTA](https://github.com/batyrkekw/SAQTA), branch `main` |
| Vercel | Hobby; project `saqta`, ID `prj_K9Y6Ktc9gcQXtrVZMKk6ztAlxH8G`; team `SAQTA`, slug `saqta`, ID `team_jIqAQnVKdgLP3olkd0ixClMt` |
| First Vercel production deployment | `dpl_2XcBoyGR4KXT9NQ7Edu3HzZpVbF2`, `READY`; build completed in 74 seconds |
| Render API | `srv-dbe7canavr4c739u60vg`, free Docker web service, Frankfurt |
| First Render API deployment | `dep-dbe7cavavr4c739u63ag`, `LIVE` at 14:12:41 Asia/Qyzylorda (09:12:41 UTC) |
| Render PostgreSQL | `dpg-dbe77a3rjlhs73emj1f0-a`, PostgreSQL 17, free, Frankfurt; external IP allowlist empty |
| Initial application source | Commit `af21fef1eb7f3f570f1ec05f9286e623ce9fb372` |

Resource IDs are identifiers, not credentials. Database connection strings, tokens and local authentication state are deliberately excluded from source and documentation.

The table records the first verified production deployment. Subsequent documentation/source releases retain the same public origin; inspect the provider's production deployment for its current deployment ID rather than treating the first ID as a moving alias.

The database was created on 24 October 2026 and expires **23 November 2026 at 14:00:24 Asia/Qyzylorda (09:00:24 UTC)**. It has no backups. The free API can sleep after 15 minutes without requests and take about a minute to wake. Export or migrate data, or explicitly select a paid plan, before expiry if persistence is required. [Render free-instance limits](https://render.com/docs/free)

## Existing service configuration

### Historical verified unified-product release

| Resource/check | Executed result |
|---|---|
| Code source | `416220352ee4a8852035a0eb5fc4581fda85299f` |
| Render deployment | `dep-dbe8h6e7bikc73avev20`, LIVE at **15:31:14 Asia/Qyzylorda (10:31:14 UTC)** |
| PostgreSQL migration | Logs confirmed `PostgresqlImpl`, `ee2260d736c6` → `c83f42d78b91`; prior records retained, no reset |
| First Vercel release for this code | `dpl_DEVVTSiiKUTsFejT6PLTQzmb9nKJ`, READY; 91-second build |
| Immutable frontend | [saqta-pxvi9z5om-saqta.vercel.app](https://saqta-pxvi9z5om-saqta.vercel.app), production alias [saqta-batyrkekw.vercel.app](https://saqta-batyrkekw.vercel.app) |
| Provider HTTP/privacy check | 10 requested resources returned 200; all 5 legacy paths returned expected 307 targets; 3 downloadable document SHA256 values matched that approved source; tested private/internal/Excel paths returned 404 |
| Public integration | **45/45 passed**, exit 0: new product 14/14, retained compatibility 22/22, targeted PostgreSQL order race 9/9; sequence completed **15:38:47 Asia/Qyzylorda (10:38:47 UTC)** |
| Public browser checks completed | Forecast generation and expanded numeric input/formula explanation; historical backtest metrics/source warnings; exact paid-plan modal; compact three-item navigation and close-on-link behavior |

The reports are ignored local artifacts: `artifacts/vercel-restructure-release.json`, `artifacts/product-update-live.json`, `artifacts/product-update-live-legacy.json`, `artifacts/product-update-pg-order-race.json`. Public API checks used generated synthetic fixtures only. They verified CSV/XLSX preview/commit/repeat handling, whole-batch rejection, one effective commit for simultaneous identical imports, independent backtest/explanation arithmetic, and order reservation consistency. Both import requests returned 200 in the observed schedule: one imported one row, the other reported one duplicate; the ledger increased exactly once.

The single-unit order race returned one 201 and one 409, storing only order 26. Cancellation and listing deactivation restored stock with zero impact deltas. QA products 7/8 and listings 21/22 were deactivated and QA stock reconciled; traces remain. No real workbook upload, existing-data reset or deletion occurred. Zero impact deltas apply only to the final order-race suite: the broader integration suites retain labeled synthetic ledger, collection and write-off records, so demo aggregates can include QA activity. Cleanup deactivates QA entities and reconciles their stock; it does not erase traces or restore every aggregate.

These identifiers record the **first verified code release**. Later documentation and wording refreshes retain this backend implementation. Check the production alias and release evidence for the current frontend deployment; the hashes above identify the first approved snapshot. This is not a broad load test.

### Safe release order for this architecture update

Final source tests/build and new public checks must be recorded in `VERIFICATION.md`; previous 86/63 tests and 45 live checks belong to the historical release. This update keeps Next.js/FastAPI/PostgreSQL and the three-item product navigation. Public rollout must remain `WORKSPACE_MODE=demo` with synthetic records only; real registration/paid activation must not be simulated there.

1. Run final Pytest, Ruff, frontend tests, strict TypeScript, ESLint and production build. Review `DATA_REPORT.md`: the actual workbook is one survey response, not dated sales history. Use generated synthetic fixtures for all public verification.
2. Prepare the reviewed source manifest from committed files, excluding `data/private/`, actual XLSX/XLS sources, `.env`, credentials/tokens, local DBs, `.vercel` state, `artifacts/`, caches and dependencies. Inspect the manifest rather than relying only on ignore patterns. Do not upload the original survey or private normalization outputs.
3. Back up durable data before migration. Apply **API first**, running `alembic upgrade head` from existing `c83f42d78b91` through `b7a1f2d4e6c8` → `d1e2f3a4b5c6` → `e4f5a6b7c8d9`. These add owner/session/subscription/usage, sourced observations/assortment runs, and order settlement/idempotency/verification markers. They do not reset or delete customer records. Unambiguous order ownership is backfilled; historical collected commission is an explicitly marked model estimate with null recording time, not a charge.
4. Inspect Render build/runtime logs for `PostgresqlImpl`, all new revisions and connected `/api/health`; wait for LIVE. Do not run reset or seed-overwrite. Confirm `/api/subscription` says DEMO/unpaid, real registration is refused, and normal catalog/analytics hide explicit verification markers. No external PostgreSQL allowlist opening is required for API verification.
5. Exercise the new API on generated synthetic records with `X-SAQTA-Verification: include`: observation CSV/XLSX inspect/map/preview/confirmation, explicit zeros, absent stock as null, malformed/duplicate/conflicting rows, assortment-wide run, request replay, reserve/cancel/collect/oversell and exact discounted-price 5% settlement. Restore test stock/deactivate listings and retain marked traces; never delete unrelated records. Test paid/expired/tenant isolation in an isolated REAL configuration, not by relabeling the public demo.
6. Release the Vercel frontend only after the new backend routes/migration are healthy. Keep `frontend` root, outside-root source access, Node 24, `npm ci`, `npm run build` and the exact HTTPS API/CORS origin. The docs copy script publishes README/BRAND/API_CONTRACT only, not private reports/internal documentation.
7. Verify the production alias in the browser: persistent Forecast/Save/About navigation, automatically calculated full assortment, optional detail/branch filters, import statuses/warnings, demo vs real entitlement text, mobile menu, and Save publication/order/commission breakdown. Verify old redirects and downloadable docs. API health alone is not UI verification.
8. Record exact source/deployment IDs, timestamps, migration dialect/head, test counts and limitations after execution. Until then, report the architecture source as prepared locally, not publicly updated. No payment, payout, subscription purchase, private workbook upload or notification setup is part of this demo release.

### Separate private REAL installation

Use a different backend/database and HTTPS frontend, `WORKSPACE_MODE=real`, `AUTO_SEED_DEMO=false`, exact allowed origins, and optionally `AUTH_REGISTRATION_ENABLED=false` after onboarding. After migrations, registration creates one organization/real first location and a hashed-password owner, without any synthetic history. Login uses an expiring revocable opaque bearer session. No seed is required. The operator can run `python -m app.subscription_admin --email owner@example.com --plan starter --days 30` (or Pro) to activate a real subscription without charging a payment. There is no public self-activation endpoint. Starter limits are 20 active products / 300 successful runs per month / 1 location; Pro 100 / 1,000 / 10; Free has no real Forecast runs. See `ACCESS.md` for commands, security boundaries and missing recovery/MFA/rate-limiting features. Do not onboard sensitive records without independent security, backup/restore and retention review.

### Render backend

The service is linked to `batyrkekw/SAQTA`, branch `main`, with automatic deployment enabled:

* Root Directory: `backend`
* Docker context: `.` relative to that root
* Dockerfile: `./Dockerfile`
* Health path: `/api/health`
* `WORKSPACE_MODE=demo`
* `AUTO_SEED_DEMO=true`
* `CORS_ORIGINS=https://saqta-batyrkekw.vercel.app`
* `DATABASE_URL`: provider-managed private PostgreSQL connection, stored only in the Render environment

The Docker command runs `alembic upgrade head`, guarded `python -m app.bootstrap`, then Uvicorn on `$PORT`. The unified-product deployment logs confirmed PostgresqlImpl and upgrade ee2260d736c6 → c83f42d78b91. Guarded bootstrap preserved prior records without reset. Bootstrap fills an empty demo once, preserves existing records, and refuses real-data workspaces. Never add `--reset` to startup.

Push reviewed backend changes to `main` to trigger a release, then inspect its build/runtime logs, wait for `LIVE`, and run the smoke checks below. Root documentation changes do not trigger an API rebuild with this service root configuration. For multiple replicas, move migrations to a single release/predeploy step. [Render monorepo root behavior](https://render.com/docs/monorepo-support)

The supplied `render.yaml` remains a reproducible alternative for a new installation; the current resources were provisioned individually. Its repository-relative Docker context/path differs from the current service's root-relative settings. Do not create another database or service merely to update the existing deployment.

### Vercel frontend

The initial production deployment uploaded reviewed frontend source directly. Subsequent releases use a reviewed **monorepo source upload** to the same project, with these settings:

* Framework: Next.js; Node.js 24
* Root Directory: `frontend`
* Include source files outside the Root Directory in the Build Step: enabled
* Install: `npm ci`; build: `npm run build`
* Production build-time `NEXT_PUBLIC_API_URL=https://saqta-api.onrender.com/api`

The prebuild script copies the root README and `docs/BRAND.md` / `docs/API_CONTRACT.md` into downloadable frontend assets. Uploading the full reviewed source allows this to work without publishing local generated files or environment data. The frontend uses the real HTTPS API; its configuration rejects missing, localhost and malformed API URLs. Changing a `NEXT_PUBLIC_` variable requires a rebuild.

**The frontend has no GitHub auto-deployment connection.** A GitHub push alone updates the backend when its files change, not the frontend. For future Git-based frontend releases, deliberately connect this existing Vercel project to `batyrkekw/SAQTA`, keeping Root Directory `frontend` and outside-root sources enabled.

## Future frontend release with Vercel CLI

These owner-run commands document the equivalent source release workflow; the initial release used the connected deployment API rather than the CLI. Install/use a current Vercel CLI and authenticate through its normal login flow. Keep credentials in its secure store, never in command-line flags or repository files.

From the **repository root**, link to the existing project and inspect the target:

```powershell
npx vercel login
npx vercel link --project prj_K9Y6Ktc9gcQXtrVZMKk6ztAlxH8G --scope saqta
npx vercel project inspect --non-interactive --scope saqta
```

Confirm team `SAQTA`, project ID `prj_K9Y6Ktc9gcQXtrVZMKk6ztAlxH8G`, Root Directory `frontend`, and outside-root sources enabled. Stop on an ownership mismatch or unresolved link. Then deploy the reviewed repository source:

```powershell
npx vercel deploy --prod --scope saqta --build-env NEXT_PUBLIC_API_URL=https://saqta-api.onrender.com/api
```

Wait for `READY`, confirm the production domain points to the new deployment, and repeat live checks. `.gitignore` excludes `.env`, runtime databases, dependencies, build output, `.vercel` authentication state and local artifacts. The build regenerates downloadable documentation from the uploaded root files. Run from the repository root rather than uploading `frontend/` alone with these project settings. [Vercel project linking](https://vercel.com/docs/cli/link), [deployment commands](https://vercel.com/docs/cli/deploy)

## Reproduce a separate installation

1. Authenticate the intended hosting accounts and make the reviewed repository accessible to Render. Exclude credentials, runtime data and authentication state.
2. Create the root `render.yaml` Blueprint, reviewing its free plans, Frankfurt region, PostgreSQL 17 and private database access. Keep demo mode and guarded bootstrap enabled for a public demo.
3. Create the frontend project from the full repository with Root Directory `frontend` and outside-root source access.
4. Set the public API URL before the Vercel build and the exact confirmed frontend origin in Render CORS settings. Avoid wildcard origins.
5. Wait for successful provider deployment status, then verify actual HTTP responses, writes and UI behavior. Do not copy an existing project's IDs or provision resources in unrelated accounts.

For a real-data workspace, use a separate database, `WORKSPACE_MODE=real` and `AUTO_SEED_DEMO=false`, initialize the workspace through an authorized administration environment, and implement access controls before exposing private data.

## End-to-end verification

The first public run passed **22/22 checks**, completing on **24 October 2026 at 14:14:19 Asia/Qyzylorda (09:14:19 UTC)**. It confirmed public pages/assets, browser CORS/preflight, PostgreSQL-backed data and forecasts, negative-input rejection and order/inventory accounting. The report is saved locally as ignored `artifacts/live-smoke.json`; details and boundaries are recorded in [VERIFICATION.md](VERIFICATION.md).

Live browser checks also passed for landing navigation, data filters, persisted forecasts, inventory editing, CSV rejection, listing creation/deactivation, order cancellation/collection, impact and settings. Read-only API checks confirmed the UI-created listing and order states. These are targeted checks at the public origin; no full mobile, cross-browser or accessibility certification is claimed.

A separate targeted PostgreSQL race passed **9/9 checks** at 14:22:33 Asia/Qyzylorda (09:22:33 UTC): two requests launched together for one listing unit returned one 201 and one 409, with exactly one stored order. Cancelling that order and deactivating the QA listing restored the original inventory balances; impact/write-off values did not change. The local report is ignored `artifacts/postgres-order-race.json`. This is one targeted concurrency case, not a load test.

Run from the repository root:

```powershell
python scripts/verify_live.py --frontend-url https://saqta-batyrkekw.vercel.app --api-url https://saqta-api.onrender.com/api --write-demo --report artifacts/live-smoke.json
```

The script requires a synthetic demo before writing. It never resets the database, records QA entity IDs, reconciles QA stock and deactivates its test product/listing. Read-only checks are the default when `--write-demo` is omitted. `--allow-local` enables local rehearsal only.

For the synthetic public demo, use an unauthenticated browser to verify dashboard filtering, forecast explanation, inventory forms, order confirmation/cancellation/collection, impact, import preview/commit, savings, pricing and responsive navigation. API checks alone do not verify browser interactions or layout.

## Public demo limits

Public visitors can read/change synthetic records and reset the demo. No private bakery data, personal customer information or real payments belong here. Listings expire after pickup windows; restarting preserves existing records. The explicitly confirmed demo reset creates fresh synthetic records when needed. Recovered weight is accounting weight from catalog values, not physical weighing. Synthetic impact and forecast accuracy are not real-world operating results.

Separate real-mode authentication, organization isolation and subscription checks are implemented in the new source and tested locally; they do not enable private use of the public demo. Durable backups, restore drills, rate limiting, independent security review, broader PostgreSQL concurrency scenarios and load testing remain follow-up work. Local Docker Compose was not executed; Render's container build, startup and live database integration were verified.

## Sources

[Render Blueprint fields](https://render.com/docs/blueprint-spec), [free Render instances](https://render.com/docs/free), [Render monorepo support](https://render.com/docs/monorepo-support), [Vercel monorepo settings](https://vercel.com/docs/monorepos/monorepo-faq), [Vercel project linking](https://vercel.com/docs/cli/link), [Vercel CLI deployment](https://vercel.com/docs/cli/deploy).
