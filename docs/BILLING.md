# Оплата SaqtaFood Forecast

Один тариф **Business: 15 000 ₸ в месяц за точку** (1–50 точек). На точку: 100 продуктов и 500 запусков анализа в месяц. Оплата за 3 месяца — ×3, за 12 месяцев — ×10 (два месяца в подарок). Оплатить меньше точек, чем уже создано, нельзя. Та же оплата с тем же числом точек продлевает срок; другое число точек начинает новый период сегодня.
Новая бизнес-организация получает **14 дней бесплатно, до 3 точек**, без карты (`TRIAL_DAYS`). SaqtaFood Save бесплатен для покупателей; продавцы платят 5% с завершённой продажи.

Сервер проверяет тариф при каждом запуске анализа (`POST /api/analysis/runs`) и считает месячный лимит;
повтор того же запроса возвращает сохранённый результат и лимит не тратит.

## Способы оплаты

| Способ | Как работает | Что нужно для включения |
|---|---|---|
| Карта онлайн | Виджет TipTop Pay → уведомления Check/Pay (подпись HMAC) → тариф включается автоматически. Месячная оплата может продлеваться сама (recurrent). | ИП/ТОО, договор с TipTop Pay, `TIPTOP_PUBLIC_ID`, `TIPTOP_API_SECRET`, адреса уведомлений в кабинете |
| Счёт на оплату | Пекарня получает счёт с реквизитами (печать/PDF), платит переводом или Kaspi; оператор подтверждает по выписке → тариф включается | Реквизиты `SELLER_*` (наименование, БИН, IBAN, банк) |
| Тестовая оплата | Кнопка «Оплатить (тест)» без денег — для демо и проверки | `BILLING_SIMULATOR=true`, работает только без ключей TipTop |

Повторная оплата того же тарифа продлевает срок с даты окончания; смена тарифа начинает период с сегодняшнего дня.

## Запуск продаж: чек-лист

1. Зарегистрировать ИП (или ТОО), открыть расчётный счёт.
2. Заполнить `SELLER_*` в Render → сразу работает оплата по счёту.
3. Подать заявку в TipTop Pay (https://tiptoppay.kz). В кабинете включить онлайн-кассу (фискальные чеки) и указать уведомления:
   `https://<api>/api/billing/tiptop/check`, `/pay`, `/fail`, `/recurrent`. Задать `TIPTOP_PUBLIC_ID`, `TIPTOP_API_SECRET`.
   Проверить на тестовом терминале (`test_api_...`, карта 4242 4242 4242 4242), затем `BILLING_TEST_MODE=false`.
4. Подключить почту (`SMTP_*`, `MAIL_FROM`) — сброс пароля, счета, чеки, напоминания. Без SMTP письма пишутся в лог сервера.
5. `PUBLIC_URL` = адрес сайта. В GitHub добавить секреты `API_URL`, `ADMIN_TOKEN` для ежедневных напоминаний (`.github/workflows/billing-reminders.yml`).
6. Проверить текст оферты (`/offer`, `frontend/src/features/billing/offer.tsx`) с юристом: условия возврата, реквизиты, НДС.
7. Перейти с бесплатного Render на платный план (иначе API засыпает и первый запрос пекарни ждёт до минуты).

## Оператор

```sh
export API_URL=https://<api>/api ADMIN_TOKEN=...
python scripts/saqta_operator.py invoices                    # неоплаченные счета
python scripts/saqta_operator.py mark-paid SF-2026-00012 "п/п 45 от 21.11"
python scripts/saqta_operator.py send-reminders              # письма тем, у кого доступ кончается через ≤3 дня
```

## API

`GET /api/billing/plans` · `POST /api/billing/checkout` · `GET /api/billing/invoices[/{number}]` ·
`POST /api/billing/invoices/{number}/cancel` · `POST /api/billing/auto-renew` ·
`POST /api/billing/tiptop/{check,pay,fail,recurrent}` · `POST /api/auth/forgot` · `POST /api/auth/reset` ·
`GET /api/admin/invoices` · `POST /api/admin/invoices/{number}/mark-paid` · `POST /api/admin/send-reminders`.

Код: `backend/app/services/billing.py`, `backend/app/api/billing.py`, тесты `backend/tests/test_billing.py`.
