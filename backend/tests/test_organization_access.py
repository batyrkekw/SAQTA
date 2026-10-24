from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor
import json

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings, now_utc, today_local
from app.db.session import Base, build_engine, get_db
from app.main import app
from app.models import ApplicationSettings, AuthSession, AuthUser, Bakery, BakeryLocation, InventorySnapshot, ProductionRecord, SalesRecord, Subscription, SubscriptionUsage
from app.services.auth import check_password


@pytest.fixture
def real_client(monkeypatch):
    monkeypatch.setattr(get_settings(), "workspace_mode", "real")
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
    with TestClient(app) as client:
        yield client, factory
    app.dependency_overrides.clear()
    engine.dispose()


def register(client, suffix="a"):
    response = client.post("/api/auth/register", json={"email": f"owner-{suffix}@example.test", "password": "long-local-password", "bakery_name": f"Bakery {suffix}", "address": f"Private address {suffix}"})
    assert response.status_code == 201, response.text
    body = response.json()
    return body, {"Authorization": f"Bearer {body['token']}"}


def activate(factory, bakery_id, plan="starter", expired=False):
    with factory() as db:
        row = db.scalar(select(Subscription).where(Subscription.bakery_id == bakery_id))
        row.plan, row.status = plan, "active"
        row.activated_at = now_utc()
        row.expires_at = now_utc() + timedelta(days=-1 if expired else 30)
        db.commit()


def catalog_history(client, factory, owner, headers):
    product = client.post("/api/products", headers=headers, json={"name": "Fresh bread", "category": "Bread", "price_kzt": 1000, "cost_kzt": 300, "weight_grams": 200}).json()
    location = client.get("/api/locations", headers=headers).json()[0]
    with factory() as db:
        for offset in range(30):
            day = today_local() - timedelta(days=29 - offset)
            db.add(ProductionRecord(product_id=product["id"], location_id=location["id"], date=day, quantity=100))
            db.add(SalesRecord(product_id=product["id"], location_id=location["id"], date=day, quantity=80, unit_price_kzt=1000, source="regular"))
        db.add(InventorySnapshot(product_id=product["id"], location_id=location["id"], on_hand=600, reserved=0))
        db.commit()
    return product, location


def test_registration_session_hashing_and_revocation(real_client):
    client, factory = real_client
    body, headers = register(client)
    assert body["subscription"]["active"] is False
    assert body["subscription"]["access_mode"] == "unavailable"
    with factory() as db:
        user = db.scalar(select(AuthUser))
        token = db.scalar(select(AuthSession))
        assert user.password_hash.startswith("scrypt$") and check_password("long-local-password", user.password_hash)
        assert "long-local-password" not in user.password_hash
        assert token.token_hash != body["token"] and len(token.token_hash) == 64
    assert client.get("/api/auth/me", headers=headers).json()["organization"]["id"] == body["organization"]["id"]
    assert client.get("/api/products").status_code == 401
    assert client.get("/api/products", headers={"Authorization": "Bearer forged"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "owner-a@example.test", "password": "incorrect-long-password"}).status_code == 401
    assert client.post("/api/auth/logout", headers=headers).status_code == 200
    assert client.get("/api/products", headers=headers).status_code == 401
    assert client.post("/api/auth/login", json={"email": "owner-a@example.test", "password": "long-local-password"}).status_code == 200


def test_inactive_expired_and_exhausted_forecast_gates(real_client):
    client, factory = real_client
    body, headers = register(client)
    product, location = catalog_history(client, factory, body, headers)
    payload = {"product_id": product["id"], "location_id": location["id"], "target_date": str(today_local() + timedelta(days=1)), "horizon_days": 1}
    for endpoint, verb in (("/api/forecasts", "post"), (f"/api/backtest?product_id={product['id']}&location_id={location['id']}", "get")):
        response = getattr(client, verb)(endpoint, headers=headers, **({"json": payload} if verb == "post" else {}))
        assert response.status_code == 402, response.text
    assert client.post("/api/imports/inspect", headers=headers, data={"source_origin": "real"}, files={"file": ("test.csv", b"bad", "text/csv")}).status_code == 402
    assert client.get("/api/dashboard", headers=headers).status_code == 402
    activate(factory, body["organization"]["id"], expired=True)
    assert client.get("/api/subscription", headers=headers).json()["status"] == "expired"
    assert client.post("/api/forecasts", headers=headers, json=payload).status_code == 402
    activate(factory, body["organization"]["id"])
    backtest = client.get(f"/api/backtest?product_id={product['id']}&location_id={location['id']}", headers=headers)
    assert backtest.status_code == 200
    assert backtest.json()["data_source"] == "real" and backtest.json()["demo_data"] is False
    assert any("не подтверждает происхождение" in warning for warning in backtest.json()["warnings"])
    assert client.post("/api/forecasts", headers=headers, json=payload).status_code == 201
    month = today_local().strftime("%Y-%m")
    with factory() as db:
        usage = db.scalar(select(SubscriptionUsage).where(SubscriptionUsage.bakery_id == body["organization"]["id"], SubscriptionUsage.period == month))
        assert usage.forecast_runs == 1
        usage.forecast_runs = 300
        db.commit()
    assert client.post("/api/forecasts", headers=headers, json=payload).status_code == 429
    assert client.get("/api/subscription", headers=headers).json()["usage"]["remaining"] == 0


