import json
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session

from app.analytics.economics import calculate
from app.analytics.reports import dashboard, impact, inventory_report, period
from app.core.config import get_settings, now_utc, today_local
from app.db.session import get_db, require_row
from app.forecasting.baseline import InsufficientHistory, generate
from app.models import ApplicationSettings, Bakery, BakeryLocation, Forecast, Product, SurplusListing
from app.models import Order as OrderModel
from app.schemas import BakeryPatch, EconomicsInput, ForecastRequest, ListingCreate, ListingPatch, OrderCreate, ProductCreate, ProductPatch, RecordCreate, RecordPatch, ResetRequest, SettingsPatch
from app.services.csv_io import MAX_BYTES, export_csv, import_records
from app.services.inventory import RECORD_MODELS, adjust_stock, create_record, history_rows, inventory_row, product_json, record_json, validate_date, validate_ledger
from app.services.marketplace import create_listing, create_order, expire_reservations, listing_json, order_json, patch_listing, transition_order
from app.services.workspace import is_demo, workspace_mode

router = APIRouter(prefix="/api")
DB = Annotated[Session, Depends(get_db)]


def bakery(db):
    row = db.scalar(select(Bakery).order_by(Bakery.id))
    if not row:
        raise HTTPException(409, "Рабочее пространство не инициализировано. Выполните python -m app.seed (или --empty для реальных данных).")
    return row


def app_settings(db):
    row = db.scalar(select(ApplicationSettings).where(ApplicationSettings.bakery_id == bakery(db).id))
    if row is None:
        raise HTTPException(409, "Настройки не инициализированы")
    return row


def settings_json(db):
    owner, config = bakery(db), app_settings(db)
    return {"bakery_name": owner.name, "city": owner.city, "currency": "KZT", "safety_buffer_percent": config.safety_buffer_percent,
            "workspace_mode": workspace_mode(db), "demo_data": is_demo(db),
            "data_source": "Синтетические данные — DEMO DATA" if is_demo(db) else "Реальные данные — отдельная база",
            "auth_enabled": False}


def expire(db):
    expire_reservations(db)
    db.commit()


def check_location(db, location_id):
    if location_id is not None:
        require_row(db, BakeryLocation, location_id, "Точка")


@router.get("/health", tags=["System"])
def health(db: DB):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "service": "SAQTA", "database": "connected", "workspace_mode": workspace_mode(db), "demo_data": is_demo(db)}


@router.get("/bakery", tags=["Workspace"])
def get_bakery(db: DB):
    row = bakery(db)
    return {"id": row.id, "name": row.name, "city": row.city}


@router.patch("/bakery", tags=["Workspace"])
def patch_bakery(payload: BakeryPatch, db: DB):
    row = bakery(db)
    for key, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(row, key, value)
    db.commit()
    return {"id": row.id, "name": row.name, "city": row.city}


@router.get("/locations", tags=["Workspace"])
def locations(db: DB):
    return [{k: getattr(row, k) for k in ("id", "bakery_id", "name", "address", "city")} for row in db.scalars(select(BakeryLocation).order_by(BakeryLocation.id))]


@router.get("/settings", tags=["Workspace"])
def get_application_settings(db: DB):
    return settings_json(db)


@router.patch("/settings", tags=["Workspace"])
def patch_settings(payload: SettingsPatch, db: DB):
    owner, config = bakery(db), app_settings(db)
    if payload.bakery_name is not None:
        owner.name = payload.bakery_name
    if payload.city is not None:
        owner.city = payload.city
    if payload.safety_buffer_percent is not None:
        config.safety_buffer_percent = payload.safety_buffer_percent
    db.commit()
    return settings_json(db)


@router.get("/products", tags=["Catalog"])
def products(db: DB, search: str = ""):
    query = select(Product).order_by(Product.id)
    if search:
        query = query.where(Product.name.ilike(f"%{search}%"))
    return [product_json(row) for row in db.scalars(query)]


@router.post("/products", status_code=201, tags=["Catalog"])
def new_product(payload: ProductCreate, db: DB):
    row = Product(bakery_id=bakery(db).id, **payload.model_dump())
    db.add(row)
    db.commit()
    return product_json(row)


@router.patch("/products/{product_id}", tags=["Catalog"])
def edit_product(product_id: int, payload: ProductPatch, db: DB):
    row = require_row(db, Product, product_id, "Товар")
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None or key == "cost_kzt":
            setattr(row, key, value)
    db.commit()
    return product_json(row)


