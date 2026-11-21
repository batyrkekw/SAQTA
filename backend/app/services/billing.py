"""Paid Forecast plans: prices, invoices, TipTop Pay card payments and bank-transfer invoices.

Money flow
  1. The organization chooses a plan and period -> a pending BillingInvoice with a fixed amount.
  2. Card: the TipTop Pay widget charges it; TipTop sends Check and Pay notifications (HMAC-signed).
     Transfer: the organization pays by bank details / Kaspi; the operator confirms the payment.
  3. mark_paid() is idempotent: it marks the invoice paid once and extends the subscription.
  4. Monthly card payments may renew automatically: the widget sets up a TipTop recurring charge,
     and each recurring Pay notification (with SubscriptionId) creates a paid invoice and extends
     the subscription by one month.
"""
import base64
from datetime import datetime, timedelta
import hashlib
import hmac
import json
import logging
import urllib.error
import urllib.request
from calendar import monthrange
from urllib.parse import unquote_plus

from fastapi import HTTPException
from sqlalchemy import select

from app.core.config import aware, get_settings, now_utc
from app.models import AuthUser, Bakery, BillingInvoice, Subscription
from app.services.mailer import send_email

log = logging.getLogger("saqta.billing")

MONTHLY_KZT = {"starter": 15000, "pro": 30000}
PLAN_TITLES = {"starter": "SaqtaFood Forecast Starter", "pro": "SaqtaFood Forecast Pro"}
# Price multiplier per period: a year costs ten months.
PERIODS = {1: 1, 3: 3, 12: 10}


def price_kzt(plan: str, months: int) -> int:
    if plan not in MONTHLY_KZT or months not in PERIODS:
        raise HTTPException(422, "Неизвестный тариф или период оплаты")
    return MONTHLY_KZT[plan] * PERIODS[months]


def add_months(value: datetime, months: int) -> datetime:
    month = value.month - 1 + months
    year, month = value.year + month // 12, month % 12 + 1
    return value.replace(year=year, month=month, day=min(value.day, monthrange(year, month)[1]))


# ------------------------------------------------------------------ capabilities
def card_enabled() -> bool:
    s = get_settings()
    return bool(s.tiptop_public_id and s.tiptop_api_secret)


def simulator_enabled() -> bool:
    s = get_settings()
    return s.billing_simulator and s.billing_test_mode and not card_enabled()


def seller() -> dict:
    s = get_settings()
    return {"name": s.seller_name, "bin": s.seller_bin, "address": s.seller_address, "iban": s.seller_iban,
            "bank": s.seller_bank, "bik": s.seller_bik, "kbe": s.seller_kbe, "email": s.seller_email,
            "phone": s.seller_phone, "vat_payer": s.seller_vat_payer}


def transfer_enabled() -> bool:
    s = seller()
    return bool(s["name"] and s["bin"] and s["iban"] and s["bank"])


def plans_json() -> dict:
    s = get_settings()
    return {
        "currency": "KZT", "trial_days": s.trial_days,
        "plans": [{"id": plan, "title": PLAN_TITLES[plan], "monthly_kzt": monthly,
                   "periods": [{"months": m, "amount_kzt": monthly * k, "saving_kzt": monthly * (m - k)}
                               for m, k in PERIODS.items()]}
                  for plan, monthly in MONTHLY_KZT.items()],
        "methods": {"card": card_enabled() or simulator_enabled(), "transfer": transfer_enabled(),
                    "test_mode": s.billing_test_mode, "simulator": simulator_enabled()},
        "seller": seller(),
    }


# ------------------------------------------------------------------ invoices
def invoice_json(row: BillingInvoice, with_seller=False) -> dict:
    out = {key: getattr(row, key) for key in ("number", "plan", "months", "amount_kzt", "method", "status",
                                               "auto_renew", "payer_name", "payer_bin", "payer_email",
                                               "payment_reference", "failure_reason")}
    for key in ("created_at", "due_at", "paid_at", "period_start", "period_end"):
        value = getattr(row, key)
        out[key] = aware(value).isoformat() if value else None
    out["title"] = f"{PLAN_TITLES[row.plan]}, {row.months} мес."
    if with_seller:
        out["seller"] = seller()
    return out


