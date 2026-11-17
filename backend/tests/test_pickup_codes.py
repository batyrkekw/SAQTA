import os
from pathlib import Path
import re
import subprocess
import sys
from time import monotonic

import pytest
from sqlalchemy import MetaData, create_engine, event, func, inspect, select
from sqlalchemy.exc import IntegrityError

import test_real_workflows
from test_real_workflows import account, listing, reservation

from app.core.config import get_settings, now_utc
from app.core.rate_limit import limiter
from app.models import AuthUser, InventorySnapshot, Order, OrderEvent, OrderItem, SalesRecord, SurplusListing
from app.services import marketplace

workspace = test_real_workflows.workspace


def make_order(workspace):
    client, _ = workspace
    owner, seller = account(workspace, "seller", "business", True)
    _, buyer = account(workspace, "buyer")
    offer = listing(workspace, seller).json()
    response = reservation(client, buyer, offer["id"])
    assert response.status_code == 201, response.text
    return owner, seller, buyer, offer, response.json()


def test_correct_pickup_code_is_buyer_only_and_collection_is_once(workspace, caplog):
    client, factory = workspace
    _, seller, buyer, offer, order = make_order(workspace)
    _, other = account(workspace, "other", "business", True)
    code = order["pickup_code"]
    assert re.fullmatch(r"[0-9]{6}", code)
    assert client.get("/api/market/orders", headers=buyer).json()[0]["pickup_code"] == code
    for path in ("/api/market/orders", "/api/orders"):
        assert "pickup_code" not in client.get(path, headers=seller).json()[0]
    for path in ("/api/market/listings", f"/api/market/listings/{offer['id']}"):
        assert "pickup_code" not in client.get(path).text
    for prefix in ("/api/market/orders", "/api/orders"):
        assert client.post(f"{prefix}/{order['id']}/collect", headers=other, json={"pickup_code": code}).status_code == 404
    assert client.post(f"/api/market/orders/{order['id']}/collect", headers=buyer, json={"pickup_code": code}).status_code == 403
    response = client.post(f"/api/market/orders/{order['id']}/collect", headers=seller, json={"pickup_code": code})
    assert response.status_code == 200 and response.json()["status"] == "collected"
    assert "pickup_code" not in response.json()
    assert client.post(f"/api/market/orders/{order['id']}/collect", headers=seller, json={"pickup_code": code}).status_code == 409
    with factory() as db:
        assert db.scalar(select(InventorySnapshot)).on_hand == 3
        assert db.scalar(select(func.count()).select_from(SalesRecord)) == 1
    assert code not in caplog.text


@pytest.mark.parametrize("prefix", ["/api/market/orders", "/api/orders"])
def test_wrong_missing_and_malformed_code_cannot_change_order(workspace, prefix):
    client, factory = workspace
    _, seller, _, offer, order = make_order(workspace)
    wrong = f"{(int(order['pickup_code']) + 1) % 1_000_000:06d}"
    for payload in (None, {}, {"pickup_code": "123"}, {"pickup_code": 123456}, {"pickup_code": "abcdef"}, {"pickup_code": wrong}):
        response = client.post(f"{prefix}/{order['id']}/collect", headers=seller, json=payload)
        assert response.status_code == 422, response.text
        assert "код получения" in response.json()["detail"]
        with factory() as db:
            row = db.get(Order, order["id"])
            assert row.status == "reserved" and row.collected_at is None and row.commission_tiyn == 0
            assert db.get(SurplusListing, offer["id"]).reserved_quantity == 2
            assert db.scalar(select(InventorySnapshot)).on_hand == 5
            assert db.scalar(select(func.count()).select_from(SalesRecord)) == 0
    assert client.post(f"{prefix}/{order['id']}/collect", headers=seller, json={"pickup_code": order["pickup_code"]}).status_code == 200


def test_legacy_collection_requires_business_role(workspace):
    client, factory = workspace
    owner, seller, _, _, order = make_order(workspace)
    with factory() as db:
        db.get(AuthUser, owner["user"]["id"]).role = "consumer"
        db.commit()
    assert client.post(f"/api/orders/{order['id']}/collect", headers=seller, json={"pickup_code": order["pickup_code"]}).status_code == 403
    with factory() as db:
        assert db.get(Order, order["id"]).status == "reserved"