@router.get("/records", tags=["Inventory"])
def records(db: DB, kind: Literal["production", "sales", "waste"] = "production", location_id: int | None = None,
            start_date: date | None = None, end_date: date | None = None, page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=500)):
    check_location(db, location_id)
    start, end = period(start_date, end_date)
    model = RECORD_MODELS[kind]
    query = select(model).where(model.date >= start, model.date <= end)
    if location_id:
        query = query.where(model.location_id == location_id)
    count = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(model.date.desc(), model.id.desc()).offset((page - 1) * page_size).limit(page_size))
    return {"items": [record_json(db, row, kind) for row in rows], "total": count, "page": page, "page_size": page_size}


@router.post("/records", status_code=201, tags=["Inventory"])
def new_record(payload: RecordCreate, db: DB):
    expire(db)
    row = create_record(db, payload)
    db.commit()
    return record_json(db, row, payload.kind)


@router.patch("/records/{kind}/{record_id}", tags=["Inventory"])
def edit_record(kind: Literal["production", "sales", "waste"], record_id: int, payload: RecordPatch, db: DB):
    expire(db)
    row = require_row(db, RECORD_MODELS[kind], record_id, "Запись")
    if kind == "sales" and row.source == "save":
        raise HTTPException(409, "Продажи SAQTA Save связаны с выданным заказом и не редактируются вручную")
    fields = payload.model_dump(exclude_unset=True, exclude_none=True)
    if "date" in fields:
        validate_date(fields["date"])
    if "unit_price_kzt" in fields and kind != "sales":
        raise HTTPException(422, "Цена продажи применима только к записи продаж")
    if "reason" in fields and kind != "waste":
        raise HTTPException(422, "Причина применима только к списанию")
    delta = fields.get("quantity", row.quantity) - row.quantity
    model = RECORD_MODELS[kind]
    if fields:
        changed = db.execute(update(model).where(model.id == row.id, model.quantity == row.quantity, model.date == row.date).values(**fields), execution_options={"synchronize_session": False}).rowcount
        if changed != 1:
            raise HTTPException(409, "Запись изменилась. Обновите данные и повторите действие.")
    if delta:
        adjust_stock(db, row.product_id, row.location_id, on_hand_delta=delta if kind == "production" else -delta)
    db.refresh(row)
    validate_ledger(db, row.product_id, row.location_id)
    db.commit()
    return record_json(db, row, kind)


@router.get("/inventory", tags=["Inventory"])
def get_inventory(db: DB, location_id: int | None = None, start_date: date | None = None, end_date: date | None = None):
    check_location(db, location_id)
    expire(db)
    return inventory_report(db, location_id, start_date, end_date)


@router.get("/history", tags=["Forecast"])
def get_history(db: DB, product_id: int, location_id: int):
    require_row(db, Product, product_id, "Товар")
    check_location(db, location_id)
    return history_rows(db, product_id, location_id)


@router.post("/forecasts", status_code=201, tags=["Forecast"])
def forecast(payload: ForecastRequest, db: DB):
    if payload.target_date <= today_local():
        raise HTTPException(422, "Выберите дату начиная с завтрашнего дня")
    if (payload.target_date - today_local()).days > 90:
        raise HTTPException(422, "Дата прогноза должна быть в ближайшие 90 дней")
    expire(db)
    product = require_row(db, Product, payload.product_id, "Товар")
    inventory = inventory_row(db, payload.product_id, payload.location_id)
    history = [r for r in history_rows(db, payload.product_id, payload.location_id) if r["date"] < payload.target_date]
    try:
        result = generate(history, payload.target_date, payload.horizon_days, inventory.on_hand - inventory.reserved, app_settings(db).safety_buffer_percent)
    except InsufficientHistory as exc:
        raise HTTPException(422, str(exc))
    result.update(product_id=product.id, product_name=product.name, location_id=payload.location_id, target_date=payload.target_date.isoformat(),
                  horizon_days=payload.horizon_days, generated_at=now_utc().isoformat(), demo_data=is_demo(db),
                  history=[{**r, "date": r["date"].isoformat()} for r in history])
    saved = Forecast(product_id=product.id, location_id=payload.location_id, target_date=payload.target_date, horizon_days=payload.horizon_days, result_json=json.dumps(result, ensure_ascii=False))
    db.add(saved)
    db.flush()
    result["id"] = saved.id
    saved.result_json = json.dumps(result, ensure_ascii=False)
    db.commit()
    return result


