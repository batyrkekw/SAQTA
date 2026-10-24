import io
import json
from datetime import timedelta

import openpyxl
import pytest
from sqlalchemy import func, select

from app.core.config import today_local
from app.models import ForecastObservation, ForecastRun, ImportBatch, InventorySnapshot, ProductionRecord, SalesRecord
from app.services.inventory import sales_history_rows


def product(client, name="Новый хлеб"):
    response = client.post("/api/products", json={"name": name, "category": "Хлеб", "price_kzt": 500})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def upload(client, content, options, filename="daily.csv", action="preview", **extra):
    return client.post(f"/api/imports/{action}", files={"file": (filename, content)},
                       data={"options": json.dumps(options), **extra})


def options(product_id, **extra):
    return {"source_origin": "demo", "mode": "observations", "column_mapping": {"date": "Дата", "sold": "Продано"},
            "default_product_id": product_id, "default_location_id": 1, **extra}


def csv_history(values, start=None, extra_header="", extra_values=None):
    start = start or today_local() - timedelta(days=len(values) - 1)
    return ("Дата,Продано" + extra_header + "\n" + "\n".join(
        f"{start + timedelta(days=index)},{value}" + (extra_values[index] if extra_values else "")
        for index, value in enumerate(values))).encode()


def commit(client, content, config, filename="daily.csv"):
    preview = upload(client, content, config, filename)
    assert preview.status_code == 200, preview.text
    assert preview.json()["can_commit"], preview.text
    result = upload(client, content, config, filename, "commit", preview_token=preview.json()["preview_token"], confirm="IMPORT SAQTA")
    assert result.status_code == 200, result.text
    return result.json(), preview.json()


def run(client, **extra):
    return client.post("/api/forecast-runs", json={"target_date": (today_local() + timedelta(days=1)).isoformat(), **extra})


def test_assortment_covers_all_products_and_locations_without_product_selection(client):
    result = run(client)
    assert result.status_code == 201, result.text
    report = result.json()
    assert report["summary"]["product_count"] == 5
    assert report["summary"]["location_count"] == 2
    assert report["summary"]["item_count"] == report["summary"]["eligible_count"] == 10
    assert {(item["product_id"], item["location_id"]) for item in report["items"]} == {(p, loc) for p in range(1, 6) for loc in (1, 2)}
    assert report["summary"]["predicted_demand"] == sum(item["predicted_demand"] for item in report["items"])
    assert all(item["history_days"] == 42 and item["data_source"] == "synthetic" for item in report["items"])


def test_location_filter_and_disabled_products_do_not_leak_into_assortment(client):
    product_id = product(client, "Неактивный")
    assert client.patch(f"/api/products/{product_id}", json={"is_active": False}).status_code == 200
    report = run(client, location_id=1).json()
    assert report["summary"]["product_count"] == 5 and report["summary"]["location_count"] == 1
    assert {item["location_id"] for item in report["items"]} == {1}
    assert run(client, location_id=999999).status_code == 404


def test_run_idempotency_returns_saved_result_without_duplicate_run(client, database):
    first = run(client, idempotency_key="stable-run-123")
    second = run(client, idempotency_key="stable-run-123")
    assert first.status_code == second.status_code == 201
    assert first.json() == second.json()
    with database() as db:
        assert db.scalar(select(func.count()).select_from(ForecastRun)) == 1
    assert run(client, idempotency_key="stable-run-123", location_id=1).status_code == 409


def test_sales_only_import_preserves_explicit_zero_and_never_invents_inventory(client, database):
    product_id = product(client)
    content = csv_history([0, 10, 20])
    with database() as db:
        before = {model: db.scalar(select(func.count()).select_from(model)) for model in (SalesRecord, ProductionRecord, InventorySnapshot)}
    preview = upload(client, content, options(product_id)).json()
    assert preview["valid_rows"] == 3 and preview["preview_rows"][0]["record"]["sold"] == 0
    assert all(row["record"]["remaining"] is None and row["record"]["produced"] is None for row in preview["preview_rows"])
    with database() as db:
        assert db.scalar(select(func.count()).select_from(ForecastObservation)) == 0
    committed, _ = commit(client, content, options(product_id))
    assert committed["imported_count"] == 3
    with database() as db:
        assert {model: db.scalar(select(func.count()).select_from(model)) for model in before} == before
        rows = sales_history_rows(db, product_id, 1)
        assert len(rows) == 3 and rows[0]["sales"] == 0 and rows[0]["explicit_zero"] is True
    item = next(item for item in run(client, location_id=1).json()["items"] if item["product_id"] == product_id)
    assert item["status"] == "missing_inventory" and item["predicted_demand"] is not None
    assert item["recommended_production"] is None and item["available_inventory"] is None
    assert item["potential_writeoff_cost_kzt"] is None and item["expected_surplus"] is None
    assert "missing_inventory" in item["risks"] and "shortage" not in item["risks"]