def test_approval_cannot_resurrect_concurrently_cancelled_charity_order(workspace):
    client, factory = workspace
    engine = factory.kw["bind"]
    if engine.dialect.name != "sqlite":
        pytest.skip("This race reproduces SQLite's lack of SELECT FOR UPDATE locking")
    _, seller = account(workspace, "seller", "business", True)
    _, charity = account(workspace, "charity", "charity", True)
    offer = listing(workspace, seller, terms="free", price=0).json()
    order = reservation(client, charity, offer["id"], kind="charity").json()
    state = {"armed": True}

    def cancel_before_approval_write(connection, cursor, statement, parameters, context, executemany):
        if state["armed"] and statement.startswith("UPDATE orders SET"):
            state["armed"] = False
            cancelled = client.post(f"/api/market/orders/{order['id']}/cancel", headers=charity)
            assert cancelled.status_code == 200

    event.listen(engine, "before_cursor_execute", cancel_before_approval_write)
    try:
        response = client.post(f"/api/market/orders/{order['id']}/approve", headers=seller)
    finally:
        event.remove(engine, "before_cursor_execute", cancel_before_approval_write)
    assert not state["armed"] and response.status_code == 409
    with factory() as db:
        assert db.get(Order, order["id"]).status == "cancelled"
        row = db.get(SurplusListing, offer["id"])
        assert row.available_quantity == 5 and row.reserved_quantity == 0
        assert list(db.scalars(select(OrderEvent.status).where(OrderEvent.order_id == order["id"]).order_by(OrderEvent.id))) == ["pending", "cancelled"]


def test_pickup_rate_limit_is_shared_across_routes_and_recovers(workspace, monkeypatch):
    client, factory = workspace
    _, seller, buyer, offer, order = make_order(workspace)
    monkeypatch.setattr(get_settings(), "rate_limit_pickup_max_attempts", 2)
    wrong = f"{(int(order['pickup_code']) + 1) % 1_000_000:06d}"
    for prefix in ("/api/market/orders", "/api/orders"):
        assert client.post(f"{prefix}/{order['id']}/collect", headers=seller, json={"pickup_code": wrong}).status_code == 422
    blocked = client.post(f"/api/market/orders/{order['id']}/collect", headers=seller, json={"pickup_code": order["pickup_code"]})
    assert blocked.status_code == 429 and int(blocked.headers["Retry-After"]) > 0
    assert client.post(f"/api/orders/{order['id']}/collect", headers=seller, json={"pickup_code": order["pickup_code"]}).status_code == 429
    second = reservation(client, buyer, offer["id"], quantity=1).json()
    assert client.post(f"/api/market/orders/{second['id']}/collect", headers=seller, json={"pickup_code": second["pickup_code"]}).status_code == 200
    with factory() as db:
        assert db.get(Order, order["id"]).status == "reserved"
    monkeypatch.setattr(limiter, "_clock", lambda: monotonic() + get_settings().rate_limit_pickup_window_seconds + 1)
    assert client.post(f"/api/orders/{order['id']}/collect", headers=seller, json={"pickup_code": order["pickup_code"]}).status_code == 200


@pytest.mark.parametrize("terminal", ["cancel", "collect"])
def test_terminal_orders_release_codes_and_cannot_collect_again(workspace, monkeypatch, terminal):
    client, _ = workspace
    monkeypatch.setattr(marketplace.secrets, "randbelow", lambda _: 7)
    _, seller, buyer, offer, order = make_order(workspace)
    assert order["pickup_code"] == "000007"
    url = f"/api/market/orders/{order['id']}"
    assert client.post(f"{url}/{terminal}", headers=seller, json={"pickup_code": "000007"}).status_code == 200
    assert client.post(f"{url}/collect", headers=seller, json={"pickup_code": "000007"}).status_code == 409
    second = reservation(client, buyer, offer["id"], quantity=1)
    assert second.status_code == 201 and second.json()["pickup_code"] == "000007"


def test_codes_unique_for_pending_orders_and_reusable_by_other_businesses(workspace, monkeypatch):
    client, factory = workspace
    _, seller = account(workspace, "seller", "business", True)
    _, charity = account(workspace, "charity", "charity", True)
    _, other = account(workspace, "other", "business", True)
    offer = listing(workspace, seller, quantity=8).json()
    numbers = iter([7, 7, 8])
    monkeypatch.setattr(marketplace.secrets, "randbelow", lambda _: next(numbers))
    first = reservation(client, charity, offer["id"], kind="charity", idempotency_key="stable-pending-code").json()
    assert first["status"] == "pending" and first["pickup_code"] == "000007"
    second = reservation(client, charity, offer["id"]).json()
    assert second["pickup_code"] == "000008"
    repeated = reservation(client, charity, offer["id"], kind="charity", idempotency_key="stable-pending-code").json()
    assert repeated["id"] == first["id"] and repeated["pickup_code"] == "000007"
    with factory() as db:
        owner = db.get(Order, first["id"]).bakery_id
        db.add(Order(bakery_id=owner, customer_name="Collision", status="pending", total_kzt=0, pickup_code="000007"))
        with pytest.raises(IntegrityError):
            db.flush()
        db.rollback()
    monkeypatch.setattr(marketplace.secrets, "randbelow", lambda _: 7)
    other_offer = listing(workspace, other).json()
    assert reservation(client, charity, other_offer["id"]).json()["pickup_code"] == "000007"


