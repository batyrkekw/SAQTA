import base64
from datetime import timedelta
import hashlib
import hmac
from urllib.parse import urlencode

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import aware, get_settings, now_utc
from app.db.session import Base, get_db
from app.main import app
from app.models import AuthSession, BillingInvoice, PasswordResetToken, Subscription
from app.services import billing
from app.services.mailer import OUTBOX

SECRET = "test-api-secret"
ADMIN = {"Authorization": "Bearer admin-secret-token-for-tests"}


@pytest.fixture
def env(monkeypatch):
    s = get_settings()
    for key, value in {"workspace_mode": "real", "forecast_requires_subscription": True, "admin_token": ADMIN["Authorization"][7:],
                       "tiptop_public_id": "", "tiptop_api_secret": "", "billing_simulator": False, "billing_test_mode": True,
                       "seller_name": "", "seller_bin": "", "seller_iban": "", "seller_bank": "", "trial_days": 14,
                       "smtp_host": "", "public_url": "https://saqta.test"}.items():
        monkeypatch.setattr(s, key, value)
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)

    def override():
        with factory() as db:
            try:
                yield db
            except Exception:
                db.rollback()
                raise
    app.dependency_overrides[get_db] = override
    OUTBOX.clear()
    with TestClient(app) as client:
        yield client, factory, s, monkeypatch
    app.dependency_overrides.clear()
    engine.dispose()


def register(client, suffix="a", role="business"):
    r = client.post("/api/auth/register", json={"email": f"owner-{suffix}@example.test", "password": "long-local-password",
                                                "bakery_name": f"Bakery {suffix}", "address": f"Street {suffix}", "consent": True,
                                                "requested_role": role})
    assert r.status_code == 201, r.text
    body = r.json()
    return body, {"Authorization": f"Bearer {body['token']}"}


def seller_on(s, monkeypatch):
    for key, value in {"seller_name": "ИП Тест", "seller_bin": "990101300123", "seller_iban": "KZ000000000000000001",
                       "seller_bank": "АО Тестбанк", "seller_bik": "TESTKZKA"}.items():
        monkeypatch.setattr(s, key, value)


def card_on(s, monkeypatch):
    monkeypatch.setattr(s, "tiptop_public_id", "test_api_00000000000000000000001")
    monkeypatch.setattr(s, "tiptop_api_secret", SECRET)


def sub_of(factory, bakery_id):
    with factory() as db:
        return db.scalar(select(Subscription).where(Subscription.bakery_id == bakery_id))


def signed(client, kind, data, header="Content-HMAC"):
    raw = urlencode(data).encode()
    mac = base64.b64encode(hmac.new(SECRET.encode(), raw if header == "Content-HMAC" else
                                    __import__("urllib.parse").parse.unquote_plus(raw.decode()).encode(), hashlib.sha256).digest()).decode()
    return client.post(f"/api/billing/tiptop/{kind}", content=raw,
                       headers={"Content-Type": "application/x-www-form-urlencoded", header: mac})


def test_plans_and_prices(env):
    client, *_ = env
    body = client.get("/api/billing/plans").json()
    plan = body["plan"]
    assert plan["id"] == "business" and plan["per_location_kzt"] == 15000 and plan["max_locations"] == 50
    assert {p["months"]: p["multiplier"] for p in plan["periods"]} == {1: 1, 3: 3, 12: 10}
    assert [billing.price_kzt(m, n) for m, n in ((1, 1), (3, 1), (12, 1), (1, 3), (12, 2))] == [15000, 45000, 150000, 45000, 300000]
    assert body["trial_days"] == 14 and body["methods"] == {"card": False, "transfer": False, "test_mode": True, "simulator": False}


def test_business_registration_starts_trial_consumer_does_not(env):
    client, factory, *_ = env
    owner, _ = register(client, "biz")
    sub = owner["subscription"]
    assert sub["active"] and sub["is_trial"] and sub["plan"] == "business" and "Пробный период" in sub["message"]
    assert sub["limits"]["locations"] == 3
    days = (aware(sub_of(factory, owner["organization"]["id"]).expires_at) - now_utc()).days
    assert days in (13, 14)
    consumer, _ = register(client, "buyer", role="consumer")
    assert not consumer["subscription"]["active"] and not consumer["subscription"]["is_trial"]


