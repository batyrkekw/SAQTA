"""Explainable chronological baseline; no database or API dependencies."""
from datetime import date, timedelta
from numbers import Real
from statistics import mean


class InsufficientHistory(ValueError):
    pass


def _observed_history(history: list[dict], cutoff: date | None = None, inclusive: bool = False) -> list[dict]:
    """Keep observed dates only; never interpolate gaps or infer calendar-day observations."""
    observed = []
    seen = set()
    for row in history:
        day = row.get("date")
        if type(day) is not date:
            raise ValueError("История должна содержать корректные даты без времени")
        if cutoff is not None and (day > cutoff if inclusive else day >= cutoff):
            continue
        sales = row.get("sales")
        if isinstance(sales, bool) or not isinstance(sales, Real) or not 0 <= sales < float("inf"):
            raise ValueError("Продажи в истории должны быть конечным неотрицательным числом")
        if day in seen:
            raise ValueError("История должна быть агрегирована до одной строки на продукт, точку и дату")
        seen.add(day)
        observed.append(row)
    return sorted(observed, key=lambda row: row["date"])


def prediction_components(history: list[dict], target: date) -> dict:
    """Actual inputs and coefficients used by the unchanged statistical baseline."""
    observed = _observed_history(history, target)
    if len(observed) < 3:
        raise InsufficientHistory("Нужно минимум 3 наблюдаемых дня продаж; производство без продаж не заменяет наблюдение")
    recent_rows = observed[-7:]
    weekday_rows = [row for row in observed if row["date"].weekday() == target.weekday()][-4:]
    recent = mean(row["sales"] for row in recent_rows)
    weekday_mean = mean(row["sales"] for row in weekday_rows) if weekday_rows else None
    recent_weight, weekday_weight = (0.6, 0.4) if weekday_rows else (1.0, 0.0)
    weighted = max(0.0, recent_weight * recent + weekday_weight * weekday_mean) if weekday_mean is not None else max(0.0, recent)
    rounded = round(weighted)
    formula = f"{recent_weight:g} × {recent:.2f}"
    if weekday_mean is not None:
        formula += f" + {weekday_weight:g} × {weekday_mean:.2f}"
    formula += f" = {weighted:.2f}; округление до целых = {rounded} шт."
    return {
        "date": target.isoformat(),
        "recent_sales": [{"date": row["date"].isoformat(), "sales": row["sales"]} for row in recent_rows],
        "recent_mean": recent,
        "same_weekday_sales": [{"date": row["date"].isoformat(), "sales": row["sales"]} for row in weekday_rows],
        "same_weekday_mean": weekday_mean,
        "recent_weight": recent_weight,
        "same_weekday_weight": weekday_weight,
        "weekday_difference": weekday_mean - recent if weekday_mean is not None else None,
        "weighted_demand": weighted,
        "predicted_demand": rounded,
        "demand_formula": formula,
    }


def predict(history: list[dict], target: date) -> float:
    return prediction_components(history, target)["weighted_demand"]


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