def test_active_import_preview_commit_and_tenant_scope(real_client):
    client, factory = real_client
    a, ha = register(client, "a")
    b, hb = register(client, "b")
    pa, la = catalog_history(client, factory, a, ha)
    pb, lb = catalog_history(client, factory, b, hb)
    activate(factory, a["organization"]["id"])
    activate(factory, b["organization"]["id"])
    assert [p["id"] for p in client.get("/api/products", headers=ha).json()] == [pa["id"]]
    assert [p["id"] for p in client.get("/api/products", headers=hb).json()] == [pb["id"]]
    for endpoint in (f"/api/history?product_id={pb['id']}&location_id={lb['id']}", f"/api/inventory?location_id={lb['id']}", f"/api/dashboard?location_id={lb['id']}", f"/api/impact?location_id={lb['id']}", f"/api/export?location_id={lb['id']}"):
        assert client.get(endpoint, headers=ha).status_code == 404, endpoint
    assert client.patch(f"/api/products/{pb['id']}", headers=ha, json={"name": "stolen"}).status_code == 404
    assert client.post("/api/records", headers=ha, json={"kind": "production", "product_id": pb["id"], "location_id": lb["id"], "date": str(today_local()), "quantity": 1}).status_code == 404
    inventory = client.get("/api/inventory", headers=ha).json()
    assert all(row["product_id"] == pa["id"] for row in inventory)
    assert client.get("/api/records", headers=ha).json()["total"] == 30
    assert client.get("/api/dashboard", headers=ha).json()["metrics"]["produced"] == 3000
    assert "Private address b" not in client.get("/api/locations", headers=ha).text
    content = f"date,quantity\n{today_local()},4\n".encode()
    options = {"source_origin": "real", "column_mapping": {"date": "date", "quantity": "quantity"}, "default_kind": "production", "default_product_id": pa["id"], "default_location_id": la["id"]}
    files = {"file": ("real-upload.csv", content, "text/csv")}
    inspect = client.post("/api/imports/inspect", headers=ha, files=files, data={"source_origin": "real"})
    assert inspect.status_code == 200, inspect.text
    preview = client.post("/api/imports/preview", headers=ha, files=files, data={"options": json.dumps(options)})
    assert preview.status_code == 200 and preview.json()["can_commit"], preview.text
    committed = client.post("/api/imports/commit", headers=ha, files=files, data={"options": json.dumps(options), "preview_token": preview.json()["preview_token"], "confirm": "IMPORT SAQTA"})
    assert committed.status_code == 200 and committed.json()["imported_count"] == 1, committed.text
    options["default_product_id"] = pb["id"]
    foreign = client.post("/api/imports/preview", headers=ha, files=files, data={"options": json.dumps(options)})
    assert foreign.status_code in (404, 422) or not foreign.json()["can_commit"]
    assert client.post("/api/demo/reset", headers=ha, json={"confirmation": "RESET SAQTA"}).status_code in (403, 422)


def test_demo_explicitly_not_paid_and_real_registration_blocked(client):
    result = client.get("/api/subscription")
    assert result.status_code == 200
    assert result.json()["access_mode"] == "demo" and result.json()["active"] is False
    assert client.post("/api/auth/register", json={"email": "demo@example.test", "password": "long-enough-password", "bakery_name": "Private", "address": "Private address"}).status_code == 403