def test_transfer_invoice_operator_confirms_and_subscription_extends(env):
    client, factory, s, mp = env
    owner, h = register(client)
    payload = {"months": 3, "method": "transfer", "payer_name": "ТОО Хлеб", "payer_bin": "123456789012", "payer_email": "pay@example.test"}
    assert client.post("/api/billing/checkout", headers=h, json=payload).status_code == 503
    seller_on(s, mp)
    r = client.post("/api/billing/checkout", headers=h, json=payload)
    assert r.status_code == 201, r.text
    inv = r.json()["invoice"]
    assert inv["number"].startswith("SF-") and inv["amount_kzt"] == 45000 and inv["status"] == "pending" and inv["locations"] == 1
    assert inv["seller"]["bin"] == "990101300123" and "widget" not in r.json()
    assert OUTBOX[-1]["to"] == "pay@example.test" and inv["number"] in OUTBOX[-1]["text"]
    # Another organization cannot read it.
    _, other = register(client, "b")
    assert client.get(f"/api/billing/invoices/{inv['number']}", headers=other).status_code == 404
    assert client.get(f"/api/billing/invoices/{inv['number']}", headers=h).json()["payer_bin"] == "123456789012"
    # Operator confirms the transfer found on the statement.
    assert client.post(f"/api/admin/invoices/{inv['number']}/mark-paid", json={"reference": "п/п 15"}).status_code == 401
    r = client.post(f"/api/admin/invoices/{inv['number']}/mark-paid", headers=ADMIN, json={"reference": "п/п 15 от 21.11"})
    assert r.status_code == 200 and r.json()["changed"] and r.json()["status"] == "paid"
    sub = sub_of(factory, owner["organization"]["id"])
    assert sub.plan == "business" and not sub.is_trial and sub.status == "active" and sub.locations == 1
    assert 88 <= (aware(sub.expires_at) - now_utc()).days <= 92  # trial does not stack: 3 months from today
    again = client.post(f"/api/admin/invoices/{inv['number']}/mark-paid", headers=ADMIN, json={"reference": "dup"})
    assert again.json()["changed"] is False
    assert aware(sub_of(factory, owner["organization"]["id"]).expires_at) == aware(sub.expires_at)
    assert "оплата получена" in OUTBOX[-1]["subject"]
    me = client.get("/api/auth/me", headers=h).json()["subscription"]
    assert me["active"] and not me["is_trial"] and me["payments_integrated"]


def test_new_checkout_replaces_open_invoice_and_cancel(env):
    client, factory, s, mp = env
    seller_on(s, mp)
    _, h = register(client)
    body = {"months": 1, "method": "transfer", "payer_name": "Пекарня", "payer_email": "a@example.test"}
    first = client.post("/api/billing/checkout", headers=h, json=body).json()["invoice"]["number"]
    second = client.post("/api/billing/checkout", headers=h, json=body).json()["invoice"]["number"]
    rows = {i["number"]: i["status"] for i in client.get("/api/billing/invoices", headers=h).json()["invoices"]}
    assert rows == {first: "cancelled", second: "pending"}
    assert client.post(f"/api/billing/invoices/{second}/cancel", headers=h).json()["status"] == "cancelled"
    assert client.post(f"/api/billing/invoices/{second}/cancel", headers=h).status_code == 409