def test_wide_xlsx_optional_fields_are_observations_not_stock_movements(client, database):
    product_id = product(client)
    book = openpyxl.Workbook()
    sheet = book.active
    sheet.append(["Дата", "Товар", "Продано", "Остаток", "Произведено"])
    for index in range(3):
        sheet.append([today_local() - timedelta(days=2 - index), product_id, 10, 4, 14])
    stream = io.BytesIO()
    book.save(stream)
    config = options(product_id, column_mapping={"date": "Дата", "product": "Товар", "sold": "Продано", "remaining": "Остаток", "produced": "Произведено"})
    commit(client, stream.getvalue(), config, "wide.xlsx")
    item = next(item for item in run(client, location_id=1).json()["items"] if item["product_id"] == product_id)
    assert item["status"] == "ok" and item["available_inventory"] == 4
    assert item["predicted_demand"] == 10 and item["recommended_production"] == 7
    assert item["inventory_source"]["source"] == "imported_snapshot"
    assert "shortage" in item["risks"]
    assert item["potential_writeoff_cost_kzt"] is None  # no known unit cost
    with database() as db:
        assert db.scalar(select(InventorySnapshot).where(InventorySnapshot.product_id == product_id)) is None


def test_stale_remaining_is_not_called_current_inventory(client):
    product_id = product(client)
    config = options(product_id, column_mapping={"date": "Дата", "sold": "Продано", "remaining": "Остаток"})
    commit(client, csv_history([10, 10, 10], today_local() - timedelta(days=10), ",Остаток", [",99"] * 3), config)
    item = next(item for item in run(client, location_id=1).json()["items"] if item["product_id"] == product_id)
    assert item["available_inventory"] is None and item["status"] == "missing_inventory"
    assert any("устарел" in warning for warning in item["warnings"])


def test_insufficient_history_is_reported_per_item_without_fake_demand(client):
    product_id = product(client)
    commit(client, csv_history([10, 20]), options(product_id))
    report = run(client, location_id=1).json()
    item = next(item for item in report["items"] if item["product_id"] == product_id)
    assert item["status"] == "insufficient_history" and item["history_days"] == 2
    assert item["predicted_demand"] is None and item["mae"] is None
    assert "insufficient_history" in item["risks"]
    assert report["summary"]["eligible_count"] == 5 and report["summary"]["insufficient_count"] == 1


@pytest.mark.parametrize("values", [[-1, 10, 10], ["", 10, 10], ["NaN", 10, 10], [1.5, 10, 10]])
def test_invalid_sales_import_rejected_atomically(client, database, values):
    product_id = product(client)
    content = csv_history(values)
    result = upload(client, content, options(product_id)).json()
    assert result["can_commit"] is False and result["rejected_rows"] == 1
    assert upload(client, content, options(product_id), action="commit", preview_token=result["preview_token"], confirm="IMPORT SAQTA").status_code == 422
    with database() as db:
        assert db.scalar(select(func.count()).select_from(ForecastObservation)) == 0
        assert db.scalar(select(func.count()).select_from(ImportBatch)) == 0


def test_repeat_and_conflicting_observation_imports_are_safe(client):
    product_id = product(client)
    content = csv_history([10, 20, 30])
    commit(client, content, options(product_id))
    repeated = upload(client, content, options(product_id)).json()
    assert repeated["duplicate_rows"] == 3 and repeated["valid_rows"] == 0 and not repeated["can_commit"]
    result = upload(client, content, options(product_id), action="commit", preview_token=repeated["preview_token"], confirm="IMPORT SAQTA").json()
    assert result["imported_count"] == 0
    conflict = upload(client, csv_history([11, 20, 30]), options(product_id)).json()
    assert conflict["rejected_rows"] == 1 and conflict["can_commit"] is False
    assert "уже сохранён другой" in conflict["errors"][0]["message"]


def test_observation_inspect_suggests_sales_mapping_and_rejects_bad_file(client):
    content = csv_history([0, 1, 2], extra_header=",Остаток", extra_values=[",", ",", ","])
    inspected = client.post("/api/imports/inspect", files={"file": ("sales.csv", content)}, data={"source_origin": "demo"}).json()
    assert inspected["suggested_mode"] == "observations"
    assert inspected["suggested_observation_mapping"]["sold"] == "Продано"
    assert client.post("/api/imports/inspect", files={"file": ("broken.xlsx", b"not a zip")}, data={"source_origin": "demo"}).status_code == 422


def test_production_only_date_not_added_as_zero_sales(client, database):
    product_id = product(client)
    commit(client, csv_history([10, 10, 10], today_local() - timedelta(days=4)), options(product_id))
    client.post("/api/records", json={"kind": "production", "product_id": product_id, "location_id": 1,
                                    "date": today_local().isoformat(), "quantity": 50})
    with database() as db:
        history = sales_history_rows(db, product_id, 1)
        assert len(history) == 3 and all(row["sales"] == 10 for row in history)
    response = client.get(f"/api/backtest?product_id={product_id}&location_id=1").json()
    assert response["history_days"] == 3 and response["metrics"]["mae"] is None


