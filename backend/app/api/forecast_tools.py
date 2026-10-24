"""Additional read-only forecasting tools; the existing forecast endpoints stay compatible."""
from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import now_utc, today_local
from app.db.session import get_db, require_row
from app.forecasting.baseline import backtest
from app.models import BakeryLocation, Product
from app.services.inventory import history_rows
from app.services.workspace import is_demo

router = APIRouter(prefix="/api", tags=["Forecast"])
DB = Annotated[Session, Depends(get_db)]


class BacktestMetrics(BaseModel):
    mae: float | None
    wape_percent: float | None


class BacktestPeriod(BaseModel):
    start_date: date | None
    end_date: date | None


class BacktestPoint(BaseModel):
    date: date
    actual: float
    predicted: float
    naive_predicted: float
    absolute_error: float
    naive_absolute_error: float
    training_observations: int
    training_end_date: date


class ObservationSource(BaseModel):
    days_with_sales_records: int
    days_without_sales_records: int
    missing_calendar_days: int
    zero_sales_interpretation: str


class BacktestReport(BaseModel):
    product_id: int
    product_name: str
    location_id: int
    demo_data: bool
    data_source: Literal["synthetic", "real"]
    generated_at: datetime
    status: Literal["ok", "insufficient_history"]
    method: Literal["recent_weekday_baseline_v1"]
    naive_method: Literal["last_observed_sales"]
    history_days: int
    min_train_days: int
    requested_test_days: int
    evaluation_points: int
    period: BacktestPeriod
    metrics: BacktestMetrics
    naive_metrics: BacktestMetrics
    mae_improvement_percent: float | None
    points: list[BacktestPoint]
    warnings: list[str]
    requirements: list[str]
    observation_source: ObservationSource


@router.get("/backtest", response_model=BacktestReport)
def historical_backtest(
    db: DB,
    product_id: int = Query(gt=0),
    location_id: int = Query(gt=0),
    min_train_days: int = Query(14, ge=14, le=365),
    test_days: int = Query(7, ge=1, le=30),
    end_date: date | None = None,
):
    product = require_row(db, Product, product_id, "Товар")
    location = require_row(db, BakeryLocation, location_id, "Точка")
    if product.bakery_id != location.bakery_id:
        raise HTTPException(422, "Товар и точка должны принадлежать одной пекарне")
    cutoff = end_date or today_local()
    if cutoff > today_local():
        raise HTTPException(422, "Конец исторической проверки не может быть в будущем")
    history = [row for row in history_rows(db, product_id, location_id) if row["date"] <= cutoff]
    try:
        result = backtest(history, min_train_days=min_train_days, test_days=test_days, end_date=cutoff)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    zero_days = sum(row["sales"] == 0 for row in history)
    missing_days = (history[-1]["date"] - history[0]["date"]).days + 1 - len(history) if history else 0
    demo = is_demo(db)
    result.update(
        product_id=product.id, product_name=product.name, location_id=location.id,
        demo_data=demo, data_source="synthetic" if demo else "real", generated_at=now_utc().isoformat(),
        observation_source={
            "days_with_sales_records": len(history) - zero_days,
            "days_without_sales_records": zero_days,
            "missing_calendar_days": missing_days,
            "zero_sales_interpretation": "При наличии производства или списания без записи продаж модель учёта использует 0. Это может быть как нулевой спрос, так и пропуск; проверьте исходные записи. Дни без любых записей не добавляются.",
        },
    )
    if zero_days:
        result["warnings"].append(f"В истории {zero_days} дней без записей продаж, но с другими учётными записями. Они интерпретированы как 0; полнота учёта требует проверки.")
    if missing_days:
        result["warnings"].append(f"Внутри истории отсутствуют {missing_days} календарных дней. Они не заполнены нулями; число наблюдений отличается от календарной длительности.")
    if demo:
        result["warnings"].insert(0, "SYNTHETIC / DEMO: проверка выполнена на синтетических данных. Эти метрики не подтверждают качество на реальной пекарне.")
    else:
        result["warnings"].insert(0, "Источник — рабочая база реальных данных. SAQTA не подтверждает происхождение и полноту каждого импортированного файла; проверьте их перед выводами о качестве.")
    return result