def test_card_checkout_notifications_and_recurring(env):
    client, factory, s, mp = env
    owner, h = register(client)
    body = {"months": 1, "method": "card", "payer_name": "Пекарня", "payer_email": "card@example.test", "auto_renew": True}
    assert client.post("/api/billing/checkout", headers=h, json=body).status_code == 503
    card_on(s, mp)
    r = client.post("/api/billing/checkout", headers=h, json=body).json()
    inv, intent = r["invoice"], r["widget"]["intent"]
    assert intent["publicTerminalId"].startswith("test_api_") and intent["amount"] == 15000 and intent["externalId"] == inv["number"]
    assert intent["userInfo"]["accountId"] == f"bakery-{owner['organization']['id']}" and intent["recurrent"]["interval"] == "Month"
    account = f"bakery-{owner['organization']['id']}"
    base = {"InvoiceId": inv["number"], "AccountId": account, "Amount": "15000.00", "Currency": "KZT", "TransactionId": "777"}
    # Signature is mandatory.
    assert client.post("/api/billing/tiptop/check", content=urlencode(base), headers={"Content-Type": "application/x-www-form-urlencoded", "Content-HMAC": "bad"}).status_code == 401
    assert signed(client, "check", base).json() == {"code": 0}
    assert signed(client, "check", base, header="X-Content-HMAC").json() == {"code": 0}
    assert signed(client, "check", dict(base, Amount="1.00")).json() == {"code": 12}
    assert signed(client, "check", dict(base, AccountId="bakery-999")).json() == {"code": 11}
    assert signed(client, "check", dict(base, InvoiceId="SF-0000-00000")).json() == {"code": 10}
    calls = []

    def fake_call(path, payload):
        calls.append((path, payload))
        return {"Success": True}
    mp.setattr(billing, "tiptop_call", fake_call)
    assert signed(client, "pay", dict(base, SubscriptionId="sc_123")).json() == {"code": 0}
    sub = sub_of(factory, owner["organization"]["id"])
    first_end = aware(sub.expires_at)
    assert sub.status == "active" and not sub.is_trial and sub.auto_renew and sub.provider_subscription_id == "sc_123"
    # Repeated delivery of the same transaction changes nothing.
    assert signed(client, "pay", dict(base, SubscriptionId="sc_123")).json() == {"code": 0}
    assert aware(sub_of(factory, owner["organization"]["id"]).expires_at) == first_end
    assert signed(client, "check", base).json() == {"code": 13}  # already paid
    # A monthly recurring charge (may repeat the original InvoiceId) extends by one month.
    assert signed(client, "pay", {"SubscriptionId": "sc_123", "InvoiceId": inv["number"], "TransactionId": "778", "Amount": "15000", "Currency": "KZT", "AccountId": account}).json() == {"code": 0}
    sub = sub_of(factory, owner["organization"]["id"])
    assert aware(sub.expires_at) == billing.add_months(first_end, 1)
    numbers = [i["status"] for i in client.get("/api/billing/invoices", headers=h).json()["invoices"]]
    assert numbers == ["paid", "paid"]
    # The owner turns renewal off.
    assert client.post("/api/billing/auto-renew", headers=h, json={"enabled": False}).json() == {"auto_renew": False}
    assert calls[-1] == ("subscriptions/cancel", {"Id": "sc_123"})
    assert not sub_of(factory, owner["organization"]["id"]).auto_renew


def test_recurrent_cancel_and_fail_notifications(env):
    client, factory, s, mp = env
    card_on(s, mp)
    owner, h = register(client)
    with factory() as db:
        sub = db.scalar(select(Subscription).where(Subscription.bakery_id == owner["organization"]["id"]))
        sub.auto_renew, sub.provider_subscription_id = True, "sc_9"
        db.commit()
    signed(client, "recurrent", {"Id": "sc_9", "Status": "Cancelled"})
    assert not sub_of(factory, owner["organization"]["id"]).auto_renew
    inv = client.post("/api/billing/checkout", headers=h, json={"method": "card", "payer_name": "Пекарня", "payer_email": "p@example.test"}).json()["invoice"]
    signed(client, "fail", {"InvoiceId": inv["number"], "Reason": "InsufficientFunds"})
    row = client.get(f"/api/billing/invoices/{inv['number']}", headers=h).json()
    assert row["status"] == "pending" and row["failure_reason"] == "InsufficientFunds"


def test_extension_rules():
    from app.models import BillingInvoice  # noqa: F401
    start = now_utc().replace(month=1, day=31, hour=12)
    assert billing.add_months(start, 1).day in (28, 29) and billing.add_months(start, 12).year == start.year + 1
    assert billing.price_kzt(12, 2) == 300000
    with pytest.raises(Exception):
        billing.price_kzt(2, 1)
    with pytest.raises(Exception):
        billing.price_kzt(1, 0)