def test_legacy_detailed_forecast_handles_unknown_stock_without_creating_zero_snapshot(client, database):
    product_id = product(client)
    commit(client, csv_history([10, 10, 10]), options(product_id))
    response = client.post("/api/forecasts", json={"product_id": product_id, "location_id": 1,
        "target_date": (today_local() + timedelta(days=1)).isoformat(), "horizon_days": 1})
    assert response.status_code == 201, response.text
    assert response.json()["existing_inventory"] is None and response.json()["recommended_production"] is None
    with database() as db:
        assert db.scalar(select(InventorySnapshot).where(InventorySnapshot.product_id == product_id)) is None


def test_real_source_rejected_in_demo_before_observation_upload(client):
    content = csv_history([10, 10, 10])
    config = options(1, source_origin="real")
    assert upload(client, content, config).status_code == 409


def test_future_observations_and_unknown_catalog_rejected(client):
    assert upload(client, csv_history([10], today_local() + timedelta(days=1)), options(1)).json()["rejected_rows"] == 1
    assert upload(client, csv_history([10]), options(99999)).json()["can_commit"] is False


def test_imported_zero_sales_backtest_keeps_observations_without_invented_metrics(client):
    product_id = product(client)
    commit(client, csv_history([0] * 21), options(product_id))
    report = client.get(f"/api/backtest?product_id={product_id}&location_id=1").json()
    assert report["history_days"] == 21 and report["evaluation_points"] == 7
    assert report["metrics"] == {"mae": 0, "wape_percent": None}
    assert report["naive_metrics"] == {"mae": 0, "wape_percent": None}
    assert all(point["training_end_date"] < point["date"] for point in report["points"])


def test_observation_preview_reports_missing_optional_values_and_same_file_duplicates(client):
    product_id = product(client)
    day = today_local().isoformat()
    content = f"Дата,Продано,Остаток\n{day},0,\n{day},0,\n".encode()
    result = upload(client, content, options(product_id, column_mapping={"date": "Дата", "sold": "Продано", "remaining": "Остаток"})).json()
    assert result["valid_rows"] == result["duplicate_rows"] == 1
    assert result["missing_values"] == {"remaining": 2}
    assert result["can_commit"] is True
    conflicting = f"Дата,Продано\n{day},0\n{day},1\n".encode()
    result = upload(client, conflicting, options(product_id)).json()
    assert result["rejected_rows"] == 1 and not result["can_commit"]


def test_large_volatility_and_unknown_cost_remain_conditional(client):
    product_id = product(client)
    config = options(product_id, column_mapping={"date": "Дата", "sold": "Продано", "remaining": "Остаток"})
    commit(client, csv_history([0, 100, 0, 100], extra_header=",Остаток", extra_values=[",500"] * 4), config)
    item = next(item for item in run(client, location_id=1).json()["items"] if item["product_id"] == product_id)
    assert "volatile" in item["risks"] and "surplus" in item["risks"]
    assert item["potential_writeoff_cost_kzt"] is None
    assert item["data_quality"]["explicit_zero_days"] == 2
    assert item["data_quality"]["inventory_known"] is True


def test_formula_cells_and_invalid_units_do_not_enter_observations(client):
    product_id = product(client)
    result = upload(client, csv_history(["=1+1"]), options(product_id)).json()
    assert not result["can_commit"] and "Формулы не исполняются" in result["errors"][0]["message"]
    result = upload(client, csv_history([10], extra_header=",Единица", extra_values=[",кг"]),
        options(product_id, column_mapping={"date": "Дата", "sold": "Продано", "unit": "Единица"})).json()
    assert not result["can_commit"] and "Единица не совпадает" in result["errors"][0]["message"]


def test_imported_remaining_excludes_reservations_and_surfaces_contradictions(client, database):
    product_id = product(client)
    config = options(product_id, column_mapping={"date": "Дата", "sold": "Продано", "remaining": "Остаток"})
    commit(client, csv_history([10, 10, 10], extra_header=",Остаток", extra_values=[",20"] * 3), config)
    with database() as db:
        stock = InventorySnapshot(product_id=product_id, location_id=1, on_hand=20, reserved=5)
        db.add(stock)
        db.commit()
    item = next(item for item in run(client, location_id=1).json()["items"] if item["product_id"] == product_id)
    assert item["available_inventory"] == 15 and item["inventory_source"]["reserved_excluded"] == 5
    with database() as db:
        stock = db.scalar(select(InventorySnapshot).where(InventorySnapshot.product_id == product_id))
        stock.on_hand, stock.reserved = 30, 21
        db.commit()
    item = next(item for item in run(client, location_id=1).json()["items"] if item["product_id"] == product_id)
    assert item["available_inventory"] is None and item["recommended_production"] is None
    assert item["inventory_source"]["source"] == "conflicting_snapshot"
