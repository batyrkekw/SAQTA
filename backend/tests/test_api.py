from datetime import timedelta

import pytest
from sqlalchemy import update

from app.core.config import get_settings, today_local
from app.models import ApplicationSettings
from app.seed import seed_database


def post_record(client, **overrides):
    payload = {"kind": "production", "product_id": 1, "location_id": 1, "date": today_local().isoformat(), "quantity": 10}
    payload.update(overrides)
    return client.post("/api/records", json=payload)


def stock(client, product=1, location=1):
    return next(row for row in client.get("/api/inventory").json() if row["product_id"] == product and row["location_id"] == location)


def test_health_and_major_read_endpoints(client):
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["service"] == "SAQTA"
    for endpoint in ("/api/products", "/api/locations", "/api/bakery", "/api/settings", "/api/inventory", "/api/records", "/api/listings", "/api/orders", "/api/impact", "/api/dashboard", "/api/forecasts", "/api/history?product_id=1&location_id=1", "/openapi.json"):
        response = client.get(endpoint)
        assert response.status_code == 200, (endpoint, response.text)


def test_catalog_creation_update_validation(client):
    response = client.post("/api/products", json={"name": "Тестовый хлеб", "category": "Хлеб", "price_kzt": 1000, "cost_kzt": 400, "weight_grams": 300})
    assert response.status_code == 201
    product = response.json()
    assert client.patch(f"/api/products/{product['id']}", json={"price_kzt": 1100}).json()["price_kzt"] == 1100
    assert client.patch(f"/api/products/{product['id']}", json={"price_kzt": -1}).status_code == 422
    assert client.patch("/api/products/99999", json={"name": "Нет"}).status_code == 404


def test_inventory_create_edit_and_negative_validation(client):
    before = stock(client)
    record = post_record(client).json()
    assert stock(client)["on_hand"] == before["on_hand"] + 10
    response = client.patch(f"/api/records/production/{record['id']}", json={"quantity": 15})
    assert response.status_code == 200
    assert stock(client)["on_hand"] == before["on_hand"] + 15
    assert post_record(client, quantity=-3).status_code == 422
    assert post_record(client, quantity=0).status_code == 422
    assert post_record(client, kind="sales", quantity=99999).status_code == 409
    assert stock(client)["on_hand"] == before["on_hand"] + 15


def test_waste_validation_and_cost_snapshot(client):
    before = client.get("/api/impact").json()
    assert post_record(client, kind="waste", quantity=1).status_code == 422
    assert post_record(client, kind="waste", quantity=1, reason="Повреждение").status_code == 201
    after = client.get("/api/impact").json()
    assert after["written_off_units"] == before["written_off_units"] + 1
    assert round(after["written_off_kg"] - before["written_off_kg"], 3) == 0.08


def test_historical_inconsistency_is_rejected(client):
    old = today_local() - timedelta(days=45)
    response = post_record(client, kind="sales", quantity=1, date=old.isoformat())
    assert response.status_code == 409
    assert "отрицательный остаток" in response.json()["detail"]


def test_future_records_rejected(client):
    assert post_record(client, date=(today_local() + timedelta(days=1)).isoformat()).status_code == 422


def test_dashboard_filters_change_calculations(client):
    full = client.get("/api/dashboard").json()
    location = client.get("/api/dashboard?location_id=1").json()
    today = client.get(f"/api/dashboard?start_date={today_local()}&end_date={today_local()}").json()
    assert full["metrics"]["produced"] > location["metrics"]["produced"]
    assert full["metrics"]["produced"] > today["metrics"]["produced"]
    assert full["demo_data"] is True
    assert full["metrics"]["potential_savings_kzt"] == round(full["metrics"]["loss_kzt"] * 0.2)
    assert len(today["trends"]) == 1
    assert client.get(f"/api/dashboard?start_date={today_local()}&end_date=2020-01-01").status_code == 422
    assert client.get("/api/dashboard?location_id=9999").status_code == 404


def test_forecast_end_to_end_and_insufficient_history(client):
    request = {"product_id": 1, "location_id": 1, "target_date": (today_local() + timedelta(days=1)).isoformat(), "horizon_days": 3}
    response = client.post("/api/forecasts", json=request)
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["predicted_demand"] > 0 and result["evaluation_points"] == 7
    assert result["mae"] is not None and len(result["daily"]) == 3
    assert result["existing_inventory"] == stock(client)["available"]
    assert len(client.get("/api/forecasts").json()) == 1
    product = client.post("/api/products", json={"name": "Новый", "category": "Хлеб", "price_kzt": 500}).json()
    request["product_id"] = product["id"]
    assert client.post("/api/forecasts", json=request).status_code == 422
    request["target_date"] = today_local().isoformat()
    assert client.post("/api/forecasts", json=request).status_code == 422


