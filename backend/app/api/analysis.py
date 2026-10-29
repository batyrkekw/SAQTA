"""Free, tenant-isolated analysis; calculation happens only on explicit requests."""

from datetime import date, timedelta
import hashlib
import json
from typing import Annotated, Literal
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.config import now_utc, today_local, get_settings
from app.db.session import scoped_db, require_row
from app.models import ApplicationSettings, BakeryLocation, ForecastObservation, ForecastRun, ImportBatch, Product
from app.schemas import Input
from app.services.profile import ProfileInput, profile_json, save_profile, workbook_bytes, read_profile_workbook
from app.services.data_import import MAX_BYTES, validate_date
from app.services.inventory import sales_history_rows, product_json
from app.services.assortment import known_inventory
from app.forecasting.selection import select_forecast

router = APIRouter(prefix="/api/analysis", tags=["SAQTA FORECAST"])
DB = Annotated[Session, Depends(scoped_db)]


@router.get("/state")
def state(db: DB):
    latest = db.scalar(
        select(ForecastRun)
        .where(ForecastRun.request_json.like('%"workflow": "analysis"%'))
        .order_by(ForecastRun.id.desc())
        .limit(1)
    )
    batches = list(db.scalars(select(ImportBatch).order_by(ImportBatch.id.desc()).limit(10)))
    return {
        "profile": profile_json(db),
        "explanation_available": bool(get_settings().llm_base_url),
        "latest": json.loads(latest.result_json) if latest else None,
        "products": [
            product_json(p)
            for p in db.scalars(select(Product).where(Product.is_active.is_(True)).order_by(Product.name))
        ],
        "locations": [
            {"id": location.id, "name": location.name, "address": location.address}
            for location in db.scalars(select(BakeryLocation))
        ],
        "imports": [
            {
                "id": b.id,
                "source": b.source_label,
                "sheet": b.sheet_name,
                "rows": b.imported_count,
                "duplicates": b.duplicate_count,
                "created_at": b.created_at.isoformat(),
            }
            for b in batches
        ],
    }


@router.put("/profile")
def update_profile(payload: ProfileInput, db: DB):
    return save_profile(db, payload)


@router.get("/profile.xlsx")
def export_profile(db: DB):
    return Response(
        workbook_bytes(db),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="saqta-business.xlsx"'},
    )


@router.post("/profile/inspect")
async def inspect_profile(db: DB, file: UploadFile = File(...)):
    content = await file.read(MAX_BYTES + 1)
    return read_profile_workbook(content, file.filename or "").model_dump(mode="json")


class DailyInput(Input):
    product_id: int = Field(gt=0)
    location_id: int = Field(gt=0)
    date: date
    sold: int = Field(ge=0, le=1_000_000)
    remaining: int | None = Field(default=None, ge=0, le=1_000_000)
    produced: int | None = Field(default=None, ge=0, le=1_000_000)
    opening: int | None = Field(default=None, ge=0, le=1_000_000)
    waste: int | None = Field(default=None, ge=0, le=1_000_000)
    unit_price_kzt: int | None = Field(default=None, ge=0, le=10_000_000)
    revenue: int | None = Field(default=None, ge=0, le=1_000_000_000)


