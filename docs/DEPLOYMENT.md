# SAQTA public demo deployment

The previous SAQTA release is publicly deployed with **Vercel frontend + Render API + Render PostgreSQL**. The live demo contains synthetic records and has no authentication. This working tree restructures the product into Forecast/Save/About and adds new forecast and import tools. **Deployment of this update is pending verification**; the historical live results below do not establish that its new code or migration is deployed.

## Verified public resources

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
| Render API deployment | `dep-dbe7cavavr4c739u63ag`, `LIVE` at 14:12:41 Asia/Qyzylorda (09:12:41 UTC) |
| Render PostgreSQL | `dpg-dbe77a3rjlhs73emj1f0-a`, PostgreSQL 17, free, Frankfurt; external IP allowlist empty |
| Initial application source | Commit `af21fef1eb7f3f570f1ec05f9286e623ce9fb372` |

Resource IDs are identifiers, not credentials. Database connection strings, tokens and local authentication state are deliberately excluded from source and documentation.

The table records the first verified production deployment. Subsequent documentation/source releases retain the same public origin; inspect the provider's production deployment for its current deployment ID rather than treating the first ID as a moving alias.

The database was created on 24 October 2026 and expires **23 November 2026 at 14:00:24 Asia/Qyzylorda (09:00:24 UTC)**. It has no backups. The free API can sleep after 15 minutes without requests and take about a minute to wake. Export or migrate data, or explicitly select a paid plan, before expiry if persistence is required. [Render free-instance limits](https://render.com/docs/free)

## Existing service configuration

### Update order for the unified product

Current local checks are complete: 86 backend tests, 63 frontend tests across 12 files, Ruff, strict TypeScript, zero-warning ESLint and the production frontend build (12 static pages). Fresh SQLite migrations through c83f42d78b91 and synthetic seeding passed. These results do not verify the updated public deployment or its PostgreSQL migration; those release checks remain pending.

The new source keeps the existing Next.js/FastAPI/PostgreSQL stack. It uses Forecast's five internal views, free Save publication and About; legacy URLs redirect into Forecast. Prices/quotas are preliminary configuration, not enforced subscriptions. Payment is not connected.

1. Run the complete backend/frontend tests, lint, strict types and production build on the final tree. Inspect the sanitized source report; the real workbook is a single survey response with no verified daily sales history.
2. Prepare a reviewed **synthetic-only source package**. Exclude `data/private/`, every real XLSX/XLS file, local databases, `.env`, tokens, `.vercel` state, `artifacts/`, caches and dependencies. Git ignore rules are a safeguard; inspect the actual upload manifest as well. Do not copy the private original or normalized survey into frontend public assets or the API image.
3. Preserve the existing database. Arrange a backup/export before migration for durable installations. Apply additive Alembic revision `c83f42d78b91` after `ee2260d736c6`; it creates import provenance/fingerprint tables without resetting the ledger. Never run demo reset during a release. Install the updated lock, including openpyxl 3.1.5 and et_xmlfile 2.0.0.
4. Release the API first to the intended existing service. Confirm provider build/runtime status, PostgreSQL migration through the new revision, `/api/health`, and `/api/backtest` with synthetic IDs. Exercise inspect → preview → commit and repeated-file deduplication with a clearly synthetic fixture, checking unchanged balances on rejection. A local SQLite migration test is not a PostgreSQL verification.
5. Build/release the frontend against the intended HTTPS API URL and exact CORS origin. The existing project requires the monorepo source with `frontend` root and outside-root build access. Its copy script publishes **only README, BRAND and API_CONTRACT**; `docs/internal/` and private data reports are not downloadable assets.
6. Verify the real public origin after the production alias updates: Forecast navigation and explanations; backtest metrics/source warnings; savings known examples; preliminary pricing and the informational paid-plan modal; preview errors/duplicates; free listing announcement generation/edit/copy; reserve/cancel/collect and oversell rejection; legacy redirects; mobile navigation. Do not infer UI success from API health alone.
7. Record exact release IDs, migration result, test counts, timestamps and any failures in `VERIFICATION.md`. Until those checks finish, the new release is unverified. No real workbook upload, subscription activation, notification setup or payment is part of this release.

The real-data preparation outputs remain ignored and local. If a private deployment is required later, use a separate real-origin database, disable auto-seeding and implement access controls before importing confidential files. Changing an environment variable cannot relabel an existing demo database.

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

The Docker command runs `alembic upgrade head`, guarded `python -m app.bootstrap`, then Uvicorn on `$PORT`. The previous deployment logs confirmed the PostgreSQL dialect, migration through ee2260d736c6 and successful demo initialization. The update additionally requires c83f42d78b91 before import commits can work. Bootstrap fills an empty demo once, preserves existing records, and refuses real-data workspaces. Never add `--reset` to startup.

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

Use an unauthenticated browser to verify dashboard filtering, forecast explanation, inventory forms, order confirmation/cancellation/collection, impact, import preview/commit, savings, pricing and responsive navigation. API checks alone do not verify browser interactions or layout.

## Public demo limits

Public visitors can read/change synthetic records and reset the demo. No private bakery data, personal customer information or real payments belong here. Listings expire after pickup windows; restarting preserves existing records. The explicitly confirmed demo reset creates fresh synthetic records when needed. Recovered weight is accounting weight from catalog values, not physical weighing. Synthetic impact and forecast accuracy are not real-world operating results.

Authentication, tenant isolation, durable backups, restore drills, rate limiting, broader PostgreSQL concurrency scenarios and load testing remain operational follow-up work. Local Docker Compose was not executed; Render's container build, startup and live database integration were verified.

## Sources

[Render Blueprint fields](https://render.com/docs/blueprint-spec), [free Render instances](https://render.com/docs/free), [Render monorepo support](https://render.com/docs/monorepo-support), [Vercel monorepo settings](https://vercel.com/docs/monorepos/monorepo-faq), [Vercel project linking](https://vercel.com/docs/cli/link), [Vercel CLI deployment](https://vercel.com/docs/cli/deploy).