def test_database_collision_retry_preserves_stock_exactly_once(workspace, monkeypatch):
    client, factory = workspace
    monkeypatch.setattr(marketplace.secrets, "randbelow", lambda _: 7)
    _, seller, buyer, offer, _ = make_order(workspace)
    numbers = iter([7, 8])
    monkeypatch.setattr(marketplace.secrets, "randbelow", lambda _: next(numbers))
    check = marketplace._pickup_code_in_use
    calls = []

    def stale_first_lookup(db, owner, code):
        calls.append(code)
        return False if len(calls) == 1 else check(db, owner, code)

    monkeypatch.setattr(marketplace, "_pickup_code_in_use", stale_first_lookup)
    second = reservation(client, buyer, offer["id"])
    assert second.status_code == 201, second.text
    assert second.json()["pickup_code"] == "000008"
    assert calls == ["000007", "000007", "000008"]
    with factory() as db:
        listing_row = db.get(SurplusListing, offer["id"])
        assert listing_row.available_quantity == 1 and listing_row.reserved_quantity == 4
        assert db.scalar(select(func.count()).select_from(Order)) == 2
        assert db.scalar(select(func.count()).select_from(OrderItem)) == 2


def test_hidden_synthetic_order_still_reserves_its_code(workspace, monkeypatch):
    client, factory = workspace
    monkeypatch.setattr(marketplace.secrets, "randbelow", lambda _: 7)
    _, _, buyer, offer, first = make_order(workspace)
    with factory() as db:
        db.get(Order, first["id"]).is_test_data = True
        db.commit()
    numbers = iter([7, 8])
    monkeypatch.setattr(marketplace.secrets, "randbelow", lambda _: next(numbers))
    second = reservation(client, buyer, offer["id"])
    assert second.status_code == 201 and second.json()["pickup_code"] == "000008", second.text


def test_code_allocation_failure_rolls_back_order_and_stock(workspace, monkeypatch):
    client, factory = workspace
    monkeypatch.setattr(marketplace.secrets, "randbelow", lambda _: 7)
    _, _, buyer, offer, _ = make_order(workspace)
    failure = reservation(client, buyer, offer["id"])
    assert failure.status_code == 503
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Order)) == 1
        assert db.scalar(select(func.count()).select_from(OrderItem)) == 1
        assert db.get(SurplusListing, offer["id"]).available_quantity == 3
        assert db.get(SurplusListing, offer["id"]).reserved_quantity == 2


def test_pickup_migration_backfills_active_orders_and_reverses(tmp_path):
    database_url = f"sqlite:///{(tmp_path / 'pickup-migration.db').as_posix()}"
    environment = {**os.environ, "DATABASE_URL": database_url}
    backend = Path(__file__).resolve().parents[1]

    def migrate(action, revision):
        result = subprocess.run([sys.executable, "-m", "alembic", action, revision], cwd=backend, env=environment,
                                capture_output=True, text=True, timeout=90)
        assert result.returncode == 0, result.stderr

    migrate("upgrade", "a6b7c8d9e0f1")
    engine = create_engine(database_url)
    old = MetaData()
    old.reflect(bind=engine)
    timestamps = {"created_at": now_utc(), "updated_at": now_utc()}
    with engine.begin() as connection:
        for owner in (1, 2):
            connection.execute(old.tables["bakeries"].insert().values(id=owner, name=f"Business {owner}", city="Астана", **timestamps))
        for identifier, owner, status in ((1, 1, "reserved"), (2, 1, "pending"), (3, 2, "reserved"), (4, 1, "cancelled")):
            connection.execute(old.tables["orders"].insert().values(id=identifier, bakery_id=owner, customer_name="Historical recipient",
                               status=status, total_kzt=0, customer_phone="+77011234567", **timestamps))
    engine.dispose()
    migrate("upgrade", "b7c8d9e0f1a2")
    engine = create_engine(database_url)
    current = MetaData()
    current.reflect(bind=engine)
    with engine.connect() as connection:
        rows = connection.execute(select(current.tables["orders"]).order_by(current.tables["orders"].c.id)).mappings().all()
        assert len(rows) == 4 and all(row["customer_phone"] == "+77011234567" for row in rows)
        assert all(re.fullmatch(r"[0-9]{6}", row["pickup_code"]) for row in rows[:3])
        assert rows[0]["pickup_code"] != rows[1]["pickup_code"]
        assert rows[3]["pickup_code"] is None
    assert any(index["name"] == "uq_order_active_pickup_code" and index["unique"] for index in inspect(engine).get_indexes("orders"))
    engine.dispose()
    migrate("downgrade", "a6b7c8d9e0f1")
    engine = create_engine(database_url)
    assert "pickup_code" not in {column["name"] for column in inspect(engine).get_columns("orders")}
    with engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(old.tables["orders"])) == 4
    engine.dispose()
