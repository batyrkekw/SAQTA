# Free deployment: Neon + Render + Vercel

Current target, chosen on 18 November 2026. Replaces the Render PostgreSQL free database,
which expires on **23 November 2026, 09:00 UTC** and has no backups.

| Part | Service | Free-plan limits that matter |
|---|---|---|
| Database | [Neon](https://neon.com/faqs/free-plan-limits-and-quotas) | 100 CU-hours per project per month, 1 GB storage; compute sleeps after 5 idle minutes and wakes on the next query |
| API | [Render](https://render.com/docs/faq) free web service | Sleeps after 15 idle minutes, about a minute to wake; 750 instance hours per month per workspace |
| Website | Vercel Hobby | Root directory `frontend` |

To fit these limits, Render's health check and the keep-warm workflow use `/api/health/live`,
which never queries the database. `/api/health` still checks the database for manual diagnosis.

## 1. Neon (owner, in the Neon dashboard)

1. Create a project in region **AWS Europe Central (Frankfurt)**, close to the Render API.
2. Open **Connect**, choose the default branch and database, and copy the connection string.
   The direct string is preferred; the `-pooler` string also works (the API disables prepared
   statements for it automatically).
3. Do not paste the string into chats, issues or Git. It contains the database password.

## 2. Render (owner, in the Render dashboard)

1. `saqta-api` → **Environment**: set `DATABASE_URL` to the Neon string. Check
   `CORS_ORIGINS=https://saqta-batyrkekw.vercel.app`, `WORKSPACE_MODE=real`, `AUTO_SEED_DEMO=false`.
2. **Settings → Health Check Path**: `/api/health/live`.
3. Deploy the `main` branch. On start the container runs `alembic upgrade head` and creates
   the schema in Neon.
4. Check `https://saqta-api.onrender.com/api/health` → `"database": "connected"`.
5. The old Render PostgreSQL held only synthetic demo data. After step 4 succeeds it can be
   deleted or left to expire.

## 3. Vercel (owner, in the Vercel dashboard)

1. Project `saqta` → **Settings → Environment Variables**:
   `NEXT_PUBLIC_API_URL=https://saqta-api.onrender.com/api` (Production).
2. Confirm the Git connection deploys `main` with root directory `frontend`, then redeploy.
   On 18 November 2026 the public site still showed a build older than the 29 October refactor.

## 4. Demo bakery for a presentation

The free Render plan has no shell, so the seeder runs from a developer machine against Neon:

```sh
cd backend
# Put DATABASE_URL=<Neon string> into backend/.env (ignored by Git), then:
.venv/bin/python -m app.showcase --credentials-file ../artifacts/showcase-accounts.json
```

It creates «Нан үйі · демо» with eight weeks of illustrative sales, today's offers with
allergens, and demo bakery/buyer accounts. Passwords are written only to the credentials
file. Offers expire with their pickup window: **run the command again on the morning of the
presentation** to publish fresh ones. Afterwards restore your local `DATABASE_URL`.

## 5. Before the presentation

- Open the API health URL about two minutes before going on stage.
- Check that the GitHub Actions workflow **Keep API warm** is enabled (GitHub turns off
  scheduled workflows in repositories without activity for 60 days).
