from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import today_local
from app.db.session import require_row
from app.models import BakeryLocation, InventorySnapshot, Product, ProductionRecord, SalesRecord, WasteRecord
from app.schemas import RecordCreate

RECORD_MODELS = {"production": ProductionRecord, "sales": SalesRecord, "waste": WasteRecord}


def inventory_row(db: Session, product_id: int, location_id: int) -> InventorySnapshot:
    product = require_row(db, Product, product_id, "Товар")
    location = require_row(db, BakeryLocation, location_id, "Точка")
    if product.bakery_id != location.bakery_id:
        raise HTTPException(422, "Товар и точка должны принадлежать одной пекарне")
    row = db.scalar(select(InventorySnapshot).where(InventorySnapshot.product_id == product_id, InventorySnapshot.location_id == location_id))
    if row is None:
        row = InventorySnapshot(product_id=product_id, location_id=location_id, on_hand=0, reserved=0)
        db.add(row)
        db.flush()
    return row


def adjust_stock(db: Session, product_id: int, location_id: int, on_hand_delta: int = 0, reserved_delta: int = 0):
    row = inventory_row(db, product_id, location_id)
    stmt = update(InventorySnapshot).where(
        InventorySnapshot.id == row.id,
        InventorySnapshot.on_hand + on_hand_delta >= 0,
        InventorySnapshot.reserved + reserved_delta >= 0,
        InventorySnapshot.on_hand + on_hand_delta >= InventorySnapshot.reserved + reserved_delta,
    ).values(on_hand=InventorySnapshot.on_hand + on_hand_delta, reserved=InventorySnapshot.reserved + reserved_delta)
    if db.execute(stmt, execution_options={"synchronize_session": False}).rowcount != 1:
        raise HTTPException(409, "Недостаточно доступного остатка. Проверьте количество и резерв SAQTA Save; запись не изменена.")
    db.expire(row)


def validate_date(value):
    if value > today_local():
        raise HTTPException(422, "Учётная запись не может относиться к будущей дате")
    if value < today_local() - timedelta(days=3650):
        raise HTTPException(422, "Дата записи должна быть в пределах последних 10 лет")


def create_record(db: Session, payload: RecordCreate):
    validate_date(payload.date)
    product = require_row(db, Product, payload.product_id, "Товар")
    adjust_stock(db, payload.product_id, payload.location_id, payload.quantity if payload.kind == "production" else -payload.quantity)
    fields = {k: getattr(payload, k) for k in ("product_id", "location_id", "date", "quantity")}
    if payload.kind == "sales":
        fields.update(unit_price_kzt=payload.unit_price_kzt if payload.unit_price_kzt is not None else product.price_kzt, source="regular")
    elif payload.kind == "waste":
        fields.update(reason=payload.reason, unit_cost_kzt=product.cost_kzt or 0, weight_grams=product.weight_grams)
    row = RECORD_MODELS[payload.kind](**fields)
    db.add(row)
    db.flush()
    validate_ledger(db, payload.product_id, payload.location_id)
    return row


def validate_ledger(db: Session, product_id: int, location_id: int):
    """Reject records creating a negative end-of-day stock anywhere in history."""
    running = 0
    for row in history_rows(db, product_id, location_id):
        running += row["production"] - row["sales"] - row["waste"]
        if running < 0:
            raise HTTPException(409, f"Записи создают отрицательный остаток на {row['date'].isoformat()}. Исправьте исходные данные; изменение отменено.")


def product_json(row: Product):
    return {k: getattr(row, k) for k in ("id", "name", "category", "unit", "price_kzt", "cost_kzt", "weight_grams", "is_active")}


def record_json(db: Session, row, kind: str):
    return {
        "id": row.id, "kind": kind, "product_id": row.product_id,
        "product_name": db.get(Product, row.product_id).name,
        "location_id": row.location_id, "location_name": db.get(BakeryLocation, row.location_id).name,
        "date": row.date, "quantity": row.quantity, "reason": getattr(row, "reason", None),
        "unit_price_kzt": getattr(row, "unit_price_kzt", None), "created_at": row.created_at,
    }


def history_rows(db: Session, product_id: int, location_id: int) -> list[dict]:
    """Complete movement ledger, including production-only days, for balance validation.

    Forecasting uses sales_history_rows instead: absence of a sale is not a zero.
    """
    data = {}
    for model, name in ((ProductionRecord, "production"), (SalesRecord, "sales"), (WasteRecord, "waste")):
        for row in db.scalars(select(model).where(model.product_id == product_id, model.location_id == location_id).order_by(model.date)):
            data.setdefault(row.date, {"date": row.date, "production": 0, "sales": 0, "waste": 0})[name] += row.quantity
    return [data[key] for key in sorted(data)]


def sales_history_rows(db: Session, product_id: int, location_id: int) -> list[dict]:
    """Only explicit sales observations; imported daily totals take precedence on overlap.

    A wide-file row represents a complete observed daily total. Adding ledger sales
    for that same date would double count it. The separate movement ledger remains
    unchanged and is never used to infer unobserved zero sales.
    """
    from app.models import ForecastObservation

    movements = {row["date"]: row for row in history_rows(db, product_id, location_id)}
    data = {}
    for sale in db.scalars(select(SalesRecord).where(SalesRecord.product_id == product_id, SalesRecord.location_id == location_id)):
        if sale.date not in data:
            data[sale.date] = {**movements[sale.date], "source": "ledger", "explicit_zero": False}
    for row in db.scalars(select(ForecastObservation).where(ForecastObservation.product_id == product_id, ForecastObservation.location_id == location_id)):
        data[row.date] = {"date": row.date, "sales": row.sold, "production": row.produced,
                          "waste": None, "remaining": row.remaining, "source": "imported",
                          "source_origin": row.source_origin, "batch_id": row.batch_id,
                          "explicit_zero": row.sold == 0, "overlaps_ledger": row.date in data}
    return [data[key] for key in sorted(data)]