def test_same_locations_extend_from_expiry_more_locations_start_today(env):
    client, factory, s, mp = env
    seller_on(s, mp)
    owner, h = register(client)
    bid = owner["organization"]["id"]

    def buy(locations):
        r = client.post("/api/billing/checkout", headers=h, json={"locations": locations, "method": "transfer", "payer_name": "Пекарня", "payer_email": "p@example.test"})
        assert r.status_code == 201, r.text
        inv = r.json()["invoice"]
        client.post(f"/api/admin/invoices/{inv['number']}/mark-paid", headers=ADMIN, json={"reference": "ok"})
        return inv, aware(sub_of(factory, bid).expires_at)
    _, one = buy(1)
    _, two = buy(1)
    assert two == billing.add_months(one, 1)
    inv, three = buy(3)
    assert inv["amount_kzt"] == 45000 and inv["title"].startswith("SaqtaFood Business, 3 точки")
    sub = sub_of(factory, bid)
    assert sub.locations == 3 and three < two + timedelta(days=1)
    me = client.get("/api/subscription", headers=h).json()
    assert me["limits"] == {"products": 300, "forecast_runs_per_month": 1500, "locations": 3}


def test_locations_follow_the_paid_count(env):
    client, factory, s, mp = env
    seller_on(s, mp)
    owner, h = register(client)
    # Trial covers 3 locations: the first one exists, two more can be added.
    for n in range(2):
        assert client.post("/api/locations", headers=h, json={"name": f"Точка {n}", "address": f"Адрес {n}"}).status_code == 201
    blocked = client.post("/api/locations", headers=h, json={"name": "Лишняя", "address": "Адрес"})
    assert blocked.status_code == 403 and "Тариф и оплата" in blocked.json()["detail"]
    # Paying for fewer locations than exist is refused.
    r = client.post("/api/billing/checkout", headers=h, json={"locations": 2, "method": "transfer", "payer_name": "Пекарня", "payer_email": "p@example.test"})
    assert r.status_code == 422 and "3" in r.json()["detail"]
    assert client.post("/api/billing/checkout", headers=h, json={"locations": 51, "method": "transfer", "payer_name": "Пекарня", "payer_email": "p@example.test"}).status_code == 422


def test_simulator_only_without_keys(env):
    client, factory, s, mp = env
    owner, h = register(client)
    mp.setattr(s, "billing_simulator", True)
    inv = client.post("/api/billing/checkout", headers=h, json={"method": "card", "payer_name": "Пекарня", "payer_email": "p@example.test"}).json()
    assert inv["widget"]["simulator"] is True and "recurrent" not in inv["widget"]["intent"]
    assert client.post(f"/api/billing/simulate/{inv['invoice']['number']}", headers=h).json()["status"] == "paid"
    assert not sub_of(factory, owner["organization"]["id"]).is_trial
    card_on(s, mp)  # real keys switch the simulator off
    assert client.post(f"/api/billing/simulate/{inv['invoice']['number']}", headers=h).status_code == 404


def test_forecast_locked_without_paid_plan(env):
    client, factory, *_ = env
    owner, h = register(client)
    with factory() as db:
        sub = db.scalar(select(Subscription).where(Subscription.bakery_id == owner["organization"]["id"]))
        sub.expires_at = now_utc() - timedelta(minutes=1)
        db.commit()
    me = client.get("/api/subscription", headers=h).json()
    assert not me["active"] and "Тариф и оплата" in me["message"]


def test_reminders_once_before_expiry(env):
    client, factory, *_ = env
    owner, _ = register(client)
    with factory() as db:
        sub = db.scalar(select(Subscription).where(Subscription.bakery_id == owner["organization"]["id"]))
        sub.expires_at = now_utc() + timedelta(days=2)
        db.commit()
    OUTBOX.clear()
    assert client.post("/api/admin/send-reminders", headers=ADMIN).json() == {"sent": 1}
    assert client.post("/api/admin/send-reminders", headers=ADMIN).json() == {"sent": 0}
    assert "скоро закончится" in OUTBOX[-1]["subject"] and OUTBOX[-1]["to"] == "owner-a@example.test"


