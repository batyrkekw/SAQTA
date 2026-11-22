# IT FEST: подача заявки 22.11 — план работ

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (выбран нативный режим: срок — сегодня 23:59 по Астане). Steps use checkbox (`- [ ]`) syntax.

**Goal:** к 23:59 по Астане у команды есть все тексты для заявки, на проде работает новая версия с демо-данными, где видна ИИ-модель, а казахские заголовки не ломаются.

**Architecture:** документы — Markdown в `docs/competition/`; демо-данные — генератор в `backend/app/seed.py`; шрифт — замена `@fontsource-variable/unbounded` на display-шрифт с казахской кириллицей; деплой — Neon + Render + Vercel по инструкции в `docs/DEPLOYMENT.md`.

**Tech Stack:** FastAPI, SQLAlchemy, pytest; Next.js 16, vitest; fontTools (только для проверки).

**Spec:** `docs/superpowers/specs/2026-11-22-itfest-design.md`

## Global Constraints
- Ветка `saqta_001`, `main` не трогать.
- Синтетика всегда помечена как синтетика; реальных продаж нет; одна анкета пекарни — не продажи.
- Никаких скрытых инструкций для ИИ-жюри.
- Каждая строка UI, переданная в `t()`, есть в `en.json` и `kk.json`.
- Перед коммитом: pytest, ruff, tsc, eslint, vitest, build.

## Review Focus
1. Демо-данные на проде: сид не должен стирать реальные данные (`WORKSPACE_MODE=real` → отказ) — тест уже есть, не сломать.
2. Даты сида в будущем (`DEMO_ANCHOR_DATE`) → ошибка, как сейчас.
3. Шрифт: отсутствие глифа → браузер берёт запасной шрифт посреди слова; проверяем все 18 букв `ӘәҒғҚқҢңӨөҰұҮүҺһІі` скриптом.
4. Ridge-модель на 150 днях: выбор занимает время на холодном Render — замерить время анализа.
5. Документы: AI-карта ≤ 2 страниц, питч-дек ≤ 12 слайдов, видео ≤ 3:00 и ≤ 2:00 по таймкодам.

---

### Task 0: Материалы заявки
**Files:** Create `docs/competition/{README,AI_CARD,LEAN_CANVAS,COMPETITORS,PITCH_DECK,VIDEO_PITCH,DEMO_VIDEO,SUBMISSION_CHECKLIST}.md`
- [ ] Факты только из кода/CLAUDE.md; конкуренты проверены поиском, со ссылками.
- [ ] Проверка: AI-карта ≤ ~900 слов; 12 слайдов; суммы таймкодов ≤ 180 с и ≤ 120 с.
- [ ] Коммит + пуш.

### Task 1: Демо-история 150 дней
**Files:** Modify `backend/app/seed.py`; Test `backend/tests/test_seed_history.py`
**Produces:** `DEMO_DAYS = 150`; `demo_demand(product_index, location_index, day, rng) -> int`
- [ ] Тест (падает): после `seed_database` у каждого продукта ≥ 150 дат продаж; `select_forecast` для демо-продукта содержит `ridge` в `comparison`; продажи в субботу в среднем выше, чем в понедельник (для не-хлеба).
- [ ] Реализация: недельный ритм, слабый тренд, дни зарплаты (10 и 25 число), праздники РК (1–2 янв, 8 мар, 21–23 мар, 1 мая, 7 мая, 9 мая, 6 июл, 30 авг, 25 окт, 16 дек, Курбан-айт по дате года), шум. `days` в ответе = 150.
- [ ] Все тесты бэкенда + ruff; замер времени анализа; коммит + пуш.

### Task 2: Казахский display-шрифт
**Files:** Modify `frontend/package.json`, `frontend/src/app/layout.tsx` (импорт), `globals.css`, `home.module.css`, `forecast-playground.module.css`, `home-community.module.css`; Create `scripts/check_kazakh_glyphs.py`
- [ ] Скрипт (падает на Unbounded): fontTools читает woff2 из `node_modules/@fontsource*/files/*cyrillic*` и проверяет 18 букв.
- [ ] Выбрать шрифт, где скрипт проходит; заменить семейство; убрать `Georgia` из `.hero-caption`.
- [ ] Фронтенд-проверки; скриншоты 1280/390 × RU/KK/EN; коммит + пуш.

### Task 3: Деплой и инструкция
**Files:** Rewrite `docs/DEPLOYMENT.md`
- [ ] Пошагово: Neon (создать проект, строка подключения), Render (Blueprint/переменные, `BILLING_SIMULATOR`, `CORS_ORIGINS`, демо-данные), Vercel (root `frontend`, production branch `saqta_001`, `NEXT_PUBLIC_API_URL`).
- [ ] После нажатий пользователя: проверить `/api/health`, главную, прогноз на проде; коммит + пуш.