@router.post("/observations", status_code=201)
def record_day(payload: DailyInput, db: DB):
    require_row(db, Product, payload.product_id, "Товар")
    require_row(db, BakeryLocation, payload.location_id, "Точка")
    validate_date(payload.date)
    values = payload.model_dump()
    if (
        all(values[f] is not None for f in ("opening", "produced", "waste", "remaining"))
        and payload.opening + payload.produced - payload.sold - payload.waste != payload.remaining
    ):
        raise HTTPException(
            422, "Не сходится баланс: начальный остаток + произведено − продано − списано = конечный остаток"
        )
    existing = db.scalar(
        select(ForecastObservation).where(
            ForecastObservation.product_id == payload.product_id,
            ForecastObservation.location_id == payload.location_id,
            ForecastObservation.date == payload.date,
        )
    )
    if existing:
        if all(getattr(existing, f) == v for f, v in values.items()):
            return {"id": existing.id, "duplicate": True}
        raise HTTPException(409, "За эту дату уже сохранён другой дневной итог. Автоматическая перезапись запрещена")
    source = db.scalar(select(ApplicationSettings.workspace_mode))
    batch = ImportBatch(
        bakery_id=db.info["bakery_id"],
        file_sha256=hashlib.sha256(payload.model_dump_json().encode()).hexdigest(),
        source_origin=source,
        source_label="Daily entry",
        sheet_name="",
        mapping_json="{}",
        imported_count=1,
        duplicate_count=0,
    )
    db.add(batch)
    db.flush()
    row = ForecastObservation(
        **values, bakery_id=db.info["bakery_id"], batch_id=batch.id, source_row=1, source_origin=source
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Дневной итог уже сохранён. Обновите страницу")
    return {"id": row.id, "duplicate": False}


@router.get("/observations")
def observations(db: DB):
    return [
        {
            **{
                f: getattr(row, f)
                for f in ("id", "date", "product_id", "location_id", "sold", "produced", "remaining", "waste")
            },
            "product_name": db.get(Product, row.product_id).name,
        }
        for row in db.scalars(select(ForecastObservation).order_by(ForecastObservation.date.desc()).limit(100))
    ]


class Analyze(Input):
    horizon_days: int = Field(default=7, ge=1, le=14)
    product_id: int | None = Field(default=None, gt=0)
    location_id: int | None = Field(default=None, gt=0)
    task: Literal["demand", "production", "surplus"] = "demand"


@router.post("/runs", status_code=201)
def analyze(payload: Analyze, db: DB):
    products = list(db.scalars(select(Product).where(Product.is_active.is_(True)).order_by(Product.id)))
    locations = list(db.scalars(select(BakeryLocation).order_by(BakeryLocation.id)))
    sole_location_id = locations[0].id if len(locations) == 1 else None
    if payload.product_id:
        require_row(db, Product, payload.product_id, "Товар")
        products = [p for p in products if p.id == payload.product_id]
    if payload.location_id:
        require_row(db, BakeryLocation, payload.location_id, "Точка")
        locations = [location for location in locations if location.id == payload.location_id]
    if len(products) * len(locations) > 200:
        raise HTTPException(422, "Выберите одну точку или товар для расчёта")
    profile = profile_json(db)
    target = today_local() + timedelta(days=1)
    source = []
    for product in products:
        for location in locations:
            history = sales_history_rows(db, product.id, location.id)
            stock, stock_source = known_inventory(db, product.id, location.id)
            source.append((product, location, history, stock, stock_source))
    signature = hashlib.sha256(
        json.dumps(
            {
                "request": payload.model_dump(),
                "day": target.isoformat(),
                "profile": profile,
                "version": 2,
                "source": [
                    (p.id, location.id, history, stock, provenance)
                    for p, location, history, stock, provenance in source
                ],
            },
            sort_keys=True,
            default=str,
        ).encode()
    ).hexdigest()
    key = "analysis:" + signature
    saved = db.scalar(select(ForecastRun).where(ForecastRun.idempotency_key == key))
    if saved:
        return {**json.loads(saved.result_json), "cached": True}
    results = []
    for product, location, history, stock, stock_source in source:
        result = select_forecast(history, target, payload.horizon_days, stock)
        estimate = (
            next((p for p in profile["products"] if p["name"].casefold() == product.name.casefold()), None)
            if profile
            else None
        )
        if (
            result["status"] == "insufficient"
            and estimate
            and (profile.get("estimate_location_id") or sole_location_id) == location.id
            and estimate["typical_sold"] is not None
            and profile["confidence"] != "unknown"
        ):
            # These are forward assumptions only. No historical observations are inserted.
            result.update(
                status="estimate",
                model="questionnaire",
                daily=[
                    {
                        "date": (target + timedelta(days=i)).isoformat(),
                        "demand": estimate["typical_sold"]
                        if (target + timedelta(days=i)).weekday() in profile["working_days"]
                        else 0,
                        "production": None,
                        "surplus": None,
                    }
                    for i in range(payload.horizon_days)
                ],
            )
            result["demand"] = sum(d["demand"] for d in result["daily"])
            result["production"] = None
        observed = len(history)
        gap = (history[-1]["date"] - history[0]["date"]).days + 1 - observed if history else 0
        recent = [r["sales"] for r in history[-7:]]
        previous = [r["sales"] for r in history[-14:-7]]
        trend = (sum(recent) / len(recent) - sum(previous) / len(previous)) if len(previous) == 7 else None
        facts = [
            "estimate" if result["status"] == "estimate" else "history" if observed else "empty",
            "metrics" if result["metrics"] else "no_metrics",
            "stock" if stock is not None else "no_stock",
            "daily_tracking",
        ]
        if history and (target - history[-1]["date"]).days > 7:
            facts.append("stale")
        if gap:
            facts.append("gaps")
        if trend is not None:
            facts.append("rising" if trend > 0 else "falling" if trend < 0 else "stable")
        result.update(
            product_id=product.id,
            product_name=product.name,
            unit=product.unit,
            location_id=location.id,
            location_name=location.name,
            inventory=stock,
            inventory_source=stock_source,
            quality={
                "observed_days": observed,
                "missing_days": gap,
                "zero_days": sum(r["sales"] == 0 for r in history),
                "first_date": history[0]["date"].isoformat() if history else None,
                "last_date": history[-1]["date"].isoformat() if history else None,
            },
            trend_units=round(trend, 2) if trend is not None else None,
            explanation={"mode": "rules", "facts": facts},
            actual_history=[{"date": r["date"].isoformat(), "sold": r["sales"]} for r in history[-90:]],
        )
        results.append(result)
    report = {
        "schema_version": 1,
        "created_at": now_utc().isoformat(),
        "target_date": target.isoformat(),
        "horizon_days": payload.horizon_days,
        "task": payload.task,
        "items": results,
        "cached": False,
        "data_source": db.scalar(select(ApplicationSettings.workspace_mode)),
    }
    run = ForecastRun(
        bakery_id=db.info["bakery_id"],
        idempotency_key=key,
        request_json=json.dumps({"workflow": "analysis", **payload.model_dump()}),
        result_json="{}",
    )
    db.add(run)
    try:
        db.flush()
        report["run_id"] = run.id
        run.result_json = json.dumps(report, ensure_ascii=False)
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(ForecastRun).where(ForecastRun.idempotency_key == key))
        if not existing:
            raise
        return {**json.loads(existing.result_json), "cached": True}
    return report


