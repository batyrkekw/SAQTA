from collections import defaultdict
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import aware, get_settings, now_utc, today_local
from app.forecasting.baseline import InsufficientHistory, predict
from app.models import BakeryLocation, InventorySnapshot, Order, OrderItem, Product, ProductionRecord, SalesRecord, SurplusListing, WasteRecord
from app.services.inventory import history_rows
from app.services.workspace import is_demo


def period(start_date: date | None, end_date: date | None):
    end = end_date or today_local()
    start = start_date or end - timedelta(days=29)
    if start > end or (end - start).days > 366:
        raise HTTPException(422, "Выберите корректный период не более 367 дней")
    return start, end


def filtered_records(db, model, location_id, start, end):
    query = select(model).where(model.date >= start, model.date <= end)
    if location_id is not None:
        query = query.where(model.location_id == location_id)
    return list(db.scalars(query))


def inventory_report(db: Session, location_id=None, start_date=None, end_date=None):
    start, end = period(start_date, end_date)
    totals = {kind: defaultdict(int) for kind in ("produced", "sold", "written_off")}
    for model, kind in ((ProductionRecord, "produced"), (SalesRecord, "sold"), (WasteRecord, "written_off")):
        for row in filtered_records(db, model, location_id, start, end):
            totals[kind][(row.product_id, row.location_id)] += row.quantity
    products = list(db.scalars(select(Product).order_by(Product.id)))
    locations = list(db.scalars(select(BakeryLocation).where(BakeryLocation.id == location_id))) if location_id else list(db.scalars(select(BakeryLocation)))
    snapshots = {(s.product_id, s.location_id): s for s in db.scalars(select(InventorySnapshot))}
    result = []
    for product in products:
        for location in locations:
            key = (product.id, location.id)
            stock = snapshots.get(key)
            result.append({"id": stock.id if stock else 0, "product_id": product.id, "product_name": product.name,
                           "category": product.category, "location_id": location.id, "location_name": location.name,
                           **{kind: totals[kind][key] for kind in totals}, "on_hand": stock.on_hand if stock else 0,
                           "reserved": stock.reserved if stock else 0, "available": stock.on_hand - stock.reserved if stock else 0,
                           "price_kzt": product.price_kzt, "cost_kzt": product.cost_kzt, "weight_grams": product.weight_grams})
    return result


def dashboard(db: Session, location_id=None, start_date=None, end_date=None):
    start, end = period(start_date, end_date)
    production = filtered_records(db, ProductionRecord, location_id, start, end)
    sales = filtered_records(db, SalesRecord, location_id, start, end)
    waste = filtered_records(db, WasteRecord, location_id, start, end)
    dates = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    trends = {d: {"date": d, "sales": 0, "production": 0, "waste": 0, "forecast": None} for d in dates}
    for records, name in ((production, "production"), (sales, "sales"), (waste, "waste")):
        for row in records:
            trends[row.date][name] += row.quantity
    products = {p.id: p for p in db.scalars(select(Product))}
    locations = list(db.scalars(select(BakeryLocation.id).where(BakeryLocation.id == location_id))) if location_id else list(db.scalars(select(BakeryLocation.id)))
    next_demand = 0
    historical_forecasts = defaultdict(list)
    for product_id in products:
        for loc_id in locations:
            history = [r for r in history_rows(db, product_id, loc_id) if r["date"] <= end]
            try:
                next_demand += round(predict(history, end + timedelta(days=1)))
            except InsufficientHistory:
                pass
            for day in dates:
                try:
                    historical_forecasts[day].append(round(predict(history, day)))
                except InsufficientHistory:
                    pass
    for day, values in historical_forecasts.items():
        trends[day]["forecast"] = sum(values)
    best = defaultdict(int)
    for row in sales:
        best[row.product_id] += row.quantity
    # Stock is explicitly live; dated production, sales and write-offs remain period-filtered.
    stock = defaultdict(int)
    query = select(InventorySnapshot)
    if location_id:
        query = query.where(InventorySnapshot.location_id == location_id)
    for row in db.scalars(query):
        stock[row.product_id] += row.on_hand
    active = select(SurplusListing).where(SurplusListing.status == "active", SurplusListing.pickup_deadline > now_utc())
    if location_id:
        active = active.where(SurplusListing.location_id == location_id)
    losses = sum(r.quantity * r.unit_cost_kzt for r in waste)
    metrics = {"produced": sum(r.quantity for r in production), "sold": sum(r.quantity for r in sales),
               "unsold": sum(stock.values()), "written_off": sum(r.quantity for r in waste),
               "waste_kg": round(sum(r.quantity * r.weight_grams for r in waste) / 1000, 3),
               "loss_kzt": losses, "forecast_demand": next_demand,
               "potential_savings_kzt": round(losses * 0.2), "active_listings": len(list(db.scalars(active)))}
    recommendations = []
    if stock:
        product_id = max(stock, key=stock.get)
        if stock[product_id] > 0:
            recommendations.append(f"Проверьте свежесть остатков «{products[product_id].name}»: {stock[product_id]} шт. Подходящие изделия можно предложить в SAQTA Save.")
    if metrics["produced"]:
        recommendations.append(f"За выбранный период списано {metrics['written_off']} из {metrics['produced']} произведённых изделий. Сверьте следующую партию с прогнозом.")
    if not recommendations:
        recommendations.append("Добавьте производство и продажи или импортируйте CSV, чтобы получить рекомендации.")
    return {"demo_data": is_demo(db), "period": {"start_date": start, "end_date": end},
            "metrics": metrics, "trends": list(trends.values()),
            "best_sellers": [{"name": products[k].name, "quantity": v} for k, v in sorted(best.items(), key=lambda x: -x[1])[:5]],
            "surplus_products": [{"name": products[k].name, "quantity": v} for k, v in sorted(stock.items(), key=lambda x: -x[1])[:5]],
            "recommendations": recommendations,
            "savings_methodology": "Сценарная оценка: 20% записанных списаний × зафиксированная себестоимость. Не достигнутая экономия и не гарантия результата. Товары без себестоимости учитываются как 0 ₸. Остаток и активные предложения — текущие; прогноз — на день после конца выбранного периода."}


