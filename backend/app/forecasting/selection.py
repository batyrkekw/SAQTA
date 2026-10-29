"""Chronological selection with a separate, untouched final holdout.

A tiny ridge model uses only lagged observed sales and calendar weekdays. NumPy
is already required by pandas; no GPU or remote prediction API is necessary.
"""

from datetime import timedelta
from math import ceil, sqrt, sin, cos, pi
from statistics import mean
import numpy as np
from app.forecasting.baseline import _observed_history, predict

BASELINES = ["last", "mean7", "seasonal", "weighted"]


def features(history, day):
    values = [r["sales"] for r in history]
    return [
        values[-1],
        mean(values[-7:]),
        mean(values[-28:]),
        sin(2 * pi * day.weekday() / 7),
        cos(2 * pi * day.weekday() / 7),
    ]


def estimate(method, history, day):
    if method == "last":
        return float(history[-1]["sales"])
    if method == "mean7":
        return mean(row["sales"] for row in history[-7:])
    if method == "seasonal":
        rows = [r for r in history if r["date"].weekday() == day.weekday()]
        return float(rows[-1]["sales"]) if rows else estimate("mean7", history, day)
    if method == "weighted":
        return predict(history, day)
    x = np.array([features(history[:i], history[i]["date"]) for i in range(28, len(history))], dtype=float)
    y = np.array([r["sales"] for r in history[28:]], dtype=float)
    center, scale = x.mean(axis=0), x.std(axis=0)
    scale[scale == 0] = 1
    z = np.column_stack([np.ones(len(x)), (x - center) / scale])
    penalty = np.eye(z.shape[1]) * 10
    penalty[0, 0] = 0
    weights = np.linalg.solve(z.T @ z + penalty, z.T @ y)
    return max(0.0, float(np.r_[1, (np.array(features(history, day)) - center) / scale] @ weights))


def score(method, rows, start, end):
    points = []
    for i in range(start, end):
        predicted = estimate(method, rows[:i], rows[i]["date"])
        points.append(
            {
                "date": rows[i]["date"].isoformat(),
                "actual": rows[i]["sales"],
                "predicted": round(predicted, 3),
                "training_end": rows[i - 1]["date"].isoformat(),
            }
        )
    errors = [abs(p["actual"] - p["predicted"]) for p in points]
    actual = sum(p["actual"] for p in points)
    return {
        "mae": round(mean(errors), 3),
        "rmse": round(sqrt(mean(e * e for e in errors)), 3),
        "wape": round(sum(errors) / actual * 100, 3) if actual else None,
        "points": points,
    }


def select_forecast(history, target, horizon, inventory, buffer=10):
    rows = _observed_history(history, target)
    result = {
        "status": "insufficient",
        "model": None,
        "metrics": None,
        "comparison": [],
        "daily": [],
        "observations": len(rows),
        "confidence_interval": None,
    }
    if len(rows) < 3:
        return result
    chosen = "mean7"
    if len(rows) >= 28:
        candidates = BASELINES + (["ridge"] if len(rows) >= 98 else [])
        validation_start, validation_end = max(14, len(rows) - 21), len(rows) - 7
        for method in candidates:
            metrics = score(method, rows, validation_start, validation_end)
            result["comparison"].append(
                {"model": method, "mae": metrics["mae"], "rmse": metrics["rmse"], "wape": metrics["wape"]}
            )
        chosen = min(result["comparison"], key=lambda item: item["mae"])["model"]
        result["metrics"] = score(chosen, rows, len(rows) - 7, len(rows))
        result["validation_period"] = [
            rows[validation_start]["date"].isoformat(),
            rows[validation_end - 1]["date"].isoformat(),
        ]
        result["holdout_period"] = [rows[-7]["date"].isoformat(), rows[-1]["date"].isoformat()]
    remaining = inventory
    for offset in range(horizon):
        day = target + timedelta(days=offset)
        demand = max(0, round(estimate(chosen, rows, day)))
        production = max(0, ceil(demand * (1 + buffer / 100)) - remaining) if remaining is not None else None
        result["daily"].append(
            {
                "date": day.isoformat(),
                "demand": demand,
                "production": production,
                "surplus": max(0, remaining + production - demand) if remaining is not None else None,
            }
        )
        remaining = max(0, remaining - demand) if remaining is not None else None
    result.update(
        status="ready",
        model=chosen,
        demand=sum(d["demand"] for d in result["daily"]),
        production=sum(d["production"] for d in result["daily"]) if inventory is not None else None,
    )
    return result
