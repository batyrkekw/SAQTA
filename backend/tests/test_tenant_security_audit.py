"""Independent regression audit: repeated query shapes must never cache another tenant."""
import json
from datetime import timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import aliased

import test_organization_access as organization_access
from test_organization_access import activate, catalog_history, register

from app.core.config import now_utc, today_local
from app.models import ForecastObservation, ForecastRun, ImportBatch, Order, OrderItem, Product, ProductionRecord, SubscriptionUsage

real_client = organization_access.real_client


def organizations(client, factory):
    result = []
    for suffix in ("a", "b", "c"):
        account, headers = register(client, suffix)
        product, location = catalog_history(client, factory, account, headers)
        activate(factory, account["organization"]["id"])
        result.append((account, headers, product, location))
    return result


def test_three_organizations_repeated_http_queries_and_aggregates_remain_isolated(real_client):
    client, factory = real_client
    tenants = organizations(client, factory)
    # Reuse identical compiled query shapes in alternating tenant order.
    for index in (0, 1, 0, 2, 1, 2, 0):
        account, headers, product, location = tenants[index]
        owner = account["organization"]["id"]
        assert client.get("/api/bakery", headers=headers).json()["id"] == owner
        assert client.get("/api/settings", headers=headers).json()["bakery_name"] == f"Bakery {'abc'[index]}"
        assert [row["id"] for row in client.get("/api/locations", headers=headers).json()] == [location["id"]]
        assert [row["id"] for row in client.get("/api/products", headers=headers).json()] == [product["id"]]
        assert client.get("/api/records", headers=headers).json()["total"] == 30
        assert all(row["product_id"] == product["id"] for row in client.get("/api/inventory", headers=headers).json())
        assert client.get("/api/dashboard", headers=headers).json()["metrics"]["produced"] == 3000
        assert client.get("/api/impact", headers=headers).json()["recovered_units"] == 0
        assert len(client.get(f"/api/history?product_id={product['id']}&location_id={location['id']}", headers=headers).json()) == 30
        report = client.post("/api/forecast-runs", headers=headers, json={"target_date": str(today_local() + timedelta(days=1)), "idempotency_key": "same-key-each-tenant"})
        assert report.status_code == 201, report.text
        assert report.json()["scope"]["bakery_id"] == owner
        assert {(item["product_id"], item["location_id"]) for item in report.json()["items"]} == {(product["id"], location["id"])}
        assert client.get("/api/subscription", headers=headers).json()["usage"]["forecast_runs"] == 1
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(ForecastRun)) == 3
        assert sorted(db.scalars(select(SubscriptionUsage.forecast_runs))) == [1, 1, 1]


def test_foreign_observation_ids_cannot_be_previewed_committed_or_forecast(real_client):
    client, factory = real_client
    (_, ha, pa, la), (_, hb, pb, lb), _ = organizations(client, factory)
    content = ("date,sold\n" + "\n".join(f"{today_local() - timedelta(days=2-offset)},10" for offset in range(3))).encode()
    options = {"source_origin": "real", "mode": "observations", "column_mapping": {"date": "date", "sold": "sold"},
               "default_product_id": pb["id"], "default_location_id": lb["id"]}
    files = {"file": ("observations.csv", content)}
    preview_b = client.post("/api/imports/preview", headers=hb, files=files, data={"options": json.dumps(options)})
    assert preview_b.status_code == 200 and preview_b.json()["can_commit"]
    # A valid B preview token/file/options cannot be committed with A's session.
    response = client.post("/api/imports/commit", headers={**ha, "X-SAQTA-Verification": "include"}, files=files,
                           data={"options": json.dumps(options), "preview_token": preview_b.json()["preview_token"], "confirm": "IMPORT SAQTA"})
    assert response.status_code in (409, 422), response.text
    assert client.post("/api/forecast-runs", headers=ha, json={"target_date": str(today_local() + timedelta(days=1)), "location_id": lb["id"]}).status_code == 404
    response = client.post("/api/forecasts", headers=ha, json={"product_id": pb["id"], "location_id": la["id"], "target_date": str(today_local() + timedelta(days=1))})
    assert response.status_code == 404
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(ForecastObservation)) == 0
        assert db.scalar(select(func.count()).select_from(ImportBatch)) == 0


def test_direct_scoped_orm_scalar_alias_subquery_update_and_orderitem_ids(real_client):
    client, factory = real_client
    (a, ha, pa, la), (b, hb, pb, lb), _ = organizations(client, factory)
    owner_a, owner_b = a["organization"]["id"], b["organization"]["id"]
    # Independent raw sessions bind the same trusted owner context as HTTP scoped_db.
    for owner, expected in ((owner_a, pa["id"]), (owner_b, pb["id"]), (owner_a, pa["id"])):
        with factory() as db:
            db.info["bakery_id"] = owner
            assert list(db.scalars(select(Product.id))) == [expected]
            assert db.scalar(select(func.count()).select_from(ProductionRecord)) == 30
            alias = aliased(Product)
            assert list(db.scalars(select(alias.id))) == [expected]
            subquery = select(Product.id).subquery()
            assert list(db.scalars(select(subquery.c.id))) == [expected]
            changed = db.execute(update(Product).where(Product.id == (pb["id"] if owner == owner_a else pa["id"])).values(name="cross-tenant-write")).rowcount
            assert changed == 0
            db.rollback()
    listing = client.post("/api/listings", headers=hb, json={"product_id": pb["id"], "location_id": lb["id"], "quantity": 2,
        "discounted_price_kzt": 500, "pickup_start": (now_utc() - timedelta(minutes=1)).isoformat(), "pickup_deadline": (now_utc() + timedelta(hours=1)).isoformat()}).json()
    order = client.post("/api/orders", headers=hb, json={"customer_name": "Private B", "items": [{"listing_id": listing["id"], "quantity": 1}]}).json()
    with factory() as db:
        item_id = db.scalar(select(OrderItem.id).where(OrderItem.order_id == order["id"]))
    with factory() as db:
        db.info["bakery_id"] = owner_a
        assert db.get(Order, order["id"]) is None
        assert db.get(OrderItem, item_id) is None
        assert db.scalar(select(func.count()).select_from(OrderItem)) == 0
        assert db.scalar(select(func.sum(Order.total_kzt))) is None
    assert client.get("/api/orders", headers=ha).json() == []
    assert client.post(f"/api/orders/{order['id']}/collect", headers=ha).status_code == 404
    assert client.get(f"/api/listings?location_id={lb['id']}", headers=ha).status_code == 404


def test_global_health_does_not_disclose_any_private_organization(real_client):
    client, factory = real_client
    organizations(client, factory)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert "Bakery" not in response.text and "Private address" not in response.text
    for route in ("products", "locations", "bakery", "settings", "history?product_id=1&location_id=1", "records", "inventory", "orders", "listings", "dashboard", "impact", "subscription"):
        assert client.get(f"/api/{route}").status_code == 401, route


def test_legacy_import_requires_confirmed_source_workflow_in_real_workspace(real_client):
    client, factory = real_client
    account, headers = register(client)
    content = b"kind,product_id,location_id,date,quantity\nproduction,1,1,2026-01-01,1\n"
    assert client.post("/api/import", headers=headers, files={"file": ("daily.csv", content)}).status_code == 402
    activate(factory, account["organization"]["id"])
    response = client.post("/api/import", headers=headers, files={"file": ("daily.csv", content)})
    assert response.status_code == 409
    assert "подтверждённого импорта" in response.json()["detail"]
