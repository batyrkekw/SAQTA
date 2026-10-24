"""Assortment demand from observed sales; stock and waste estimates stay conditional."""
from datetime import timedelta
from statistics import mean, pstdev

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import now_utc, today_local
from app.forecasting.baseline import InsufficientHistory, generate
from app.models import ApplicationSettings, BakeryLocation, ForecastObservation, InventorySnapshot, Product, ProductionRecord
from app.services.inventory import sales_history_rows
from app.services.workspace import is_demo


def known_inventory(db: Session, product_id: int, location_id: int) -> tuple[int | None, dict]:
    stock = db.scalar(select(InventorySnapshot).where(InventorySnapshot.product_id == product_id, InventorySnapshot.location_id == location_id))
    latest = db.scalar(select(ForecastObservation).where(ForecastObservation.product_id == product_id,
                       ForecastObservation.location_id == location_id).order_by(ForecastObservation.date.desc()).limit(1))
    if latest is not None and latest.remaining is not None and latest.date >= today_local() - timedelta(days=1):
        reserved = stock.reserved if stock else 0
        if latest.remaining < reserved:
            return None, {"source": "conflicting_snapshot", "as_of_date": latest.date.isoformat(),
                          "warning": "Импортированный физический остаток меньше резерва SAQTA Save. Данные противоречат друг другу; остаток и рекомендация не рассчитаны до сверки."}
        return latest.remaining - reserved, {"source": "imported_snapshot", "as_of_date": latest.date.isoformat(),
                                  "reserved_excluded": reserved,
                                  "warning": "Физический остаток из последнего наблюдения за вычетом текущего резерва Save; последующие движения и пригодность необходимо проверить. Импорт не создаёт запас для SAQTA Save."}
    production = db.scalar(select(ProductionRecord.id).where(ProductionRecord.product_id == product_id, ProductionRecord.location_id == location_id).limit(1))
    # A legacy detailed forecast could create a zero snapshot without a single
    # inventory record. Such an empty row is not evidence of known zero stock.
    if stock is not None and (production is not None or stock.on_hand > 0 or stock.reserved > 0):
        return stock.on_hand - stock.reserved, {"source": "inventory_ledger", "as_of_date": stock.updated_at.isoformat(),
                                                "warning": "Учтён доступный учётный остаток без резерва Save; свежесть и полноту движений проверьте отдельно."}
    warning = "Текущий остаток не загружен; продажи не используются для выдумывания производства или остатка."
    if latest is not None and latest.remaining is not None:
        warning = f"Последний импортированный остаток от {latest.date.isoformat()} устарел; он не считается текущим."
    return None, {"source": "unknown", "as_of_date": latest.date.isoformat() if latest else None, "warning": warning}


