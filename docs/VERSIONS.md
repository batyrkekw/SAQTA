# SAQTA installed versions

Recorded on **24 October 2026** from the local installation. Frontend versions were checked with `npm ls --depth=0`; backend versions were checked with `python -m pip list --format=json` and agree with `backend/requirements.lock.txt`. These are the versions actually installed for verification, not a list of proposed dependencies.

## Runtimes and storage

| Component | Version / status |
| --- | --- |
| Local Python | 3.12.5 |
| Local Node.js | 25.2.1 |
| Deployment Node.js image | `node:24-alpine` (Node 24 LTS target; image not built locally) |
| Deployment Python image | `python:3.12-slim` (image not built locally) |
| Local database | SQLite via Python standard library |
| Compose PostgreSQL image | `postgres:17-alpine` (configured; not run locally) |

The Docker image tags pin major/minor release families, not immutable image digests. Docker is unavailable on this verification machine. Local SQLite checks do not establish PostgreSQL or hosting behavior. The previous public release was separately verified against Render PostgreSQL 17 and Vercel; those historical results do not verify this update. New-release deployment/migration results are tracked separately. See [VERIFICATION.md](VERIFICATION.md) for executed checks.

## Frontend runtime dependencies

| Package | Installed version |
| --- | --- |
| `@hookform/resolvers` | 5.2.2 |
| `lucide-react` | 1.61.0 |
| `next` | 16.4.3 |
| `react` | 19.3.1 |
| `react-dom` | 19.3.1 |
| `react-hook-form` | 7.91.0 |
| `recharts` | 3.10.1 |
| `zod` | 4.6.7 |

## Frontend development dependencies

| Package | Installed version |
| --- | --- |
| `@tailwindcss/postcss` | 4.3.3 |
| `@testing-library/jest-dom` | 7.0.1 |
| `@testing-library/react` | 16.3.3 |
| `@testing-library/user-event` | 14.6.8 |
| `@types/node` | 24.19.2 |
| `@types/react` | 19.3.0 |
| `@types/react-dom` | 19.3.0 |
| `eslint` | 9.39.5 |
| `eslint-config-next` | 16.4.3 |
| `jsdom` | 26.1.0 |
| `tailwindcss` | 4.3.3 |
| `typescript` | 5.9.3 |
| `vitest` | 4.1.12 |

`frontend/package.json` pins direct dependencies. `frontend/package-lock.json` records their complete resolved npm dependency graph. Use `npm ci` to reproduce it. React and React type packages have independently versioned releases.

## Backend installed dependency lock

The table includes direct and transitive packages, including test/lint tools. The local virtual environment also has pip 24.2, which is an installer and is not part of the application dependency lock.

| Package | Installed version |
| --- | --- |
| `alembic` | 1.16.5 |
| `annotated-types` | 0.8.0 |
| `anyio` | 4.15.1 |
| `certifi` | 2026.10.23 |
| `click` | 8.5.0 |
| `colorama` | 0.4.6 |
| `et_xmlfile` | 2.0.0 |
| `fastapi` | 0.119.0 |
| `greenlet` | 3.5.6 |
| `h11` | 0.16.0 |
| `httpcore` | 1.0.9 |
| `httptools` | 0.9.0 |
| `httpx` | 0.28.1 |
| `idna` | 3.20 |
| `iniconfig` | 2.3.1 |
| `Mako` | 1.4.3 |
| `MarkupSafe` | 3.0.4 |
| `numpy` | 2.5.4 |
| `openpyxl` | 3.1.5 |
| `packaging` | 26.3 |
| `pandas` | 2.3.2 |
| `pluggy` | 1.7.0 |
| `psycopg` | 3.2.10 |
| `psycopg-binary` | 3.2.10 |
| `pydantic` | 2.14.1 |
| `pydantic-settings` | 2.10.1 |
| `pydantic_core` | 2.50.1 |
| `Pygments` | 2.21.0 |
| `pytest` | 8.4.2 |
| `python-dateutil` | 3.0.0 |
| `python-dotenv` | 1.2.4 |
| `python-multipart` | 0.0.20 |
| `pytz` | 2026.5 |
| `PyYAML` | 6.0.3 |
| `ruff` | 0.13.1 |
| `six` | 1.17.0 |
| `SQLAlchemy` | 2.0.43 |
| `starlette` | 0.48.0 |
| `typing-inspection` | 0.4.4 |
| `typing_extensions` | 4.16.0 |
| `tzdata` | 2026.5 |
| `uvicorn` | 0.37.0 |
| `watchfiles` | 1.3.0 |
| `websockets` | 17.3 |

For a local environment matching this verification, install `backend/requirements.lock.txt` under Python 3.12. `backend/requirements.txt` identifies direct requirements and extras; installing that shorter file alone may resolve different transitive versions later. The Dockerfile's installation choice is visible in `backend/Dockerfile`; image execution remains unverified locally.

## Optional and future technology

CatBoost is neither installed nor implemented. Paid LLM APIs, GPU runtimes, payment processing, authentication providers, and email/SMS providers are not dependencies. The earlier Vercel/Render/PostgreSQL deployment was verified separately, as recorded in VERIFICATION.md. This update adds CSV/XLSX processing through installed openpyxl 3.1.5 and its et_xmlfile 2.0.0 dependency; it requires additive import migration c83f42d78b91. Current-source versions are not evidence that the new release is already live. Railway remains an alternative configuration and local Docker Compose has not been run.
