"""Explainable chronological baseline; no database or API dependencies."""
from datetime import date, timedelta
from statistics import mean


class InsufficientHistory(ValueError):
    pass


def predict(history: list[dict], target: date) -> float:
    observed = sorted((r for r in history if r["date"] < target), key=lambda r: r["date"])
    if len(observed) < 3:
        raise InsufficientHistory("Нужно минимум 3 дня истории продаж и производства")
    recent = mean(r["sales"] for r in observed[-7:])
    weekdays = [r["sales"] for r in observed if r["date"].weekday() == target.weekday()][-4:]
    return max(0.0, 0.6 * recent + 0.4 * mean(weekdays)) if weekdays else max(0.0, recent)


def recommend(demand: int, existing_inventory: int, buffer_percent: int) -> int:
    if min(demand, existing_inventory, buffer_percent) < 0 or buffer_percent > 100:
        raise ValueError("Некорректные параметры рекомендации")
    return max(0, (demand * (100 + buffer_percent) + 99) // 100 - existing_inventory)


def evaluate(history: list[dict]) -> tuple[float | None, int]:
    """Rolling-origin last 7 observations, minimum 14 strictly prior training days."""
    ordered = sorted(history, key=lambda r: r["date"])
    if len(ordered) < 21:
        return None, 0
    errors = []
    for index in range(max(14, len(ordered) - 7), len(ordered)):
        row = ordered[index]
        errors.append(abs(predict(ordered[:index], row["date"]) - row["sales"]))
    return round(mean(errors), 2), len(errors)


def generate(history: list[dict], target: date, horizon: int, inventory: int, buffer_percent: int) -> dict:
    if not 1 <= horizon <= 14:
        raise ValueError("Горизонт прогноза: от 1 до 14 дней")
    observed = [r for r in history if r["date"] < target]
    daily = []
    remaining = inventory
    for offset in range(horizon):
        forecast_date = target + timedelta(days=offset)
        demand = round(predict(observed, forecast_date))
        production = recommend(demand, remaining, buffer_percent)
        daily.append({"date": forecast_date.isoformat(), "predicted_demand": demand, "recommended_production": production})
        # Only existing stock carries forward. Forecast surplus is not assumed to remain eligible tomorrow.
        remaining = max(0, remaining - demand)
    total = sum(r["predicted_demand"] for r in daily)
    production = sum(r["recommended_production"] for r in daily)
    mae, points = evaluate(observed)
    expected_surplus = max(0, inventory + production - total)
    return {
        "predicted_demand": total,
        "recommended_production": production,
        "existing_inventory": inventory,
        "expected_surplus": expected_surplus,
        "stockout_risk": "повышенный" if buffer_percent == 0 else "снижен буфером, но не исключён",
        "method": "recent_weekday_baseline_v1",
        "explanation": f"60% среднего объёма последних 7 наблюдаемых дней + 40% среднего за последние 4 совпадающих дня недели. При отсутствии совпадений используется среднее последних 7 дней. История: {len(observed)} дней. Буфер: {buffer_percent}%. Из потребности вычтено {inventory} доступных изделий; резерв SAQTA Save исключён. Прогноз не гарантирует спрос. Остатки требуют проверки свежести.",
        "mae": mae,
        "evaluation_points": points,
        "daily": daily,
    }
