# SAQTA public demo deployment

Target: **Vercel frontend + Render API + Render PostgreSQL**. A localhost server is not a public deployment.

## Current state

Deployment preparation is complete. No public resources or verified live URLs have been created. Vercel and Render account connections are pending. The workspace has no Git remote; source must be uploaded to a repository accessible to the selected Render account, or supplied through a supported authenticated deployment flow. Do not reuse an unrelated or archived repository.

The configuration chooses free demo tiers rather than accepting paid defaults. Render permits one free PostgreSQL database per workspace; if occupied, choose another authorized workspace or explicitly approve a paid plan before provisioning. The free database expires after 30 days and has no backups. The API sleeps after 15 idle minutes and can take about a minute to wake. [Render's current free-instance limits](https://render.com/docs/free)

## Provision and connect

1. Authenticate the Vercel and Render integrations in the intended accounts. Create or select an appropriate source repository and upload the reviewed source, excluding `.env`, databases, virtual environments, dependencies, build output, `.vercel/`, and `artifacts/`.
2. Create the Render Blueprint from root `render.yaml`. Review its two free plans, Frankfurt region, PostgreSQL 17 and private database connection. Keep `WORKSPACE_MODE=demo` and `AUTO_SEED_DEMO=true` for this public demo.
3. Set `CORS_ORIGINS` to the production Vercel HTTPS origin without a trailing slash. If not yet assigned, create/link the Vercel project first, then configure its confirmed production origin before browser verification. Multiple required origins can be comma-separated; avoid a wildcard.
4. Wait for Render's deployment. Startup runs Alembic, guarded demo bootstrap, then Uvicorn on `$PORT`. Bootstrap is opt-in, refuses real-data workspaces and preserves existing data. Never add `--reset` to startup.
5. In Vercel, configure root `frontend`, Node 24, install `npm ci`, build `npm run build`. Enable **Include source files outside of the Root Directory in the Build Step** for documentation downloads.
6. Set build-time `NEXT_PUBLIC_API_URL=https://<confirmed-render-host>/api` and deploy to production. Configuration rejects missing, localhost and non-HTTPS API URLs on Vercel.
7. Confirm the production frontend is accessible without signing into Vercel and the API returns populated demo data. Record actual URLs and provider resource IDs only after success. Never put tokens or connection strings in this document.

## End-to-end verification

From the repository root, substitute confirmed public hosts:

```powershell
python scripts/verify_live.py --frontend-url https://<confirmed-vercel-host> --api-url https://<confirmed-render-host>/api --write-demo --report artifacts/live-smoke.json
```

The script requires a synthetic demo before writing. It never resets the database, records QA entity IDs, and verifies routes, brand assets, data, forecasts, inventory and order accounting. QA stock is reconciled and the created listing/product are deactivated after checks. Read-only checks are the default when `--write-demo` is omitted. `--allow-local` enables local rehearsal only; it does not constitute public verification.

Then use an unauthenticated browser to verify dashboard filtering, forecast explanation, inventory forms, listing creation, order confirmation/cancellation/collection, impact, CSV error feedback, economics and responsive navigation. Compare UI results with API data and save screenshots.

## Public demo limits

No authentication exists. Public visitors can read/change synthetic data and reset the demo. No private bakery data, personal customer information or real payments belong here. Listings expire after their pickup windows; restarting does not refresh them or overwrite the dataset. The explicitly confirmed reset action creates fresh synthetic records when needed.

## Sources

[Render Blueprint fields](https://render.com/docs/blueprint-spec), [free Render instances](https://render.com/docs/free), [Vercel monorepo settings](https://vercel.com/docs/monorepos/monorepo-faq), [Vercel CLI](https://vercel.com/docs/cli/deploy).