def impact(db: Session, location_id=None, start_date=None, end_date=None):
    start, end = period(start_date, end_date)
    days = (end - start).days + 1
    baseline_start, baseline_end = start - timedelta(days=days), start - timedelta(days=1)
    waste = filtered_records(db, WasteRecord, location_id, start, end)
    baseline = filtered_records(db, WasteRecord, location_id, baseline_start, baseline_end)
    trends = {start + timedelta(days=i): {"date": start + timedelta(days=i), "waste_kg": 0.0, "recovered_kg": 0.0} for i in range(days)}
    units, grams, value = 0, 0, 0
    for order in db.scalars(select(Order).where(Order.status == "collected")):
        day = aware(order.collected_at).astimezone(ZoneInfo(get_settings().saqta_timezone)).date()
        if not start <= day <= end:
            continue
        for item in db.scalars(select(OrderItem).where(OrderItem.order_id == order.id)):
            listing = db.get(SurplusListing, item.listing_id)
            if location_id and listing.location_id != location_id:
                continue
            units += item.quantity
            grams += item.quantity * item.weight_grams
            value += item.quantity * item.unit_price_kzt
            trends[day]["recovered_kg"] += item.quantity * item.weight_grams / 1000
    for row in waste:
        trends[row.date]["waste_kg"] += row.quantity * row.weight_grams / 1000
    waste_kg = sum(row.quantity * row.weight_grams for row in waste) / 1000
    baseline_kg = sum(row.quantity * row.weight_grams for row in baseline) / 1000
    observed = filtered_records(db, ProductionRecord, location_id, baseline_start, end)
    baseline_observed = len({row.date for row in observed if baseline_start <= row.date <= baseline_end})
    current_observed = len({row.date for row in observed if start <= row.date <= end})
    comparison_complete = baseline_observed == days and current_observed == days
    for row in trends.values():
        row["waste_kg"] = round(row["waste_kg"], 3)
        row["recovered_kg"] = round(row["recovered_kg"], 3)
    return {"demo_data": is_demo(db), "recovered_units": units,
            "recovered_weight_kg": round(grams / 1000, 3), "recovered_value_kzt": value,
            "written_off_units": sum(row.quantity for row in waste), "written_off_kg": round(waste_kg, 3),
            "baseline": {"start_date": baseline_start, "end_date": baseline_end, "waste_kg": round(baseline_kg, 3), "observed_days": baseline_observed, "required_days": days, "complete": baseline_observed == days},
            "comparison_complete": comparison_complete,
            "change_percent": round((waste_kg - baseline_kg) / baseline_kg * 100, 2) if baseline_kg and comparison_complete else None,
            "trends": list(trends.values()), "potential_avoided_waste_kg": None,
            "methodology": ["Проданные через Save изделия учитываются только после подтверждённой выдачи заказа; отменённые и резервные заказы исключены.",
                            "Масса = выданное количество × масса изделия, зафиксированная в заказе. Это учётная масса по карточке товара, а не взвешивание партии; нулевая масса не считается подтверждённой.",
                            "Возвращённая выручка = выданное количество × цена со скидкой, зафиксированная в заказе; это не прибыль.",
                            f"База сравнения — непосредственно предшествующий период равной длительности. Дней с записями производства: {baseline_observed}/{days} в базе и {current_observed}/{days} в выбранном периоде. При неполном покрытии или нулевых базовых списаниях процент не рассчитывается. Изменение не доказывает причинное влияние SAQTA.",
                            "Потенциально предотвращённые отходы не рассчитаны: нет подтверждения, что каждый проданный остаток был бы списан. CO₂ не оценивается."]}