def backtest(history: list[dict], min_train_days: int = 14, test_days: int = 7, end_date: date | None = None) -> dict:
    """Rolling-origin evaluation, comparing both models on the same held-out observations.

    A test observation enters training only after it has been scored. Demand is evaluated
    before final integer rounding, preserving the existing forecast MAE definition.
    """
    if not 14 <= min_train_days <= 365 or not 1 <= test_days <= 30:
        raise ValueError("Для проверки нужно 14–365 обучающих наблюдений и 1–30 тестовых наблюдений")
    observed = _observed_history(history, end_date, inclusive=True)
    required = min_train_days + test_days
    requirements = [
        "Обязательные поля: дата, товар, точка и фактическое количество продаж в одинаковых единицах.",
        f"Нужно минимум {required} уникальных наблюдаемых дат: {min_train_days} для первоначальной истории и {test_days} для проверки.",
        "Повторные строки одного товара и точки за день сначала суммируются; пропущенные календарные дни не дорисовываются.",
        "Для надёжной оценки нужны более длинная история, проверка полноты учёта и данные реальной пекарни.",
    ]
    result = {
        "status": "insufficient_history", "method": "recent_weekday_baseline_v1", "naive_method": "last_observed_sales",
        "history_days": len(observed), "min_train_days": min_train_days, "requested_test_days": test_days,
        "evaluation_points": 0, "period": {"start_date": None, "end_date": None},
        "metrics": {"mae": None, "wape_percent": None}, "naive_metrics": {"mae": None, "wape_percent": None},
        "mae_improvement_percent": None, "points": [], "warnings": [], "requirements": requirements,
    }
    if len(observed) < required:
        result["warnings"].append(f"Недостаточно данных для оценки точности: доступно {len(observed)} наблюдений, требуется {required}. Метрики не рассчитаны.")
        return result
    start_index = len(observed) - test_days
    errors, naive_errors, actuals = [], [], []
    for index in range(start_index, len(observed)):
        row, training = observed[index], observed[:index]
        predicted = predict(training, row["date"])
        naive = training[-1]["sales"]
        error, naive_error = abs(predicted - row["sales"]), abs(naive - row["sales"])
        errors.append(error)
        naive_errors.append(naive_error)
        actuals.append(row["sales"])
        result["points"].append({
            "date": row["date"].isoformat(), "actual": row["sales"], "predicted": round(predicted, 4),
            "naive_predicted": naive, "absolute_error": round(error, 4), "naive_absolute_error": round(naive_error, 4),
            "training_observations": len(training), "training_end_date": training[-1]["date"].isoformat(),
        })
    total_actual = sum(actuals)
    mae, naive_mae = mean(errors), mean(naive_errors)
    result.update(
        status="ok", evaluation_points=test_days,
        period={"start_date": observed[start_index]["date"].isoformat(), "end_date": observed[-1]["date"].isoformat()},
        metrics={"mae": round(mae, 2), "wape_percent": round(sum(errors) / total_actual * 100, 2) if total_actual else None},
        naive_metrics={"mae": round(naive_mae, 2), "wape_percent": round(sum(naive_errors) / total_actual * 100, 2) if total_actual else None},
        mae_improvement_percent=round((naive_mae - mae) / naive_mae * 100, 2) if naive_mae else None,
    )
    if total_actual == 0:
        result["warnings"].append("WAPE не определена: сумма фактических продаж в тестовом периоде равна нулю. MAE рассчитана отдельно.")
    if naive_mae == 0:
        result["warnings"].append("Процент улучшения MAE не определён: ошибка простого baseline равна нулю.")
    result["warnings"].append(f"Проверено только {test_days} наблюдений. Это ограниченная историческая проверка, а не гарантия будущей точности или статистической значимости.")
    result["warnings"].append("Проверяется ошибка статистического спроса до округления до целых изделий. Простое сравнение — продажи последнего ранее наблюдавшегося дня; пропуски не заполняются.")
    return result


