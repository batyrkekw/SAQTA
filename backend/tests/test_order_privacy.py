from datetime import datetime
import os
from pathlib import Path
import subprocess
import sys

import pytest
from pydantic import ValidationError
from sqlalchemy import MetaData, create_engine, inspect, select

import test_auth_hardening
import test_real_workflows
from test_real_workflows import account, listing, reservation

from app.core.config import aware, now_utc
from app.models import AuthUser, Order, SurplusListing
from app.schemas import ContactConsent
from app.services.marketplace import order_json

access_client = test_auth_hardening.access_client
workspace = test_real_workflows.workspace


@pytest.mark.parametrize("phone", ["+77011234567", "8 (701) 123-45-67", "701 123 45 67", "+7 (701) 123-45-67", "77011234567"])
def test_kazakhstan_phone_normalization(phone):
    assert ContactConsent(customer_phone=phone, consent=True).customer_phone == "+77011234567"


@pytest.mark.parametrize("phone", ["", "+74951234567", "+996701123456", "12345", "+770112345678", "abc7011234567", "+7+7011234567"])
def test_invalid_phone_rejected(phone):
    with pytest.raises(ValidationError):
        ContactConsent(customer_phone=phone, consent=True)


@pytest.mark.parametrize("endpoint,kind", [("/api/orders", None), ("/api/market/orders", "individual"), ("/api/market/orders", "charity"), ("/api/market/orders", "bulk")])
@pytest.mark.parametrize("missing", ["customer_phone", "consent"])
def test_both_order_apis_require_contact_and_consent(access_client, endpoint, kind, missing):
    client, _ = access_client
    payload = {"customer_name": "Recipient", "customer_phone": "+77011234567", "consent": True}
    if kind:
        payload.update(listing_id=1, quantity=1, kind=kind, idempotency_key="private-test-123")
    else:
        payload["items"] = [{"listing_id": 1, "quantity": 1}]
    payload.pop(missing)
    # Real scoped legacy routes need an authenticated organization before validation.
    user = test_auth_hardening.signup(client)
    response = client.post(endpoint, headers={"Authorization": "Bearer " + user["token"]}, json=payload)
    assert response.status_code == 422, response.text
    assert ("телефон Казахстана" if missing == "customer_phone" else "согласие") in response.json()["detail"]


@pytest.mark.parametrize("consent", [False, "true", "false", 1, 0, None])
def test_consent_must_be_an_explicit_boolean(access_client, consent):
    client, _ = access_client
    response = client.post("/api/market/orders", json={
        "listing_id": 1, "quantity": 1, "customer_name": "Recipient", "customer_phone": "+77011234567",
        "consent": consent, "idempotency_key": "private-test-123",
    })
    assert response.status_code == 422 and "согласие" in response.json()["detail"]


def test_phone_visible_only_to_buyer_and_owning_business(workspace, caplog):
    client, factory = workspace
    seller_user, seller = account(workspace, "seller", "business", True)
    buyer_user, buyer = account(workspace, "buyer")
    other_user, other = account(workspace, "other", "business", True)
    _, stranger = account(workspace, "stranger")
    offer = listing(workspace, seller).json()
    start = now_utc()
    response = reservation(client, buyer, offer["id"], customer_phone="8 (701) 123-45-67", idempotency_key="contact-stable-key")
    assert response.status_code == 201, response.text
    order = response.json()
    phone = "+77011234567"
    assert order["customer_phone"] == phone
    assert start <= datetime.fromisoformat(order["consent_given_at"]) <= now_utc()
    for headers in (seller, buyer):
        assert client.get("/api/market/orders", headers=headers).json()[0]["customer_phone"] == phone
    assert client.get("/api/orders", headers=seller).json()[0]["customer_phone"] == phone
    for headers in (other, stranger):
        assert client.get("/api/market/orders", headers=headers).json() == []
        assert client.get("/api/orders", headers=headers).json() == []
        assert client.post(f"/api/market/orders/{order['id']}/cancel", headers=headers).status_code == 404
    assert client.get("/api/market/orders").status_code == 401
    for path in ("/api/market/listings", f"/api/market/listings/{offer['id']}"):
        public = client.get(path)
        assert public.status_code == 200
        assert "customer_phone" not in public.text and phone not in public.text
    repeated = reservation(client, buyer, offer["id"], customer_phone=phone, idempotency_key="contact-stable-key")
    assert repeated.json()["id"] == order["id"]
    assert repeated.json()["consent_given_at"] == order["consent_given_at"]
    assert reservation(client, buyer, offer["id"], customer_phone="+77011234568", idempotency_key="contact-stable-key").status_code == 409
    with factory() as db:
        row = db.get(Order, order["id"])
        assert row.customer_phone == phone and aware(row.consent_given_at) >= start
        assert row.buyer_id == buyer_user["user"]["id"]
        assert "customer_phone" not in order_json(db, row)
        assert "customer_phone" not in order_json(db, row, actor=db.get(AuthUser, other_user["user"]["id"]))
        owner = db.get(AuthUser, seller_user["user"]["id"])
        owner.role = "consumer"
        assert "customer_phone" not in order_json(db, row, actor=owner)
    assert phone not in caplog.text and "8 (701) 123-45-67" not in caplog.text


