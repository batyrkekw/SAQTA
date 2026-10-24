from datetime import timedelta

import pytest

from app.core.config import now_utc, today_local
from app.services.commission import split_sale


@pytest.mark.parametrize("total,fee,proceeds", [(2000, 10000, 190000), (1, 5, 95), (0, 0, 0), (1999, 9995, 189905), (20_000_000_000_000, 100_000_000_000_000, 1_900_000_000_000_000)])
def test_exact_integer_tiyn_settlement(total, fee, proceeds):
    assert split_sale(total) == (fee, proceeds)
    assert fee + proceeds == total * 100


@pytest.mark.parametrize("value", [-1, 1.5, True, "2000"])
def test_invalid_money_rejected(value):
    with pytest.raises(ValueError):
        split_sale(value)


def listing_for(client, price=1000):
    product = client.post("/api/products", json={"name": "Проверка комиссии", "category": "Тест", "price_kzt": 4000}).json()
    record = client.post("/api/records", json={"product_id": product["id"], "location_id": 1, "date": today_local().isoformat(), "kind": "production", "quantity": 10})
    assert record.status_code == 201, record.text
    listing = client.post("/api/listings", json={"product_id": product["id"], "location_id": 1, "quantity": 10,
        "discounted_price_kzt": price, "pickup_start": (now_utc() - timedelta(minutes=1)).isoformat(), "pickup_deadline": (now_utc() + timedelta(hours=1)).isoformat()})
    assert listing.status_code == 201, listing.text
    return listing.json()


def test_only_collection_records_fee_on_discounted_snapshot_and_retry_cannot_repeat(client):
    listing = listing_for(client)
    assert listing["publication_fee_tiyn"] == 0
    payload = {"customer_name": "Демо", "idempotency_key": "commission-discount-001", "items": [{"listing_id": listing["id"], "quantity": 2}]}
    response = client.post("/api/orders", json=payload)
    assert response.status_code == 201, response.text
    order = response.json()
    assert order["total_kzt"] == 2000
    assert order["settlement"]["commission_tiyn"] == 0
    assert order["settlement"]["estimated_commission_tiyn"] == 10000
    assert order["settlement"]["completed_sale_tiyn"] == 0
    repeated = client.post("/api/orders", json=payload).json()
    assert repeated["id"] == order["id"]
    assert next(row for row in client.get("/api/listings").json() if row["id"] == listing["id"])["reserved_quantity"] == 2
    assert client.patch(f"/api/listings/{listing['id']}", json={"discounted_price_kzt": 500}).status_code == 200
    collected = client.post(f"/api/orders/{order['id']}/collect").json()
    assert collected["settlement"]["commission_tiyn"] == 10000  # 100 KZT, not 5% of original 8000 or revised 1000.
    assert collected["settlement"]["seller_proceeds_tiyn"] == 190000
    assert collected["settlement"]["status"] == "recorded"
    assert collected["settlement"]["payments_processed"] is False
    assert client.post(f"/api/orders/{order['id']}/collect").status_code == 409
    replay = client.post("/api/orders", json=payload).json()
    assert replay["id"] == order["id"] and replay["settlement"] == collected["settlement"]
    assert len([item for item in client.get("/api/orders").json() if item["id"] == order["id"]]) == 1


def test_cancel_and_idempotency_mismatch_never_accrue_fee(client):
    listing = listing_for(client, price=1)
    payload = {"customer_name": "Демо", "idempotency_key": "commission-cancel-001", "items": [{"listing_id": listing["id"], "quantity": 1}]}
    order = client.post("/api/orders", json=payload).json()
    changed = {**payload, "customer_name": "Другое имя"}
    assert client.post("/api/orders", json=changed).status_code == 409
    cancelled = client.post(f"/api/orders/{order['id']}/cancel").json()
    assert cancelled["settlement"]["commission_tiyn"] == cancelled["settlement"]["seller_proceeds_tiyn"] == 0
    assert cancelled["settlement"]["estimated_commission_tiyn"] == 0
    assert cancelled["settlement"]["status"] == "not_due"
    assert client.post(f"/api/orders/{order['id']}/collect").status_code == 409
    assert client.post("/api/orders", json=payload).json()["id"] == order["id"]


def test_legacy_estimates_are_labeled_without_invented_charge(client):
    archived = next(order for order in client.get("/api/orders").json() if order["status"] == "collected" and order["settlement"]["recorded_at"] is None)
    assert archived["settlement"]["status"] == "historical_estimate"
    assert archived["settlement"]["commission_tiyn"] == archived["total_kzt"] * 5
    assert archived["settlement"]["payments_processed"] is False
