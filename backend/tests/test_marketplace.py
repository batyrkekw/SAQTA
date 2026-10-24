from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import sessionmaker

from app.core.config import now_utc
from app.db.session import Base, build_engine
from app.models import InventorySnapshot, SurplusListing
from app.schemas import OrderCreate
from app.seed import seed_database
from app.services.marketplace import create_order


def order_payload(listing_id, qty=1):
    return {"customer_name": "Демо-тест", "items": [{"listing_id": listing_id, "quantity": qty}]}


def test_order_reservation_cancel_collection_consistency(client):
    listing = client.get("/api/listings").json()[0]
    available = listing["available_quantity"]
    stock_before = next(r for r in client.get("/api/inventory").json() if r["product_id"] == listing["product_id"] and r["location_id"] == listing["location_id"])
    response = client.post("/api/orders", json=order_payload(listing["id"], 2))
    assert response.status_code == 201
    order = response.json()
    assert order["total_kzt"] == 2 * listing["discounted_price_kzt"]
    updated = next(r for r in client.get("/api/listings").json() if r["id"] == listing["id"])
    assert updated["available_quantity"] == available - 2
    assert client.post(f"/api/orders/{order['id']}/cancel").json()["status"] == "cancelled"
    assert next(r for r in client.get("/api/listings").json() if r["id"] == listing["id"])["available_quantity"] == available
    assert client.post(f"/api/orders/{order['id']}/cancel").status_code == 409
    second = client.post("/api/orders", json=order_payload(listing["id"], 2)).json()
    assert client.post(f"/api/orders/{second['id']}/collect").json()["status"] == "collected"
    assert client.post(f"/api/orders/{second['id']}/collect").status_code == 409
    stock_after = next(r for r in client.get("/api/inventory").json() if r["product_id"] == listing["product_id"] and r["location_id"] == listing["location_id"])
    assert stock_after["on_hand"] == stock_before["on_hand"] - 2
    assert stock_after["reserved"] == stock_before["reserved"] - 2


def test_overselling_and_duplicate_lines_rejected(client):
    listing = client.get("/api/listings").json()[0]
    assert client.post("/api/orders", json=order_payload(listing["id"], listing["available_quantity"] + 1)).status_code == 409
    assert client.post("/api/orders", json={"customer_name": "Тест", "items": [order_payload(listing["id"])["items"][0]] * 2}).status_code == 422
    response = client.post("/api/orders", json=order_payload(listing["id"], listing["available_quantity"]))
    assert response.status_code == 201
    assert client.post("/api/orders", json=order_payload(listing["id"])).status_code == 409


def test_listing_creation_edit_and_release_allocated_stock(client):
    stock = next(r for r in client.get("/api/inventory").json() if r["product_id"] == 2 and r["location_id"] == 1)
    payload = {"product_id": 2, "location_id": 1, "quantity": 2, "discounted_price_kzt": 600,
               "pickup_start": (now_utc() - timedelta(minutes=1)).isoformat(), "pickup_deadline": (now_utc() + timedelta(hours=2)).isoformat()}
    listing = client.post("/api/listings", json=payload)
    assert listing.status_code == 201, listing.text
    row_id = listing.json()["id"]
    assert client.patch(f"/api/listings/{row_id}", json={"quantity": 3}).json()["available_quantity"] == 3
    assert client.patch(f"/api/listings/{row_id}", json={"status": "inactive"}).json()["available_quantity"] == 0
    result = next(r for r in client.get("/api/inventory").json() if r["product_id"] == 2 and r["location_id"] == 1)
    assert result["reserved"] == stock["reserved"]
    payload["quantity"] = 99999
    assert client.post("/api/listings", json=payload).status_code == 409
    payload["quantity"], payload["discounted_price_kzt"] = 1, 1200
    assert client.post("/api/listings", json=payload).status_code == 422


def test_listing_deactivation_preserves_existing_orders(client):
    listing = client.get("/api/listings").json()[0]
    order = client.post("/api/orders", json=order_payload(listing["id"], 2)).json()
    assert client.patch(f"/api/listings/{listing['id']}", json={"status": "inactive"}).status_code == 200
    assert client.post(f"/api/orders/{order['id']}/collect").status_code == 200


def test_expiration_releases_listing_and_order_reservations(client, database):
    listing = client.get("/api/listings").json()[0]
    order = client.post("/api/orders", json=order_payload(listing["id"])).json()
    with database() as session:
        session.execute(update(SurplusListing).where(SurplusListing.id == listing["id"]).values(pickup_deadline=now_utc() - timedelta(minutes=1)))
        session.commit()
    orders = client.get("/api/orders").json()
    assert next(o for o in orders if o["id"] == order["id"])["status"] == "cancelled"
    result = next(r for r in client.get("/api/inventory").json() if r["product_id"] == listing["product_id"] and r["location_id"] == listing["location_id"])
    assert result["reserved"] == 0


def test_concurrent_orders_cannot_oversell_file_sqlite(tmp_path):
    engine = build_engine(f"sqlite:///{tmp_path / 'concurrency.db'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as session:
        seed_database(session)
        listing = session.scalar(select(SurplusListing).where(SurplusListing.status == "active").order_by(SurplusListing.id))
        listing_id, quantity = listing.id, listing.available_quantity
        session.commit()

    def reserve():
        with factory() as session:
            try:
                create_order(session, OrderCreate.model_validate(order_payload(listing_id, quantity)))
                session.commit()
                return "ok"
            except HTTPException as exc:
                session.rollback()
                return exc.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: reserve(), range(2)))
    assert sorted(results, key=str) == sorted(["ok", 409], key=str)
    with factory() as session:
        listing = session.get(SurplusListing, listing_id)
        assert listing.available_quantity == 0
        assert listing.reserved_quantity == quantity
        inventory = session.scalar(select(InventorySnapshot).where(InventorySnapshot.product_id == listing.product_id, InventorySnapshot.location_id == listing.location_id))
        assert inventory.on_hand >= inventory.reserved >= quantity
    engine.dispose()