def test_demo_workspace_cannot_pay(client):
    r = client.post("/api/billing/checkout", json={"method": "transfer", "payer_name": "Пекарня", "payer_email": "p@example.test"})
    assert r.status_code == 403


def test_forgot_and_reset_password(env):
    client, factory, *_ = env
    owner, h = register(client)
    OUTBOX.clear()
    unknown = client.post("/api/auth/forgot", json={"email": "nobody@example.test"})
    known = client.post("/api/auth/forgot", json={"email": "owner-a@example.test"})
    assert unknown.status_code == known.status_code == 200 and unknown.json() == known.json()
    assert len(OUTBOX) == 1 and OUTBOX[0]["to"] == "owner-a@example.test"
    link = next(line for line in OUTBOX[0]["text"].splitlines() if "reset-password?token=" in line)
    token = link.split("token=")[1]
    assert client.post("/api/auth/reset", json={"token": "x" * 30, "password": "another-long-password"}).status_code == 400
    assert client.post("/api/auth/reset", json={"token": token, "password": "another-long-password"}).status_code == 200
    assert client.get("/api/auth/me", headers=h).status_code == 401  # old sessions revoked
    assert client.post("/api/auth/login", json={"email": "owner-a@example.test", "password": "long-local-password"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "owner-a@example.test", "password": "another-long-password"}).status_code == 200
    assert client.post("/api/auth/reset", json={"token": token, "password": "third-long-password1"}).status_code == 400  # single use
    with factory() as db:
        assert db.scalar(select(PasswordResetToken)).used_at is not None
        assert db.scalar(select(AuthSession.id)) is not None


def test_reset_token_expires(env):
    client, factory, s, mp = env
    register(client)
    client.post("/api/auth/forgot", json={"email": "owner-a@example.test"})
    token = OUTBOX[-1]["text"].split("token=")[1].split()[0]
    with factory() as db:
        db.scalar(select(PasswordResetToken)).expires_at = now_utc() - timedelta(seconds=1)
        db.commit()
    assert client.post("/api/auth/reset", json={"token": token, "password": "another-long-password"}).status_code == 400


def test_forgot_is_rate_limited(env):
    client, _, s, mp = env
    mp.setattr(s, "forgot_max_attempts", 2)
    codes = [client.post("/api/auth/forgot", json={"email": "x@example.test"}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_invoice_number_unique_and_amount_fixed(env):
    client, factory, s, mp = env
    seller_on(s, mp)
    _, h = register(client)
    n = client.post("/api/billing/checkout", headers=h, json={"months": 12, "locations": 2, "method": "transfer", "payer_name": "Пекарня", "payer_email": "p@example.test"}).json()["invoice"]
    assert n["amount_kzt"] == 300000
    with factory() as db:
        assert db.scalar(select(BillingInvoice).where(BillingInvoice.number == n["number"])).amount_kzt == 300000


def test_analysis_runs_need_a_plan_and_count_quota(env):
    client, factory, *_ = env
    owner, h = register(client)
    first = client.post("/api/analysis/runs", headers=h, json={})
    assert first.status_code == 201, first.text
    assert client.post("/api/analysis/runs", headers=h, json={}).json().get("cached") is True
    assert client.get("/api/subscription", headers=h).json()["usage"]["forecast_runs"] == 1
    with factory() as db:
        sub = db.scalar(select(Subscription).where(Subscription.bakery_id == owner["organization"]["id"]))
        sub.expires_at = now_utc() - timedelta(minutes=1)
        db.commit()
    blocked = client.post("/api/analysis/runs", headers=h, json={"horizon_days": 3})
    assert blocked.status_code == 402 and "Тариф и оплата" in blocked.json()["detail"]
    _, buyer = register(client, "buyer", role="consumer")
    assert client.post("/api/analysis/runs", headers=buyer, json={}).status_code == 402