def create_invoice(db, bakery_id: int, plan: str, months: int, method: str, payer_name: str,
                   payer_bin: str, payer_email: str, auto_renew: bool) -> BillingInvoice:
    if method == "card" and not (card_enabled() or simulator_enabled()):
        raise HTTPException(503, "Оплата картой ещё не подключена. Выберите счёт на оплату.")
    if method == "transfer" and not transfer_enabled():
        raise HTTPException(503, "Реквизиты продавца не настроены. Оплата по счёту временно недоступна.")
    # One open invoice per organization: a new checkout replaces the previous unpaid one.
    for old in db.scalars(select(BillingInvoice).where(BillingInvoice.bakery_id == bakery_id, BillingInvoice.status == "pending")):
        old.status, old.failure_reason = "cancelled", "Заменён новым счётом"
    now = now_utc()
    row = BillingInvoice(bakery_id=bakery_id, number=f"tmp-{now.timestamp()}-{bakery_id}", plan=plan, months=months,
                         amount_kzt=price_kzt(plan, months), method=method, status="pending",
                         auto_renew=bool(auto_renew and method == "card" and months == 1),
                         payer_name=payer_name.strip(), payer_bin=payer_bin.strip(), payer_email=payer_email,
                         due_at=now + timedelta(days=get_settings().invoice_due_days))
    db.add(row)
    db.flush()
    row.number = f"SF-{now.year}-{row.id:05d}"
    return row


def widget_params(row: BillingInvoice) -> dict:
    """intentParams for the TipTop Pay widget: new tiptop.Widget().start(intent). Amount in tenge.

    Monthly card payments with auto_renew ask the widget to set up a recurring monthly charge
    starting when the paid month ends; TipTop then sends a Pay notification for every charge.
    """
    s = get_settings()
    intent = {"publicTerminalId": s.tiptop_public_id, "paymentSchema": "Single",
              "description": f"{PLAN_TITLES[row.plan]}, {row.months} мес. Счёт {row.number}",
              "amount": row.amount_kzt, "currency": "KZT", "externalId": row.number, "culture": "ru-RU",
              "receiptEmail": row.payer_email,
              "userInfo": {"accountId": f"bakery-{row.bakery_id}", "email": row.payer_email}}
    if row.auto_renew:
        intent["recurrent"] = {"interval": "Month", "period": 1, "amount": row.amount_kzt,
                               "startDate": add_months(now_utc(), 1).strftime("%Y-%m-%dT%H:%M:%S")}
    return {"intent": intent, "simulator": simulator_enabled(), "test_mode": s.billing_test_mode}


def extend_subscription(db, bakery_id: int, plan: str, months: int, now=None):
    now = now or now_utc()
    sub = db.scalar(select(Subscription).where(Subscription.bakery_id == bakery_id))
    if sub is None:
        sub = Subscription(bakery_id=bakery_id, plan="free", status="inactive")
        db.add(sub)
    running = (sub.status == "active" and sub.expires_at and aware(sub.expires_at) > now and not sub.is_trial)
    start = aware(sub.expires_at) if running and sub.plan == plan else now
    sub.plan, sub.status, sub.is_trial = plan, "active", False
    sub.activated_at = sub.activated_at or now
    sub.expires_at = add_months(start, months)
    sub.reminded_at = None
    return start, sub.expires_at, sub


def mark_paid(db, row: BillingInvoice, tx_id: str | None = None, reference: str = "", now=None) -> bool:
    """Idempotent. Returns True only for the call that actually marked the invoice paid."""
    if row.status == "paid":
        return False
    if row.status == "cancelled" and row.method == "transfer" and not reference:
        raise HTTPException(409, "Счёт отменён")
    now = now or now_utc()
    start, end, _ = extend_subscription(db, row.bakery_id, row.plan, row.months, now)
    row.status, row.paid_at, row.period_start, row.period_end = "paid", now, start, end
    row.provider_tx_id = tx_id or row.provider_tx_id
    row.payment_reference = reference or row.payment_reference
    row.failure_reason = ""
    notify_paid(db, row)
    return True


