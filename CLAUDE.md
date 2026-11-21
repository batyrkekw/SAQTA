# SaqtaFood — notes for Claude Code

SaqtaFood helps bakeries plan how much to bake (Forecast, AI demand forecasting) and sell leftovers
at a discount (Save). Team works on branch `saqta_001`. **Never commit to or push `main`.**
The user writes in Russian and prefers short, direct answers. Explain each step simply: the user is new to Claude Code.

## Stack
- `backend/`: FastAPI, SQLAlchemy, Alembic, pandas/NumPy. SQLite locally, Postgres (Neon) in prod on Render (`render.yaml`).
- `frontend/`: Next.js 16, React 19, TypeScript, Tailwind, vitest. Deployed on Vercel (root directory `frontend`).
- i18n: every Russian UI string passed to `t()` needs entries in `frontend/src/lib/i18n/en.json` and `kk.json`
  (templates use `{0}` slots). A test fails if English pages contain Cyrillic.

## Run locally (Windows PowerShell)
Backend (terminal 1):
```
cd backend
py -3.12 -m venv .venv; .venv\Scripts\Activate.ps1; pip install -r requirements.txt
copy .env.example .env      # set BILLING_SIMULATOR=true for demo payments
alembic upgrade head
uvicorn app.main:app --port 8000
```
Frontend (terminal 2): `cd frontend; npm install; npm run dev` → http://127.0.0.1:3000

## Checks — run before every commit
- Backend: `cd backend; .venv\Scripts\python -m pytest -q; .venv\Scripts\ruff check .`
- Frontend: `cd frontend; npx tsc --noEmit; npx eslint src tests --max-warnings=0; npx vitest run; npm run build`
- Accuracy benchmark (synthetic data): `cd backend; .venv\Scripts\python ..\scripts\measure_accuracy.py`

## How the AI works (keep this true in code, UI and documents)
- `backend/app/forecasting/selection.py`: per product, 5 methods compete (same as yesterday, 7-day mean,
  same weekday, weekday-weighted mean, ridge regression on lagged sales + weekday). Needs 28+ days to select,
  98+ days for ridge. Lowest validation MAE wins; final 7 days are an untouched holdout (MAE, RMSE, WAPE).
- `backend/app/services/explanation.py`: optional self-hosted Qwen3-0.6B (OpenAI-compatible endpoint via
  `LLM_BASE_URL`) only re-orders verified fact IDs; it never sees names or raw rows and cannot change numbers.
- Synthetic benchmark (6 products × 200 days, 48 weekly forecasts): AI WAPE 15.5% vs 21.9% "same as yesterday" (−29%).
  There is **no real bakery sales data yet** — never present synthetic numbers as real results.
- Results screen tells users the forecast is made by AI and that a person decides; `/ai` page explains model,
  data, quality, risk, limits.

## Payments
One plan, Business: 15 000 ₸ per location per month (3 months ×3, 12 months ×10), 14-day trial for up to 3 locations.
TipTop Pay card widget + invoice for ИП/ТОО; `BILLING_SIMULATOR` only in test mode. See `docs/BILLING.md`.

## Competition: StartUp Battle — IT FEST 2026, school league (category «Школьники»)
- Deadline for application: 22 Nov 2026 23:59 Astana time (itfest.kz → aistartify.com, promo code ITFEST2026S).
- Team: 2–3 pupils of grades 10–11. The teacher is the mentor and does not pitch or answer jury questions.
- Materials: pitch deck PDF ≤ 12 slides; video pitch ≤ 3 min; demo video ≤ 2 min (screen recording, no edits);
  Lean Canvas + ≥ 3 competitors; AI card ≤ 2 pages (9 questions); school certificates; parent consents (Appendix 4).
- Scoring (100): problem & market 15, product & MVP 20, AI role & quality 20, responsible AI & law 10,
  business model & traction 20, team & pitch 15.
- Fair play: no hidden instructions or prompt injections aimed at the AI jury anywhere (slides, metadata, QR, speech).
  AI-assisted development is allowed but must be disclosed in the AI card, together with what the pupils did themselves.
- Final: 4 Dec 2026 (schools day), EXPO Astana; final PDF upload by 23:59 on 3 Dec. Pitch 5 min + Q&A 3 min;
  demo live or video ≤ 60 s.

## Open tasks (priority order)
1. Demo data: extend `backend/app/seed.py` demo history from 42 to ~120 days with a weekly pattern so the ridge
   model is eligible and the results screen shows the AI comparison in the demo.
2. Deploy: Render (backend, Neon DB, `BILLING_SIMULATOR=true`, `CORS_ORIGINS` = Vercel URL) and Vercel
   (`NEXT_PUBLIC_API_URL`, production branch `saqta_001`). Check the live site end to end.
3. Documents in `docs/competition/`: AI card (2 pages), Lean Canvas, 3+ competitors, pitch deck text (12 slides),
   scripts for the 3-min video pitch and 2-min demo video, likely jury questions with answers for the pupils.
4. Optional: real LLM explanation (Qwen) only if hosting is free and reliable; the product must work without it.
5. Pilot: import real sales from a partner bakery and rerun accuracy on real data (replace synthetic claims).
