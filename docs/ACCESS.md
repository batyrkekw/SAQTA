> Historical release documentation. For the current SAVE/FORECAST workflows, free analysis, roles and rollout settings, use [the 29 October 2026 refactor report](REFACTOR_2026_10_29.md) and [README](../README.md).

# Organization access and Forecast subscriptions

The existing public deployment remains `WORKSPACE_MODE=demo`: anonymous access is limited to the seeded synthetic organization. The subscription endpoint reports `access_mode: demo`, `active: false`, and no paid quota. Demo access is not a payment or an activated subscription. Real registration/login is rejected in demo mode before credentials are stored.

## Private real-data deployment

Use a separate database and backend configured with `WORKSPACE_MODE=real`, `AUTO_SEED_DEMO=false`, a narrowly configured `CORS_ORIGINS`, HTTPS, and migrations applied through `alembic upgrade head`. Do not point a real-data frontend at the public demo API. An empty migrated database needs no seed: registration creates the organization, one actual location, its settings, and an inactive free subscription. `python -m app.seed --empty` remains a maintenance utility, but does not create an authenticated owner; use registration for new customers.

- `POST /api/auth/register`: `{email,password,bakery_name,location_name?,address,city?}`. Passwords must have 10–128 characters; passwords are stored as salted scrypt hashes (`N=16384,r=8,p=1`, 32-byte derived key, random 16-byte salt).
- `POST /api/auth/login`: `{email,password}`. Registration/login return an opaque bearer token, expiry, user, organization and subscription. Session tokens have 48 random bytes and only their SHA-256 hashes are persisted.
- `GET /api/auth/me`: authenticated owner, organization and subscription.
- `POST /api/auth/logout`: revokes that database session. Sessions expire after `AUTH_SESSION_HOURS` (default 168 hours).
- `GET /api/subscription`: authoritative status, expiry, plan limits, current local calendar-month forecast usage, remaining runs, and explicit activation/payment limitations.
- `POST /api/locations`: `{name,address,city?}`; an active Pro organization can add locations up to its limit. Registration always supplies the first location.

The frontend uses `Authorization: Bearer <token>`; no client-supplied organization ID chooses the tenant. The raw DB dependency is wrapped by a request-scoping dependency, so replacing a DB session for tests does not remove authentication. All ORM reads, aggregates, updates and deletes are constrained to the current organization; inventory/records/listings are constrained through their product/location, and order items through their order. Ownership is also checked before ORM flush. This is application-level isolation, not PostgreSQL row-level security. Maintenance scripts use intentionally unscoped sessions and must remain server/operator tools.

The current real-mode Save workspace is organization-scoped; a separate public multi-seller buyer identity and checkout flow has not been implemented. Anonymous real-data APIs are rejected. The existing shared synthetic demo checkout remains available.

## Manual activation, without payment simulation

Only an operator with server/database access can activate a real organization's Forecast subscription:

```bash
cd backend
python -m app.subscription_admin --email owner@example.com --plan starter --days 30
# Or: --plan pro
```

The command checks the real workspace and registered owner, records activation/expiry, and clearly states that it did not charge a payment. There is no public activation endpoint. The dashboard cannot activate its own paid plan.

| Plan | Active products eligible for Forecast analysis | Successful forecast runs/month | Locations |
| --- | ---: | ---: | ---: |
| Free / inactive Forecast | 3 | 0 | 1 |
| Starter | 20 | 300 | 1 |
| Pro | 100 | 1,000 | 10 |

Catalog creation/reactivation, organization-owned inventory and Save publication remain available independently of Forecast product quotas; a fourth or later Save product does not require a paid Forecast plan. Product-count limits are checked only when accessing paid Forecast analysis/import functions, against the active assortment; they do not cap the free Save catalog. Forecast generation, assortment forecast runs, historical backtests, fresh forecasting dashboard analysis, and all file-inspection/preview/commit endpoints require an active unexpired paid subscription in real mode. Inactive/expired plans return HTTP 402; Forecast-analysis product/location limit violations return 403. A successful assortment run spends one allowance regardless of the number of products. A stable forecast-run idempotency key replays the stored result without consuming another allowance; insufficient-history-only diagnostics and failed transactions do not consume allowance. The atomic monthly conditional update rejects exhausted forecast allowance with HTTP 429. Forecast quota is shared by legacy per-product forecasts and assortment runs; import/backtest access does not itself spend a forecast-run allowance. Usage is not reset by switching paid plans mid-month.

## Data-source and verification isolation

An organization has a persisted `real` or `demo` source. Changing an environment variable cannot relabel synthetic records into real observations. Demo data queries exclude explicit `is_test_data` products, listings and orders (and their child records). Verification may opt into them with `X-SAQTA-Verification: include` only in demo mode. The header never broadens real organization ownership. The marker is not inferred from an arbitrary customer name or product name. Explicit test-product creation is rejected in real mode.

Demo reset refuses any database containing a real organization, including organizations hidden by the current demo scope. No tenant data is automatically deleted during migration.

## Remaining security work

This MVP adds functional authentication and organization isolation, but is not a completed commercial security program. Email verification, password reset/change, MFA, account invitations/roles, login rate limiting and abuse prevention, audit-log retention, independent penetration testing, and database-level RLS remain future work. Use HTTPS and operator-managed deployment access, review backup/retention controls, and obtain a security review before onboarding sensitive commercial records. No billing provider, payment collection or automatic renewal is integrated.