@router.get("/runs")
def runs(db: DB):
    return [
        json.loads(run.result_json)
        for run in db.scalars(
            select(ForecastRun)
            .where(ForecastRun.request_json.like('%"workflow": "analysis"%'))
            .order_by(ForecastRun.id.desc())
            .limit(20)
        )
    ]


@router.get("/runs/{run_id}/actuals")
def actuals(run_id: int, db: DB):
    run = require_row(db, ForecastRun, run_id, "Прогноз")
    result = []
    for item in json.loads(run.result_json).get("items", []):
        if item["status"] != "ready":
            continue
        actual = {
            r["date"].isoformat(): r["sales"] for r in sales_history_rows(db, item["product_id"], item["location_id"])
        }
        for point in item["daily"]:
            if point["date"] in actual:
                result.append(
                    {
                        "product": item["product_name"],
                        "date": point["date"],
                        "predicted": point["demand"],
                        "actual": actual[point["date"]],
                        "error": abs(actual[point["date"]] - point["demand"]),
                    }
                )
    return result


@router.post("/runs/{run_id}/explain")
async def explain(run_id: int, db: DB):
    from app.services.explanation import explain_report

    run = require_row(db, ForecastRun, run_id, "Прогноз")
    report = await explain_report(json.loads(run.result_json))
    run.result_json = json.dumps(report, ensure_ascii=False)
    db.commit()
    return report