def assortment_report(db: Session, target_date, horizon_days: int, location_id: int | None) -> dict:
    config = db.scalar(select(ApplicationSettings).order_by(ApplicationSettings.id))
    if config is None:
        raise HTTPException(409, "Создайте организацию и загрузите её данные")
    products_query = select(Product).where(Product.bakery_id == config.bakery_id, Product.is_active.is_(True))
    if hasattr(Product, "is_test_data") and not db.info.get("include_test_data", False):
        products_query = products_query.where(Product.is_test_data.is_(False))
    products = list(db.scalars(products_query.order_by(Product.name)))
    locations_query = select(BakeryLocation).where(BakeryLocation.bakery_id == config.bakery_id)
    if location_id is not None:
        locations_query = locations_query.where(BakeryLocation.id == location_id)
    locations = list(db.scalars(locations_query.order_by(BakeryLocation.id)))
    if location_id is not None and not locations:
        raise HTTPException(404, "Филиал недоступен в этой организации")
    items = []
    for location in locations:
        for product in products:
            history = [row for row in sales_history_rows(db, product.id, location.id) if row["date"] < target_date]
            inventory, inventory_source = known_inventory(db, product.id, location.id)
            warnings = [inventory_source["warning"]]
            if history:
                gap = (history[-1]["date"] - history[0]["date"]).days + 1 - len(history)
                if gap:
                    warnings.append(f"В периоде нет наблюдений за {gap} дней; эти пропуски не заменены нулями.")
                if (today_local() - history[-1]["date"]).days > 7:
                    warnings.append("Последние наблюдаемые продажи старше 7 дней; актуальность спроса ограничена.")
            if any(row.get("overlaps_ledger") for row in history):
                warnings.append("На совпадающих датах использован импортированный дневной итог вместо повторного сложения с учётными продажами.")
            source = "imported" if any(row.get("source") == "imported" for row in history) else "synthetic" if is_demo(db) else "ledger"
            item = {"product_id": product.id, "product_name": product.name, "unit": product.unit,
                    "location_id": location.id, "location_name": location.name, "history_days": len(history),
                    "history_period": {"start_date": history[0]["date"].isoformat() if history else None,
                                       "end_date": history[-1]["date"].isoformat() if history else None},
                    "data_source": source, "demo_data": is_demo(db), "available_inventory": inventory,
                    "inventory_source": inventory_source, "warnings": warnings, "risks": [], "priority": "low",
                    "status": "insufficient_history", "predicted_demand": None, "recommended_production": None,
                    "buffered_demand": None, "expected_surplus": None, "potential_writeoff_cost_kzt": None,
                    "mae": None, "evaluation_points": 0, "daily": [], "explanation_components": None}
            item["data_quality"] = {
                "observed_days": len(history),
                "explicit_zero_days": sum(row["sales"] == 0 for row in history),
                "missing_calendar_days": (history[-1]["date"] - history[0]["date"]).days + 1 - len(history) if history else 0,
                "inventory_known": inventory is not None,
                "import_batch_ids": sorted({row["batch_id"] for row in history if row.get("batch_id") is not None}),
                "source_origins": sorted({row["source_origin"] for row in history if row.get("source_origin")}),
                "ledger_overlap_days": sum(bool(row.get("overlaps_ledger")) for row in history),
            }
            try:
                result = generate(history, target_date, horizon_days, inventory, config.safety_buffer_percent)
            except InsufficientHistory as exc:
                item["warnings"].append(str(exc))
                item["risks"].append("insufficient_history")
                item["priority"] = "high"
            else:
                item.update({field: result[field] for field in ("predicted_demand", "recommended_production", "expected_surplus", "mae", "evaluation_points", "daily", "explanation_components", "explanation", "method")})
                item["buffered_demand"] = sum(day["buffered_demand"] for day in result["explanation_components"]["days"])
                item["status"] = "ok" if inventory is not None else "missing_inventory"
                if inventory is not None:
                    if inventory < result["predicted_demand"]:
                        item["risks"].append("shortage")
                        item["warnings"].append("Текущий остаток ниже прогнозируемого спроса: риск условный, до дополнительного производства и без гарантии спроса.")
                    if inventory > result["predicted_demand"]:
                        item["risks"].append("surplus")
                    # Cost exposure of EXISTING stock above demand, not fabricated
                    # confirmed write-offs or profit. Missing cost stays null.
                    if product.cost_kzt is not None:
                        item["potential_writeoff_cost_kzt"] = max(0, inventory - result["predicted_demand"]) * product.cost_kzt
                recent = [row["sales"] for row in history[-14:]]
                average = mean(recent)
                cv = pstdev(recent) / average if average else None
                item["volatility_coefficient"] = round(cv, 4) if cv is not None else None
                if cv is not None and cv > 0.5:
                    item["risks"].append("volatile")
                    item["warnings"].append("Коэффициент вариации последних 14 наблюдений выше 0,5; это описательный порог колебаний, не вероятность дефицита.")
                if item["risks"]:
                    item["priority"] = "high"
            if inventory is None:
                item["risks"].append("missing_inventory")
                item["priority"] = "high"
            items.append(item)
    eligible = [item for item in items if item["predicted_demand"] is not None]
    return {"generated_at": now_utc().isoformat(), "demo_data": is_demo(db),
            "target_date": target_date.isoformat(), "horizon_days": horizon_days,
            "scope": {"bakery_id": config.bakery_id, "location_id": location_id},
            "summary": {"product_count": len(products), "location_count": len(locations), "item_count": len(items),
                        "eligible_count": len(eligible), "insufficient_count": len(items) - len(eligible),
                        "unknown_inventory_count": sum(item["available_inventory"] is None for item in items),
                        "predicted_demand": sum(item["predicted_demand"] for item in eligible),
                        "recommended_production": sum(item["recommended_production"] for item in eligible) if eligible and all(item["recommended_production"] is not None for item in eligible) else None},
            "items": sorted(items, key=lambda item: (item["priority"] != "high", item["product_name"], item["location_id"])),
            "limitations": ["Сумма спроса относится только к товарам и филиалам с достаточной историей; пустой результат не означает нулевой спрос.",
                            "Стоимость потенциального избытка — условная оценка текущего остатка сверх спроса по известной себестоимости, а не подтверждённое списание.",
                            "Каждый филиал прогнозируется отдельно; прогноз организации — сумма этих расчётов без смешивания временных рядов."]}