def test_charity_alias_preserves_contact_and_approval_rules(workspace):
    client, _ = workspace
    _, seller = account(workspace, "seller", "business", True)
    _, charity = account(workspace, "charity", "charity", True)
    _, consumer = account(workspace, "consumer")
    offer = listing(workspace, seller, terms="free", price=0).json()
    assert reservation(client, consumer, offer["id"], kind="charity").status_code == 403
    response = reservation(client, charity, offer["id"], kind="charity", customer_phone="+77121234567")
    assert response.status_code == 201, response.text
    assert response.json()["kind"] == "bulk" and response.json()["status"] == "pending"
    assert response.json()["customer_phone"] == "+77121234567"


def test_legacy_real_order_creator_receives_contact(workspace):
    client, factory = workspace
    owner, headers = account(workspace, "seller", "business", True)
    offer = listing(workspace, headers).json()
    response = client.post("/api/orders", headers=headers, json={
        "customer_name": "Recipient", "customer_phone": "+77011234567", "consent": True,
        "items": [{"listing_id": offer["id"], "quantity": 1}],
    })
    assert response.status_code == 201, response.text
    assert response.json()["customer_phone"] == "+77011234567"
    with factory() as db:
        assert db.get(Order, response.json()["id"]).buyer_id == owner["user"]["id"]


def test_invalid_contact_does_not_reserve_stock(workspace):
    client, factory = workspace
    _, seller = account(workspace, "seller", "business", True)
    _, buyer = account(workspace, "buyer")
    offer = listing(workspace, seller).json()
    assert reservation(client, buyer, offer["id"], consent=False).status_code == 422
    assert reservation(client, buyer, offer["id"], customer_phone="+74951234567").status_code == 422
    with factory() as db:
        assert list(db.scalars(select(Order))) == []
        assert db.get(SurplusListing, offer["id"]).available_quantity == 5


def test_contact_migration_preserves_old_orders_and_downgrades(tmp_path):
    database_url = f"sqlite:///{(tmp_path / 'contact-migration.db').as_posix()}"
    environment = {**os.environ, "DATABASE_URL": database_url}
    backend = Path(__file__).resolve().parents[1]

    def migrate(action, revision):
        result = subprocess.run([sys.executable, "-m", "alembic", action, revision], cwd=backend, env=environment,
                                capture_output=True, text=True, timeout=90)
        assert result.returncode == 0, result.stderr

    migrate("upgrade", "f5a6b7c8d9e0")
    engine = create_engine(database_url)
    old = MetaData()
    old.reflect(bind=engine)
    with engine.begin() as connection:
        connection.execute(old.tables["orders"].insert().values(id=1, customer_name="Historical recipient", status="reserved",
                           total_kzt=0, created_at=now_utc(), updated_at=now_utc()))
    engine.dispose()
    migrate("upgrade", "a6b7c8d9e0f1")
    engine = create_engine(database_url)
    current = MetaData()
    current.reflect(bind=engine)
    with engine.connect() as connection:
        row = connection.execute(select(current.tables["orders"])).mappings().one()
        assert row["customer_name"] == "Historical recipient"
        assert row["customer_phone"] is None and row["consent_given_at"] is None
    engine.dispose()
    migrate("downgrade", "f5a6b7c8d9e0")
    engine = create_engine(database_url)
    assert "customer_phone" not in {column["name"] for column in inspect(engine).get_columns("orders")}
    with engine.connect() as connection:
        assert connection.execute(select(old.tables["orders"].c.customer_name)).scalar_one() == "Historical recipient"
    engine.dispose()
