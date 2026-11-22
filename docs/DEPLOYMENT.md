# Деплой SaqtaFood: пошагово, что нажимать

Сайт — **Vercel**, API — **Render** (бесплатный), база — **Neon** (бесплатная).
Всё разворачивается из ветки **`saqta_001`**. Ветку `main` не трогаем.

> Срочно: старая база Render PostgreSQL удаляется **23.11.2026 в 14:00 по Астане** (09:00 UTC).
> На ней лежат только синтетические демо-данные, переносить их не нужно — переключаем API на Neon.

**Секреты** (строка подключения Neon, ключи TipTop, пароль SMTP) вводятся **только в панелях** Render/Vercel
или в локальный `backend/.env` (он в `.gitignore`). Не вставляйте их в чат, код, issues и коммиты.

Текущие адреса: сайт `https://saqta-batyrkekw.vercel.app`, API `https://saqta-api.onrender.com/api`.

---

## 1. Neon — база данных (≈ 3 минуты)
1. Откройте [console.neon.tech](https://console.neon.tech) и войдите (можно через GitHub).
2. **New Project** → Name: `saqta` → Region: **AWS Europe Central 1 (Frankfurt)** (рядом с Render) → **Create**.
3. На странице проекта нажмите **Connect** → оставьте Branch `production`/`main`, Database `neondb` →
   переключатель **Connection pooling** выключите → **Copy snippet** (строка вида `postgresql://...neon.tech/neondb?sslmode=require`).
4. Пока держите строку в буфере обмена. Она нужна в шаге 2.

## 2. Render — API (≈ 5 минут + ~5 минут сборка)
1. Откройте [dashboard.render.com](https://dashboard.render.com) → сервис **saqta-api**.
2. **Settings → Build & Deploy → Branch** → выберите **`saqta_001`** → Save.
3. **Settings → Health Check Path** → `/api/health/live` → Save.
4. **Environment** → Edit и проверьте переменные (добавьте недостающие кнопкой **Add Environment Variable**):

   | Ключ | Значение |
   |---|---|
   | `DATABASE_URL` | строка из Neon (шаг 1.3) |
   | `WORKSPACE_MODE` | `real` |
   | `AUTO_SEED_DEMO` | `false` |
   | `FORECAST_REQUIRES_SUBSCRIPTION` | `true` |
   | `TRIAL_DAYS` | `14` |
   | `BILLING_TEST_MODE` | `true` |
   | `BILLING_SIMULATOR` | `true` (демо-оплата без денег) |
   | `CORS_ORIGINS` | `https://saqta-batyrkekw.vercel.app` |
   | `PUBLIC_URL` | `https://saqta-batyrkekw.vercel.app` |

   Остальные (`TIPTOP_*`, `SELLER_*`, `SMTP_*`, `MAIL_FROM`) пока можно оставить пустыми.
5. **Save, rebuild, and deploy**. При запуске контейнер сам выполнит `alembic upgrade head` и создаст таблицы в Neon.
6. Дождитесь статуса **Live** (вкладка Events). Откройте `https://saqta-api.onrender.com/api/health` — должно быть
   `"database":"connected"` и `"workspace_mode":"real"`.

## 3. Vercel — сайт (≈ 3 минуты + ~2 минуты сборка)
1. Откройте [vercel.com](https://vercel.com) → команда **SAQTA** → проект **saqta**.
2. **Settings → Environments → Production → Branch Tracking** → ветка **`saqta_001`** → Save.
   (В старом интерфейсе: **Settings → Git → Production Branch**.)
3. **Settings → Build and Deployment → Root Directory** = `frontend`; Node.js Version = **24.x**.
4. **Settings → Environment Variables** → `NEXT_PUBLIC_API_URL` = `https://saqta-api.onrender.com/api`
   (Environment: Production и Preview) → Save.
5. **Deployments** → у последнего деплоя ветки `saqta_001` нажмите **⋯ → Redeploy**
   (или просто сделайте push в `saqta_001`, Vercel соберёт сам).
6. Откройте сайт: заголовки должны быть шрифтом Geologica, на казахском — без «квадратиков» и смешанных шрифтов.

## 4. Демо-пекарня для жюри и видео
У бесплатного Render нет консоли, поэтому демо-пекарню создаём с вашего компьютера прямо в Neon.

1. В файле `backend/.env` временно поставьте `DATABASE_URL=<строка Neon>` (файл не попадает в Git).
2. В PowerShell из папки `backend`:
   ```powershell
   .venv\Scripts\python -m app.showcase --credentials-file ..\artifacts\showcase-accounts.json
   ```
   Команда создаст пекарню «Нан үйі · демо» со **150 днями** синтетических продаж, свежие предложения в Save
   и два аккаунта (пекарня и покупатель). Логины и пароли — только в `artifacts/showcase-accounts.json`
   (не в Git, на экран не печатаются).
3. Верните в `backend/.env` локальную базу: `DATABASE_URL=sqlite:///./saqta.db`.
4. **Утром в день показа** запустите команду ещё раз: предложения Save истекают вместе со временем самовывоза.

## 5. Проверка после деплоя
- `https://saqta-api.onrender.com/api/health` → `"status":"ok","database":"connected"`.
- Главная открывается на RU/KK/EN, заголовки на казахском — одним шрифтом.
- Вход демо-пекарней → Forecast → «Построить прогноз»: в сравнении методов есть ридж-регрессия.
- Save показывает предложения демо-пекарни.

## 6. Перед выступлением
- За 2 минуты откройте `/api/health`: бесплатный Render засыпает после 15 минут без запросов и просыпается ~50 секунд.
- Workflow **Keep API warm** (`.github/workflows/keep-warm.yml`) пингует API каждые 10 минут. GitHub запускает
  расписания только из ветки по умолчанию (`main`), там этот файл уже есть. Проверьте во вкладке **Actions**,
  что workflow включён (GitHub отключает его через 60 дней без активности в репозитории).

## Ограничения бесплатных тарифов
| Сервис | Ограничение |
|---|---|
| Neon Free | 1 ГБ хранилища, 100 CU-часов в месяц на проект ([лимиты](https://neon.com/faqs/free-plan-limits-and-quotas)); база засыпает через 5 минут без запросов и просыпается за ~1 с |
| Render Free | засыпает через 15 минут, ~50 с на пробуждение; 750 часов в месяц |
| Vercel Hobby | для некоммерческих проектов; для продаж нужен Pro |

## Резервные копии Neon
- На бесплатном тарифе Neon хранит историю изменений (point-in-time restore) ограниченное время.
  Восстановление: проект → **Backup & Restore** (или **Branches → Restore**) → выбрать момент времени.
- Ручная копия раз в неделю (нужен установленный PostgreSQL client, строка из Neon):
  ```powershell
  pg_dump "<строка Neon>" --format=custom --file "saqta-$(Get-Date -Format yyyy-MM-dd).dump"
  ```
  Храните файл не в репозитории. Восстановление: `pg_restore --clean --dbname "<строка>" файл.dump`.

## Где хранятся данные (закон РК)
Neon и Render — Франкфурт (Германия). Пункт 2 статьи 12 Закона РК «О персональных данных и их защите»
требует хранить персональные данные граждан РК в базе на территории Казахстана. Пока это демо-стадия
с синтетическими данными. До работы с реальными покупателями базу и API нужно перенести к провайдеру
в Казахстане (например, PS Cloud Services или QazCloud) и обновить `/privacy`.