def local_day(value) -> str:
    from zoneinfo import ZoneInfo
    return aware(value).astimezone(ZoneInfo(get_settings().saqta_timezone)).strftime("%d.%m.%Y") if value else ""


def notify_paid(db, row):
    end = local_day(row.period_end)
    send_email(row.payer_email, f"SaqtaFood: оплата получена, счёт {row.number}",
               f"Спасибо! Оплата {row.amount_kzt:,} ₸ по счёту {row.number} получена.\n"
               f"Тариф {PLAN_TITLES[row.plan]} активен до {end}.\n\n"
               f"Счета и статус подписки: {get_settings().public_url}/billing\n".replace(",", " "))


def notify_invoice(db, row):
    if row.method != "transfer":
        return
    send_email(row.payer_email, f"SaqtaFood: счёт на оплату {row.number}",
               f"Счёт {row.number} на {row.amount_kzt:,} ₸ ({PLAN_TITLES[row.plan]}, {row.months} мес.).\n"
               f"Открыть и распечатать: {get_settings().public_url}/billing/invoice/{row.number}\n"
               "После поступления оплаты подписка включится автоматически, мы пришлём письмо.\n".replace(",", " "))


# ------------------------------------------------------------------ TipTop Pay
def verify_signature(raw: bytes, headers) -> bool:
    secret = get_settings().tiptop_api_secret
    if not secret:
        return False

    def digest(message: bytes) -> str:
        return base64.b64encode(hmac.new(secret.encode(), message, hashlib.sha256).digest()).decode()

    plain = headers.get("content-hmac")
    decoded = headers.get("x-content-hmac")
    if plain and hmac.compare_digest(plain, digest(raw)):
        return True
    if decoded and hmac.compare_digest(decoded, digest(unquote_plus(raw.decode("utf-8", "replace")).encode())):
        return True
    return False