def test_session_expiry_and_pro_location_creation(real_client):
    client, factory = real_client
    body, headers = register(client)
    payload = {"name": "Second", "address": "Second private address"}
    assert client.post("/api/locations", headers=headers, json=payload).status_code == 403
    activate(factory, body["organization"]["id"], "pro")
    assert client.post("/api/locations", headers=headers, json=payload).status_code == 201
    assert len(client.get("/api/locations", headers=headers).json()) == 2
    with factory() as db:
        row = db.scalar(select(AuthSession))
        row.expires_at = now_utc() - timedelta(seconds=1)
        db.commit()
    assert client.get("/api/products", headers=headers).status_code == 401


def test_assortment_run_counts_once_and_request_replay_does_not_spend_quota(real_client):
    client, factory = real_client
    body, headers = register(client)
    product, location = catalog_history(client, factory, body, headers)
    payload = {"target_date": str(today_local() + timedelta(days=1)), "idempotency_key": "organization-run-001"}
    assert client.post("/api/forecast-runs", headers=headers, json=payload).status_code == 402
    activate(factory, body["organization"]["id"])
    created = client.post("/api/forecast-runs", headers=headers, json=payload)
    assert created.status_code == 201, created.text
    assert created.json()["summary"]["eligible_count"] == 1
    replay = client.post("/api/forecast-runs", headers=headers, json=payload)
    assert replay.status_code == 201 and replay.json()["run_id"] == created.json()["run_id"]
    assert client.get("/api/subscription", headers=headers).json()["usage"]["forecast_runs"] == 1
    changed = client.post("/api/forecast-runs", headers=headers, json={**payload, "horizon_days": 2})
    assert changed.status_code == 409
    assert client.get("/api/subscription", headers=headers).json()["usage"]["forecast_runs"] == 1
    no_history = client.post("/api/products", headers=headers, json={"name": "No observation", "category": "Bread", "price_kzt": 500}).json()
    impossible = client.post("/api/forecasts", headers=headers, json={"product_id": no_history["id"], "location_id": location["id"], "target_date": payload["target_date"]})
    assert impossible.status_code == 422
    assert client.get("/api/subscription", headers=headers).json()["usage"]["forecast_runs"] == 1


def test_save_orders_and_mutations_are_isolated_without_forecast_subscription(real_client):
    client, factory = real_client
    a, ha = register(client, "a")
    b, hb = register(client, "b")
    pa, la = catalog_history(client, factory, a, ha)
    pb, lb = catalog_history(client, factory, b, hb)
    def listing(product, location, headers):
        response = client.post("/api/listings", headers=headers, json={"product_id": product["id"], "location_id": location["id"], "quantity": 3,
                            "discounted_price_kzt": 500, "pickup_start": (now_utc() - timedelta(hours=1)).isoformat(), "pickup_deadline": (now_utc() + timedelta(hours=2)).isoformat()})
        assert response.status_code == 201, response.text
        return response.json()
    listing(pa, la, ha)
    listing_b = listing(pb, lb, hb)
    assert len(client.get("/api/listings", headers=ha).json()) == 1
    assert client.patch(f"/api/listings/{listing_b['id']}", headers=ha, json={"status": "inactive"}).status_code == 404
    assert client.post("/api/orders", headers=ha, json={"customer_name": "Tenant A", "items": [{"listing_id": listing_b["id"], "quantity": 1}]}).status_code == 404
    order_b = client.post("/api/orders", headers=hb, json={"customer_name": "Tenant B", "items": [{"listing_id": listing_b["id"], "quantity": 1}]}).json()
    assert client.get("/api/orders", headers=ha).json() == []
    for action in ("cancel", "collect"):
        assert client.post(f"/api/orders/{order_b['id']}/{action}", headers=ha).status_code == 404
    collected = client.post(f"/api/orders/{order_b['id']}/collect", headers=hb)
    assert collected.status_code == 200 and collected.json()["status"] == "collected", collected.text
    assert client.get("/api/impact", headers=ha).json()["recovered_units"] == 0
    assert client.get("/api/impact", headers=hb).json()["recovered_units"] == 1
    assert client.get("/api/subscription", headers=hb).json()["active"] is False


