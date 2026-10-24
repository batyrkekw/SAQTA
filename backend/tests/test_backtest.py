from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.core.config import today_local
from app.forecasting.baseline import backtest, evaluate, generate, prediction_components
from app.models import ApplicationSettings


def daily(sales, start=date(2026, 1, 1)):
    return [{"date": start + timedelta(days=index), "sales": quantity} for index, quantity in enumerate(sales)]


def test_components_reveal_exact_samples_weights_and_calculation():
    rows = daily([10] * 14 + [30] * 7)
    target = rows[-1]["date"] + timedelta(days=1)
    component = prediction_components(rows, target)
    assert component["recent_mean"] == 30
    assert len(component["recent_sales"]) == 7
    assert [row["date"] for row in component["recent_sales"]] == [row["date"].isoformat() for row in rows[-7:]]
    assert [row["sales"] for row in component["same_weekday_sales"]] == [10, 10, 30]
    assert component["same_weekday_mean"] == pytest.approx(50 / 3)
    assert component["recent_weight"] == 0.6 and component["same_weekday_weight"] == 0.4
    assert component["weekday_difference"] == pytest.approx(50 / 3 - 30)
    assert component["weighted_demand"] == pytest.approx(0.6 * 30 + 0.4 * 50 / 3)
    assert component["predicted_demand"] == 25


def test_components_omit_future_and_exact_target_sales():
    rows = daily([10] * 21)
    target = rows[-1]["date"] + timedelta(days=1)
    expected = prediction_components(rows, target)
    poisoned = rows + [{"date": target, "sales": 999999}, {"date": target + timedelta(days=1), "sales": 999999}]
    assert prediction_components(poisoned, target) == expected


def test_components_fallback_has_no_fabricated_weekday_mean():
    rows = daily([10, 20, 30])
    component = prediction_components(rows, date(2026, 1, 7))
    assert component["same_weekday_sales"] == []
    assert component["same_weekday_mean"] is None and component["weekday_difference"] is None
    assert component["recent_weight"] == 1 and component["same_weekday_weight"] == 0
    assert component["weighted_demand"] == 20


def test_forecast_recommendation_explains_inventory_and_exact_integer_buffer():
    rows = daily([100] * 21)
    result = generate(rows, date(2026, 2, 1), 1, inventory=20, buffer_percent=10)
    components = result["explanation_components"]
    day = components["days"][0]
    assert components["history_days"] == 21 and components["existing_inventory"] == 20
    assert day["available_inventory"] == 20 and day["buffered_demand"] == 110
    assert day["recommended_production"] == 90 == result["recommended_production"]
    assert "90" in result["explanation"] and "20" in result["explanation"]
    assert "110 − 20" in day["production_formula"]
    assert any("как 0" in limitation for limitation in components["limitations"])


def test_multiday_explanation_matches_sequential_inventory_use():
    result = generate(daily([50] * 21), date(2026, 2, 1), 3, inventory=70, buffer_percent=0)
    explained = result["explanation_components"]["days"]
    assert [row["available_inventory"] for row in explained] == [70, 20, 0]
    assert [row["recommended_production"] for row in explained] == [0, 30, 50]
    assert sum(row["recommended_production"] for row in explained) == result["recommended_production"] == 80


def test_backtest_known_mae_wape_and_naive_values():
    result = backtest(daily([10] * 14 + [20]), min_train_days=14, test_days=1)
    assert result["status"] == "ok" and result["evaluation_points"] == 1
    assert result["metrics"] == {"mae": 10, "wape_percent": 50}
    assert result["naive_metrics"] == {"mae": 10, "wape_percent": 50}
    assert result["mae_improvement_percent"] == 0
    point = result["points"][0]
    assert point["training_observations"] == 14
    assert point["training_end_date"] < point["date"]
    assert point["predicted"] == 10 and point["naive_predicted"] == 10 and point["actual"] == 20


def test_backtest_rolling_origin_never_uses_current_observation():
    rows = daily([10] * 14 + [100, 10])
    result = backtest(rows, min_train_days=14, test_days=2)
    first, second = result["points"]
    assert first["predicted"] == 10 and first["naive_predicted"] == 10
    # The first test actual becomes available only for the second test forecast.
    assert second["predicted"] == pytest.approx(17.7143)
    assert second["naive_predicted"] == 100
    assert [point["training_observations"] for point in result["points"]] == [14, 15]
    assert all(point["training_end_date"] < point["date"] for point in result["points"])


def test_backtest_cutoff_blocks_future_leakage_in_metrics_and_points():
    rows = daily([10 + index for index in range(21)])
    cutoff = rows[-1]["date"]
    expected = backtest(rows, end_date=cutoff)
    poisoned = rows + [{"date": cutoff + timedelta(days=1), "sales": 999999}]
    assert backtest(poisoned, end_date=cutoff) == expected


def test_backtest_preserves_existing_forecast_mae_definition():
    rows = daily([10 + index % 7 * 3 for index in range(35)])
    mae, count = evaluate(rows)
    result = backtest(rows)
    assert result["metrics"]["mae"] == mae
    assert result["evaluation_points"] == count == 7


def test_backtest_missing_dates_remain_missing_not_interpolated():
    rows = daily([10] * 42)[::2]
    result = backtest(rows)
    assert result["history_days"] == 21
    assert result["evaluation_points"] == 7
    assert [point["date"] for point in result["points"]] == [row["date"].isoformat() for row in rows[-7:]]