def test_csv_validation_and_atomic_rollback(client):
    day = today_local().isoformat()
    before = stock(client)["on_hand"]
    good = f"kind,product_id,location_id,date,quantity,reason\nproduction,1,1,{day},3,\nsales,1,1,{day},1,\n"
    response = client.post("/api/import", files={"file": ("records.csv", good, "text/csv")})
    assert response.status_code == 200 and response.json()["imported"] == 2
    assert stock(client)["on_hand"] == before + 2
    invalid = f"kind,product_id,location_id,date,quantity\nproduction,1,1,{day},5\nsales,1,1,{day},99999\n"
    assert client.post("/api/import", files={"file": ("invalid.csv", invalid, "text/csv")}).status_code == 422
    assert stock(client)["on_hand"] == before + 2
    assert client.post("/api/import", files={"file": ("invalid.csv", "bad,column\nx,y", "text/csv")}).status_code == 422
    assert client.post("/api/import", files={"file": ("invalid.csv", f"kind,product_id,location_id,date,quantity\nproduction,1,1,{day},-2", "text/csv")}).status_code == 422
    assert client.post("/api/import", files={"file": ("invalid.txt", good, "text/plain")}).status_code == 422
    assert client.post("/api/import", files={"file": ("large.csv", b"x" * (2 * 1024 * 1024 + 1), "text/csv")}).status_code == 413


def test_export_and_pagination(client):
    response = client.get("/api/export?location_id=1")
    assert response.status_code == 200 and "kind,product_id,location_id,date,quantity" in response.text
    data = client.get("/api/records?page_size=2").json()
    assert len(data["items"]) == 2 and data["total"] > 2


def test_settings_and_reset_confirmation(client):
    assert client.patch("/api/settings", json={"safety_buffer_percent": 15, "bakery_name": "SAQTA тест"}).json()["safety_buffer_percent"] == 15
    assert client.patch("/api/settings", json={"safety_buffer_percent": 101}).status_code == 422
    assert client.post("/api/demo/reset", json={"confirm": "yes"}).status_code == 422
    response = client.post("/api/demo/reset", json={"confirm": "RESET SAQTA DEMO"})
    assert response.status_code == 200 and response.json()["days"] == 42
    assert len(client.get("/api/products").json()) == 5


def test_reset_refused_in_real_workspace(client):
    settings = get_settings()
    original = settings.workspace_mode
    try:
        settings.workspace_mode = "real"
        assert client.post("/api/demo/reset", json={"confirm": "RESET SAQTA DEMO"}).status_code == 403
        # Merely changing the environment must never relabel synthetic records as real.
        assert client.get("/api/settings").json()["demo_data"] is True
    finally:
        settings.workspace_mode = original


def test_persisted_real_workspace_cannot_be_reset_by_demo_environment(client, database):
    with database() as session:
        session.execute(update(ApplicationSettings).values(workspace_mode="real"))
        session.commit()
        with pytest.raises(ValueError, match="persisted real-data workspace"):
            seed_database(session, reset=True)
    assert client.get("/api/settings").json()["demo_data"] is False
    assert client.post("/api/demo/reset", json={"confirm": "RESET SAQTA DEMO"}).status_code == 403
    assert len(client.get("/api/products").json()) == 5


def test_unit_economics_defaults_and_zero_divisors(client):
    data = client.post("/api/economics", json={}).json()
    assert data["revenue_kzt"] == 30000
    assert data["variable_costs_kzt"] == 9000
    assert data["contribution_kzt"] == 21000 and data["contribution_percent"] == 70
    assert data["ltv_kzt"] == 252000 and data["ltv_cac"] == 6.3
    assert round(data["cac_payback_months"], 1) == 1.9 and data["arr_kzt"] == 3600000
    data = client.post("/api/economics", json={"subscription_kzt": 0, "cac_kzt": 0}).json()
    assert data["contribution_percent"] is None and data["ltv_cac"] is None and data["cac_payback_months"] is None
    assert client.post("/api/economics", json={"cac_kzt": -1}).status_code == 422


def test_impact_only_counts_collected_orders_and_no_causality_claims(client):
    before = client.get("/api/impact").json()
    listing = client.get("/api/listings").json()[0]
    order = client.post("/api/orders", json={"customer_name": "Тест", "items": [{"listing_id": listing["id"], "quantity": 1}]}).json()
    assert client.get("/api/impact").json()["recovered_units"] == before["recovered_units"]
    assert client.post(f"/api/orders/{order['id']}/collect").status_code == 200
    after = client.get("/api/impact").json()
    assert after["recovered_units"] == before["recovered_units"] + 1
    assert round(after["recovered_weight_kg"] - before["recovered_weight_kg"], 3) == listing["weight_grams"] / 1000
    assert after["recovered_value_kzt"] == before["recovered_value_kzt"] + listing["discounted_price_kzt"]
    assert after["potential_avoided_waste_kg"] is None and after["methodology"]


def test_no_baseline_gives_no_change_percentage(client):
    day = today_local() - timedelta(days=100)
    result = client.get(f"/api/impact?start_date={day}&end_date={day}").json()
    assert result["change_percent"] is None and result["recovered_units"] == 0