def test_demo_verification_rows_hidden_and_reset_cannot_touch_real_organization(client, database):
    header = {"X-SAQTA-Verification": "include"}
    created = client.post("/api/products", headers=header, json={"name": "Explicit test fixture", "category": "QA", "price_kzt": 500, "is_test_data": True})
    assert created.status_code == 201
    product_id = created.json()["id"]
    assert product_id not in [row["id"] for row in client.get("/api/products").json()]
    assert product_id in [row["id"] for row in client.get("/api/products", headers=header).json()]
    assert client.patch(f"/api/products/{product_id}", json={"name": "hidden"}).status_code == 404
    assert client.get(f"/api/history?product_id={product_id}&location_id=1").status_code == 404
    with database() as db:
        private = Bakery(name="Must survive", city="Астана")
        db.add(private)
        db.flush()
        db.add(BakeryLocation(bakery_id=private.id, name="Private", address="Private", city="Астана"))
        db.add(ApplicationSettings(bakery_id=private.id, workspace_mode="real", currency="KZT", safety_buffer_percent=10))
        db.commit()
        private_id = private.id
    assert client.post("/api/demo/reset", json={"confirm": "RESET SAQTA DEMO"}).status_code == 403
    assert all(row["bakery_id"] != private_id for row in client.get("/api/locations").json())
    with database() as db:
        assert db.get(Bakery, private_id).name == "Must survive"


def test_real_test_marker_cannot_create_or_reveal_foreign_data(real_client):
    client, factory = real_client
    a, ha = register(client, "a")
    b, hb = register(client, "b")
    pb, lb = catalog_history(client, factory, b, hb)
    verification = {**ha, "X-SAQTA-Verification": "include"}
    assert client.post("/api/products", headers=verification, json={"name": "fixture", "category": "QA", "price_kzt": 1, "is_test_data": True}).status_code == 403
    assert client.get("/api/products", headers=verification).json() == []
    assert client.get(f"/api/history?product_id={pb['id']}&location_id={lb['id']}", headers=verification).status_code == 404


def test_free_save_catalog_and_fourth_listing_do_not_require_forecast_subscription(real_client):
    client, _ = real_client
    _, headers = register(client)
    products = []
    for index in range(5):
        response = client.post("/api/products", headers=headers, json={"name": f"Free Save product {index + 1}", "category": "Bread", "price_kzt": 1000})
        assert response.status_code == 201, response.text
        products.append(response.json())
    fourth = products[3]
    assert client.patch(f"/api/products/{fourth['id']}", headers=headers, json={"is_active": False}).status_code == 200
    assert client.patch(f"/api/products/{fourth['id']}", headers=headers, json={"is_active": True}).status_code == 200
    location = client.get("/api/locations", headers=headers).json()[0]
    production = client.post("/api/records", headers=headers, json={"kind": "production", "product_id": fourth["id"],
                             "location_id": location["id"], "date": str(today_local()), "quantity": 4})
    assert production.status_code == 201, production.text
    listing = client.post("/api/listings", headers=headers, json={"product_id": fourth["id"], "location_id": location["id"], "quantity": 2,
                          "discounted_price_kzt": 500, "pickup_start": (now_utc() - timedelta(hours=1)).isoformat(),
                          "pickup_deadline": (now_utc() + timedelta(hours=2)).isoformat()})
    assert listing.status_code == 201 and listing.json()["publication_fee_tiyn"] == 0, listing.text
    assert client.get("/api/subscription", headers=headers).json()["active"] is False
    assert client.post("/api/forecast-runs", headers=headers, json={"target_date": str(today_local() + timedelta(days=1))}).status_code == 402


def test_atomic_last_forecast_allowance_with_two_concurrent_requests(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "workspace_mode", "real")
    engine = build_engine(f"sqlite:///{tmp_path / 'quota-race.db'}")
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
    try:
        with TestClient(app) as client:
            body, headers = register(client)
            catalog_history(client, factory, body, headers)
            owner = body["organization"]["id"]
            activate(factory, owner)
            with factory() as db:
                db.add(SubscriptionUsage(bakery_id=owner, period=today_local().strftime("%Y-%m"), forecast_runs=299))
                db.commit()
            def request(index):
                return client.post("/api/forecast-runs", headers=headers, json={"target_date": str(today_local() + timedelta(days=1)), "idempotency_key": f"last-slot-race-{index}"})
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(request, [1, 2]))
            assert sorted(response.status_code for response in results) == [201, 429], [r.text for r in results]
            assert client.get("/api/subscription", headers=headers).json()["usage"]["forecast_runs"] == 300
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
