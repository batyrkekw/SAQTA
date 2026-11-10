# SaqtaFood

Продукт для пекарен Казахстана с интерфейсом на русском, казахском и английском. Казахские формулировки требуют проверки носителем языка перед публичным запуском.

- **SaqtaFood Save**: публикация доступных остатков, поиск предложений, бронирование, отмена и выдача заказов; заявки благотворительных организаций подтверждает продавец. Новая учётная запись получает роль покупателя, роли бизнеса и благотворительной организации подтверждает оператор.
- **SaqtaFood Forecast**: импорт CSV/XLSX с проверкой перед сохранением, анкета при отсутствии истории, прогноз по собственным данным и проверка на прошлых наблюдениях. Оценки анкеты обозначены как предварительные; прогноз не создаёт остатки или предложения Save.

Текущее использование бесплатно. Оплата не подключена; сохранённые расчёты комиссии и старые записи подписок не являются начислением платежей. Реальные метрики эффективности, число клиентов и коммерческие результаты: **пока нет данных**.

Стек: FastAPI, SQLAlchemy, Alembic; Next.js 16, React 19, TypeScript, Tailwind. Локально используется SQLite. Рабочее пространство по умолчанию реальное и пустое, данные организаций изолированы; демонстрационное наполнение отключено.

## Локальный запуск

Нужны **Python 3.12** и **Node.js 24 LTS**. Выполняйте команды из корня репозитория. Файлы `.env` не добавляйте в Git; повторное копирование заменит ваши локальные настройки.

Linux/macOS — установка:

```sh
python3.12 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.lock.txt
npm ci --prefix frontend
cp backend/.env.example backend/.env
```

Первый терминал — API:

```sh
cd backend
.venv/bin/python -m alembic upgrade head
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Второй терминал — интерфейс:

```sh
cd frontend
NEXT_PUBLIC_API_URL=http://127.0.0.1:8001/api npm run dev -- --port 3000
```

Windows PowerShell — установка:

```powershell
py -3.12 -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.lock.txt
npm ci --prefix frontend
Copy-Item backend/.env.example backend/.env
```

Первый терминал — API:

```powershell
cd backend
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Второй терминал — интерфейс:

```powershell
cd frontend
$env:NEXT_PUBLIC_API_URL = 'http://127.0.0.1:8001/api'
npm run dev -- --port 3000
```

Откройте [интерфейс](http://127.0.0.1:3000) и зарегистрируйтесь. [Документация API](http://127.0.0.1:8001/docs) доступна локально. Миграции применяются без автоматического наполнения данными. Остановка каждого процесса — `Ctrl+C`.

## Переменные окружения

Backend читает `backend/.env`, когда запускается из `backend/`. Все параметры ниже уже предусмотрены кодом; секреты остаются на сервере.

| Переменная | По умолчанию / назначение |
| --- | --- |
| `DATABASE_URL` | `sqlite:///./saqta.db`; локальная БД |
| `WORKSPACE_MODE` | `real`; обычная работа с отдельными организациями |
| `AUTO_SEED_DEMO` | `false`; синтетическое наполнение только при явном включении в режиме `demo` |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000`; разрешённые адреса интерфейса, список CSV или JSON |
| `SAQTA_TIMEZONE` | `Asia/Qyzylorda`; календарные даты продукта |
| `AUTH_SESSION_HOURS` | `168`; срок действия сессии |
| `AUTH_REGISTRATION_ENABLED` | `true`; разрешить регистрацию |
| `ADMIN_TOKEN` | Пусто — `/api/admin/*` отключён; задайте отдельный случайный секрет для оператора |
| `RATE_LIMIT_ENABLED` | `true`; включить ограничение попыток |
| `RATE_LIMIT_MAX_KEYS` | `10000`; максимальное число ключей лимитера в памяти |
| `RATE_LIMIT_PICKUP_MAX_ATTEMPTS` | `5`; попыток ввода кода для одного заказа бизнеса |
| `RATE_LIMIT_PICKUP_WINDOW_SECONDS` | `300`; окно ограничения кода в секундах |
| `LOGIN_MAX_ATTEMPTS` | `10`; попыток входа отдельно для IP и нормализованного email |
| `LOGIN_WINDOW_SECONDS` | `300`; окно ограничения входа в секундах |
| `REGISTER_MAX_ATTEMPTS` | `5`; попыток регистрации с одного IP |
| `REGISTER_WINDOW_SECONDS` | `3600`; окно ограничения регистрации в секундах |
| `FORECAST_REQUIRES_SUBSCRIPTION` | `false`; оставьте выключенным для текущего бесплатного Forecast; параметр совместимости со старой логикой |
| `DEMO_ANCHOR_DATE` | Не задана; необязательная дата `YYYY-MM-DD` для воспроизводимых синтетических примеров |
| `LLM_BASE_URL` | Пусто; необязательный сервер объяснений с совместимым API, численный прогноз работает без него |
| `LLM_MODEL` | `Qwen/Qwen3-0.6B`; модель необязательного сервера объяснений |
| `LLM_API_KEY` | Пусто; секрет необязательного сервера объяснений |
| `NEXT_PUBLIC_API_URL` | Переменная frontend: для команд выше `http://127.0.0.1:8001/api`; значение по умолчанию в коде использует порт `8000` |

Лимитер хранится в памяти одного процесса и сбрасывается при его перезапуске; запуски с несколькими процессами не разделяют счётчики. Ответ ограничения — `429` с `Retry-After`. Операторские запросы ограничены 60 попытками в минуту на IP.

Админ-API использует `Authorization: Bearer <ADMIN_TOKEN>`: `GET /api/admin/pending`, `POST /api/admin/approve`, `POST /api/admin/reset-password`. Сброс пароля завершает все сессии пользователя. Токен администратора не передаётся в frontend.

Для ручных операций используйте [инструкцию оператора](docs/OPERATOR.md) и `scripts/operator.py`. Скрипт читает `API_URL` и `ADMIN_TOKEN` из окружения; новый пароль вводится скрыто.

## Проверки

Из `backend/` (на Windows замените `.venv/bin/python` на `.venv/Scripts/python.exe`):

```sh
.venv/bin/python -m ruff check app tests
.venv/bin/python -m pytest -q
.venv/bin/python -m alembic check
```

Из `frontend/`, с заданным выше `NEXT_PUBLIC_API_URL`:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Обычный набор backend-тестов использует SQLite. Не задавайте `SAQTA_TEST_DATABASE_URL` для этого набора: эта переменная отдельно включает существующие тесты PostgreSQL. Исторические документы в [docs/](docs/) сохранены как архив и не заменяют этот README.
