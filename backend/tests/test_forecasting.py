from datetime import date, timedelta

import pytest

from app.forecasting.baseline import InsufficientHistory, evaluate, generate, predict, recommend


def history(count=35):
    start = date(2026, 1, 1)
    return [{"date": start + timedelta(days=i), "sales": 80 if (start + timedelta(days=i)).weekday() >= 5 else 50, "production": 90, "waste": 0} for i in range(count)]


def test_baseline_formula_and_weekday_effect():
    rows = history()
    result = predict(rows, date(2026, 2, 7))
    assert result == pytest.approx(0.6 * (5 * 50 + 2 * 80) / 7 + 0.4 * 80)


def test_future_data_cannot_leak():
    rows = history()
    target = date(2026, 2, 5)
    result = predict(rows, target)
    rows.append({"date": target, "sales": 99999})
    rows.append({"date": target + timedelta(days=1), "sales": 99999})
    assert predict(rows, target) == result


def test_insufficient_history():
    with pytest.raises(InsufficientHistory):
        predict(history(2), date(2026, 2, 1))


def test_missing_weekday_falls_back_to_recent_mean():
    assert predict(history(3), date(2026, 1, 7)) == 60


def test_production_recommendation_uses_buffer_and_inventory():
    assert recommend(100, 20, 10) == 90


def test_large_stock_does_not_produce_negative():
    assert recommend(100, 500, 10) == 0
    with pytest.raises(ValueError):
        recommend(100, -1, 10)


def test_mae_requires_real_holdout_and_excludes_target():
    assert evaluate(history(20)) == (None, 0)
    mae, points = evaluate(history(35))
    assert points == 7 and mae is not None and mae > 0


def test_constant_series_mae_zero():
    rows = [{"date": date(2026, 1, 1) + timedelta(days=i), "sales": 50} for i in range(30)]
    assert evaluate(rows) == (0, 7)


def test_horizon_inventory_is_not_reused_each_day():
    rows = [{"date": date(2026, 1, 1) + timedelta(days=i), "sales": 50} for i in range(30)]
    forecast = generate(rows, date(2026, 2, 1), 3, 70, 0)
    assert forecast["predicted_demand"] == 150
    assert [r["recommended_production"] for r in forecast["daily"]] == [0, 30, 50]
    assert forecast["recommended_production"] == 80


def test_invalid_horizon():
    with pytest.raises(ValueError):
        generate(history(), date(2026, 2, 1), 15, 0, 10)