def generate(history: list[dict], target: date, horizon: int, inventory: int | None, buffer_percent: int) -> dict:
    if not 1 <= horizon <= 14:
        raise ValueError("Горизонт прогноза: от 1 до 14 дней")
    observed = _observed_history(history, target)
    daily = []
    days_explained = []
    remaining = inventory
    for offset in range(horizon):
        forecast_date = target + timedelta(days=offset)
        components = prediction_components(observed, forecast_date)
        demand = components["predicted_demand"]
        production = recommend(demand, remaining, buffer_percent) if remaining is not None else None
        buffered = (demand * (100 + buffer_percent) + 99) // 100
        components.update(
            available_inventory=remaining, safety_buffer_percent=buffer_percent, buffered_demand=buffered,
            recommended_production=production,
            production_formula=f"max(0, ceil({demand} × (1 + {buffer_percent} / 100)) − {remaining}) = max(0, {buffered} − {remaining}) = {production} шт." if remaining is not None else "Остаток не подтверждён: объём производства не рассчитан. Целевой спрос с буфером показан отдельно.",
        )
        days_explained.append(components)
        daily.append({"date": forecast_date.isoformat(), "predicted_demand": demand, "recommended_production": production})
        # Only existing stock carries forward. Forecast surplus is not assumed to remain eligible tomorrow.
        remaining = max(0, remaining - demand) if remaining is not None else None
    total = sum(r["predicted_demand"] for r in daily)
    production = sum(r["recommended_production"] for r in daily) if inventory is not None else None
    mae, points = evaluate(observed)
    expected_surplus = max(0, inventory + production - total) if inventory is not None else None
    if inventory is None:
        explanation = f"Прогноз спроса — {total} шт. Остаток неизвестен, поэтому рекомендуемое производство, фактический избыток и дефицит не рассчитаны. Загрузите подтверждённый остаток."
    elif horizon == 1:
        first = days_explained[0]
        if first["same_weekday_mean"] is None:
            comparison = "Совпадающих дней недели пока нет; использовано только недавнее среднее."
        elif first["weekday_difference"] > 0:
            comparison = f"Среднее в аналогичные дни недели ({first['same_weekday_mean']:.1f}) выше недавнего среднего ({first['recent_mean']:.1f})."
        elif first["weekday_difference"] < 0:
            comparison = f"Среднее в аналогичные дни недели ({first['same_weekday_mean']:.1f}) ниже недавнего среднего ({first['recent_mean']:.1f})."
        else:
            comparison = f"Среднее в аналогичные дни недели совпадает с недавним средним ({first['recent_mean']:.1f})."
        explanation = f"Рекомендуем произвести {production} шт.: прогноз спроса {total}, с буфером {buffer_percent}% — {first['buffered_demand']}; учтён доступный остаток {inventory}. {comparison}"
    else:
        explanation = f"За {horizon} дней прогнозируется спрос {total} шт.; суммарная рекомендация — {production} шт. Буфер {buffer_percent}% рассчитан для каждого дня; доступный остаток {inventory} шт. вычитается последовательно и не используется повторно."
    limitations = [
        "Прогноз не гарантирует спрос; он использует только прошлые продажи без погоды, праздников и промо-факторов.",
        "Недавнее среднее берётся по последним 7 наблюдаемым дням, а не обязательно по 7 календарным дням; совпадающие дни недели — последние 4 доступных наблюдения.",
        "Пропущенные дни не добавляются и не трактуются как 0 продаж. Нулевые продажи учитываются только при явном наблюдении 0 в импортированной истории.",
        "Текущий остаток исключает резерв SAQTA Save. Рекомендация предполагает его пригодность к продаже; свежесть и срок хранения необходимо проверить.",
        "Будущие продажи не подставляются в историю. Для нескольких дней переносится только неиспользованный текущий остаток; прогнозный излишек новой выпечки не считается пригодным к переносу автоматически.",
    ]
    return {
        "predicted_demand": total,
        "recommended_production": production,
        "existing_inventory": inventory,
        "expected_surplus": expected_surplus,
        "stockout_risk": "не определён: остаток неизвестен" if inventory is None else "повышенный" if buffer_percent == 0 else "снижен буфером, но не исключён",
        "method": "recent_weekday_baseline_v1",
        "explanation": explanation + " Расчёт: 60% недавнего среднего + 40% аналогичных дней недели, при отсутствии совпадений — только недавнее среднее. Прогноз не гарантирует спрос.",
        "explanation_components": {"history_days": len(observed), "safety_buffer_percent": buffer_percent, "existing_inventory": inventory, "days": days_explained, "limitations": limitations},
        "mae": mae,
        "evaluation_points": points,
        "daily": daily,
    }