def tiptop_call(path: str, payload: dict) -> dict:
    """Server-to-server TipTop API call with HTTP Basic auth (Public ID : API Secret)."""
    s = get_settings()
    request = urllib.request.Request(f"{s.tiptop_api_url.rstrip('/')}/{path.lstrip('/')}", method="POST",
                                     data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    token = base64.b64encode(f"{s.tiptop_public_id}:{s.tiptop_api_secret}".encode()).decode()
    request.add_header("Authorization", f"Basic {token}")
    with urllib.request.urlopen(request, timeout=15) as response:  # noqa: S310 - fixed https API URL from settings
        return json.loads(response.read().decode())


def cancel_recurring(db, sub: Subscription):
    if sub.provider_subscription_id and card_enabled():
        try:
            tiptop_call("subscriptions/cancel", {"Id": sub.provider_subscription_id})
        except (urllib.error.URLError, OSError, ValueError):
            log.exception("TipTop subscription cancel failed")
            raise HTTPException(502, "Платёжный сервис не ответил. Повторите отмену автопродления позже.")
    sub.auto_renew, sub.provider_subscription_id = False, None


def find_invoice(db, number) -> BillingInvoice | None:
    return db.scalar(select(BillingInvoice).where(BillingInvoice.number == str(number or "")))


def notified_invoice(db, data: dict) -> BillingInvoice | None:
    """Our invoice number arrives as InvoiceId (widget externalId)."""
    return find_invoice(db, data.get("InvoiceId") or data.get("ExternalId"))


def check_notification(db, data: dict) -> int:
    """TipTop Check: 0 accepts the payment, other codes reject it before the card is charged."""
    row = notified_invoice(db, data)
    if row is None or row.method != "card":
        return 10
    if data.get("AccountId") != f"bakery-{row.bakery_id}":
        return 11
    try:
        amount_ok = round(float(data.get("Amount", 0))) == row.amount_kzt and data.get("Currency", "KZT") == "KZT"
    except ValueError:
        amount_ok = False
    if not amount_ok:
        return 12
    if row.status != "pending":
        return 13
    return 0


def pay_notification(db, data: dict):
    tx = str(data.get("TransactionId") or "")
    if tx and db.scalar(select(BillingInvoice.id).where(BillingInvoice.provider_tx_id == tx)):
        return  # repeated delivery
    row = notified_invoice(db, data)
    sub_id = str(data.get("SubscriptionId") or "")
    if row is not None and row.status != "paid":
        mark_paid(db, row, tx_id=tx or None)
        if sub_id and row.auto_renew:
            sub = db.scalar(select(Subscription).where(Subscription.bakery_id == row.bakery_id))
            sub.auto_renew, sub.provider_subscription_id = True, sub_id
        return
    sub = db.scalar(select(Subscription).where(Subscription.provider_subscription_id == sub_id)) if sub_id else None
    if sub is None:
        log.warning("TipTop Pay notification without a matching invoice or subscription: tx=%s", tx)
        return
    # Recurring monthly charge: record it as its own paid invoice.
    owner = db.scalar(select(AuthUser).where(AuthUser.bakery_id == sub.bakery_id))
    bakery = db.get(Bakery, sub.bakery_id)
    row = BillingInvoice(bakery_id=sub.bakery_id, number=f"tmp-{tx}", plan=sub.plan if sub.plan in MONTHLY_KZT else "starter",
                         months=1, amount_kzt=price_kzt(sub.plan if sub.plan in MONTHLY_KZT else "starter", 1),
                         method="card", status="pending", auto_renew=True, payer_name=bakery.name if bakery else "",
                         payer_email=owner.email if owner else "")
    db.add(row)
    db.flush()
    row.number = f"SF-{now_utc().year}-{row.id:05d}"
    mark_paid(db, row, tx_id=tx or None)


def fail_notification(db, data: dict):
    row = notified_invoice(db, data)
    if row is not None and row.status == "pending":
        row.failure_reason = str(data.get("Reason") or data.get("CardHolderMessage") or "Платёж отклонён")[:200]


def recurrent_notification(db, data: dict):
    sub = db.scalar(select(Subscription).where(Subscription.provider_subscription_id == str(data.get("Id") or "")))
    if sub is not None and data.get("Status") in {"Cancelled", "Rejected", "Expired"}:
        sub.auto_renew, sub.provider_subscription_id = False, None


# ------------------------------------------------------------------ trial and reminders
def start_trial(db, sub: Subscription):
    days = get_settings().trial_days
    if days <= 0:
        return
    sub.plan, sub.status, sub.is_trial = "starter", "active", True
    sub.activated_at, sub.expires_at = now_utc(), now_utc() + timedelta(days=days)


def send_reminders(db, now=None) -> int:
    """Email owners whose access ends within 3 days (once per period). Run daily (cron/operator)."""
    now = now or now_utc()
    sent = 0
    rows = db.scalars(select(Subscription).where(Subscription.status == "active", Subscription.expires_at.is_not(None)))
    for sub in rows:
        end = aware(sub.expires_at)
        if not now < end <= now + timedelta(days=3) or sub.auto_renew:
            continue
        if sub.reminded_at and aware(sub.reminded_at) >= end - timedelta(days=3):
            continue
        owner = db.scalar(select(AuthUser).where(AuthUser.bakery_id == sub.bakery_id))
        if owner is None:
            continue
        what = "Пробный период" if sub.is_trial else "Оплаченный период"
        send_email(owner.email, "SaqtaFood: доступ к Forecast скоро закончится",
                   f"{what} SaqtaFood Forecast заканчивается {local_day(end)}.\n"
                   f"Продлить картой или получить счёт: {get_settings().public_url}/billing\n"
                   "SaqtaFood Save остаётся бесплатным.\n")
        sub.reminded_at = now
        sent += 1
    return sent