def test_insufficient_history_has_null_metrics_not_fabricated_accuracy():
    for rows in ([], daily([10] * 20)):
        result = backtest(rows)
        assert result["status"] == "insufficient_history"
        assert result["evaluation_points"] == 0 and result["points"] == []
        assert result["metrics"] == {"mae": None, "wape_percent": None}
        assert result["naive_metrics"] == {"mae": None, "wape_percent": None}
        assert result["period"] == {"start_date": None, "end_date": None}
        assert result["warnings"] and result["requirements"]


def test_zero_actual_denominator_keeps_mae_but_wape_and_improvement_undefined():
    result = backtest(daily([0] * 21))
    assert result["status"] == "ok"
    assert result["metrics"] == {"mae": 0, "wape_percent": None}
    assert result["naive_metrics"] == {"mae": 0, "wape_percent": None}
    assert result["mae_improvement_percent"] is None
    assert any("сумма фактических" in warning for warning in result["warnings"])


def test_backtest_does_not_claim_improvement_when_naive_is_better():
    result = backtest(daily(list(range(1, 22))))
    assert result["metrics"]["mae"] > result["naive_metrics"]["mae"]
    assert result["mae_improvement_percent"] < 0


@pytest.mark.parametrize("kwargs", [{"min_train_days": 13}, {"min_train_days": 366}, {"test_days": 0}, {"test_days": 31}])
def test_backtest_bounds(kwargs):
    with pytest.raises(ValueError):
        backtest(daily([10] * 50), **kwargs)


@pytest.mark.parametrize("rows", [daily([10] * 21) + daily([20]), [{"date": date(2026, 1, 1), "sales": -1}], [{"date": date(2026, 1, 1), "sales": float("nan")}], [{"date": "2026-01-01", "sales": 10}]])
def test_backtest_rejects_invalid_or_duplicate_observations(rows):
    with pytest.raises(ValueError):
        backtest(rows)


def test_backtest_api_uses_persisted_synthetic_source_and_chronological_period(client):
    response = client.get("/api/backtest?product_id=1&location_id=1")
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "ok" and result["evaluation_points"] == 7
    assert result["history_days"] == 42 and result["demo_data"] is True and result["data_source"] == "synthetic"
    assert result["observation_source"]["days_with_sales_records"] == 42
    assert result["observation_source"]["days_without_sales_records"] == 0
    assert result["observation_source"]["missing_calendar_days"] == 0
    assert any("SYNTHETIC / DEMO" in warning for warning in result["warnings"])
    assert all(point["training_end_date"] < point["date"] for point in result["points"])


def test_backtest_api_empty_product_and_cutoff_returns_explanation(client):
    product = client.post("/api/products", json={"name": "Без истории", "category": "Хлеб", "price_kzt": 500}).json()
    response = client.get(f"/api/backtest?product_id={product['id']}&location_id=1")
    assert response.status_code == 200 and response.json()["status"] == "insufficient_history"
    assert response.json()["metrics"]["mae"] is None
    cutoff = today_local() - timedelta(days=22)
    result = client.get(f"/api/backtest?product_id=1&location_id=1&end_date={cutoff}").json()
    assert result["history_days"] == 20 and result["status"] == "insufficient_history"


def test_backtest_api_validation_and_missing_entities(client):
    assert client.get("/api/backtest?product_id=1&location_id=1&test_days=31").status_code == 422
    assert client.get("/api/backtest?product_id=1&location_id=1&min_train_days=13").status_code == 422
    future = today_local() + timedelta(days=1)
    assert client.get(f"/api/backtest?product_id=1&location_id=1&end_date={future}").status_code == 422
    assert client.get("/api/backtest?product_id=99999&location_id=1").status_code == 404


def test_backtest_api_exposes_production_without_sales_ambiguity(client):
    product = client.post("/api/products", json={"name": "Нулевая история", "category": "Хлеб", "price_kzt": 500}).json()
    response = client.post("/api/records", json={"kind": "production", "product_id": product["id"], "location_id": 1, "date": today_local().isoformat(), "quantity": 10})
    assert response.status_code == 201
    result = client.get(f"/api/backtest?product_id={product['id']}&location_id=1").json()
    assert result["observation_source"]["days_without_sales_records"] == 1
    assert any("без записей продаж" in warning for warning in result["warnings"])


def test_backtest_api_real_source_is_not_misrepresented_as_verified_file(client, database):
    with database() as session:
        settings = session.scalar(select(ApplicationSettings))
        settings.workspace_mode = "real"
        session.commit()
    result = client.get("/api/backtest?product_id=1&location_id=1").json()
    assert result["demo_data"] is False and result["data_source"] == "real"
    assert any("не подтверждает происхождение" in warning for warning in result["warnings"])


def test_new_forecast_response_contains_persisted_explanation_components(client):
    response = client.post("/api/forecasts", json={"product_id": 1, "location_id": 1, "target_date": (today_local() + timedelta(days=1)).isoformat(), "horizon_days": 2})
    assert response.status_code == 201
    forecast = response.json()
    explained = forecast["explanation_components"]
    assert len(explained["days"]) == 2
    assert explained["existing_inventory"] == forecast["existing_inventory"]
    assert sum(row["recommended_production"] for row in explained["days"]) == forecast["recommended_production"]
    assert all(sample["date"] < forecast["target_date"] for row in explained["days"] for sample in row["recent_sales"])
    saved = client.get("/api/forecasts").json()[0]
    assert saved["explanation_components"] == explained