@router.get("/forecasts", tags=["Forecast"])
def forecast_history(db: DB, location_id: int | None = None, product_id: int | None = None, limit: int = Query(50, ge=1, le=200)):
    query = select(Forecast)
    if location_id:
        query = query.where(Forecast.location_id == location_id)
    if product_id:
        query = query.where(Forecast.product_id == product_id)
    return [json.loads(row.result_json) for row in db.scalars(query.order_by(Forecast.id.desc()).limit(limit))]


@router.get("/dashboard", tags=["Analytics"])
def get_dashboard(db: DB, location_id: int | None = None, start_date: date | None = None, end_date: date | None = None):
    check_location(db, location_id)
    return dashboard(db, location_id, start_date, end_date)


@router.get("/impact", tags=["Analytics"])
def get_impact(db: DB, location_id: int | None = None, start_date: date | None = None, end_date: date | None = None):
    check_location(db, location_id)
    return impact(db, location_id, start_date, end_date)


@router.post("/economics", tags=["Analytics"])
def economics(payload: EconomicsInput):
    return calculate(payload)


@router.get("/listings", tags=["SAQTA Save"])
def listings(db: DB, location_id: int | None = None, search: str = "", status: Literal["active", "inactive", "all"] = "active"):
    check_location(db, location_id)
    expire(db)
    query = select(SurplusListing).order_by(SurplusListing.id.desc())
    if location_id:
        query = query.where(SurplusListing.location_id == location_id)
    if status != "all":
        query = query.where(SurplusListing.status == status)
    if search:
        query = query.join(Product).where(Product.name.ilike(f"%{search}%"))
    return [listing_json(db, row) for row in db.scalars(query)]


@router.post("/listings", status_code=201, tags=["SAQTA Save"])
def new_listing(payload: ListingCreate, db: DB):
    expire(db)
    row = create_listing(db, payload)
    db.commit()
    return listing_json(db, row)


@router.patch("/listings/{listing_id}", tags=["SAQTA Save"])
def edit_listing(listing_id: int, payload: ListingPatch, db: DB):
    expire(db)
    row = patch_listing(db, listing_id, payload)
    db.commit()
    return listing_json(db, row)


@router.get("/orders", tags=["SAQTA Save"])
def orders(db: DB):
    expire(db)
    return [order_json(db, row) for row in db.scalars(select(OrderModel).order_by(OrderModel.id.desc()).limit(200))]


@router.post("/orders", status_code=201, tags=["SAQTA Save"])
def new_order(payload: OrderCreate, db: DB):
    expire(db)
    row = create_order(db, payload)
    db.commit()
    return order_json(db, row)


@router.post("/orders/{order_id}/cancel", tags=["SAQTA Save"])
def cancel_order(order_id: int, db: DB):
    expire(db)
    row = transition_order(db, order_id, "cancel")
    db.commit()
    return order_json(db, row)


@router.post("/orders/{order_id}/collect", tags=["SAQTA Save"])
def collect_order(order_id: int, db: DB):
    expire(db)
    row = transition_order(db, order_id, "collect")
    db.commit()
    return order_json(db, row)


@router.post("/import", tags=["Data"])
async def csv_import(db: DB, file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(422, "Выберите файл с расширением .csv")
    content = await file.read(MAX_BYTES + 1)
    await file.close()
    if len(content) > MAX_BYTES:
        raise HTTPException(413, "CSV превышает ограничение 2 МБ")
    expire(db)
    count = import_records(db, content)
    db.commit()
    return {"imported": count, "message": f"Импортировано записей: {count}"}


@router.get("/export", tags=["Data"])
def csv_export(db: DB, location_id: int | None = None, start_date: date | None = None, end_date: date | None = None):
    check_location(db, location_id)
    content = export_csv(db, location_id, start_date, end_date)
    return Response(content="\ufeff" + content, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": "attachment; filename=saqta-records.csv"})


@router.post("/demo/reset", tags=["Data"])
def reset_demo(payload: ResetRequest, db: DB):
    if get_settings().workspace_mode != "demo" or not is_demo(db):
        raise HTTPException(403, "Сброс демо недоступен в рабочем пространстве реальных данных")
    from app.seed import seed_database
    result = seed_database(db, reset=True)
    db.commit()
    return {"message": "Демонстрационные данные SAQTA восстановлены", **result, "workspace_mode": "demo"}
