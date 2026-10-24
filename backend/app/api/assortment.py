"""One forecast run covers the available assortment; selecting a SKU is optional."""
import json
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import today_local
from app.db.session import scoped_db
from app.models import ApplicationSettings, ForecastRun
from app.schemas import Input
from app.services.assortment import assortment_report
from app.services.subscriptions import consume_forecast_quota, require_forecast_access

router = APIRouter(prefix="/api", tags=["Forecast"])
DB = Annotated[Session, Depends(scoped_db)]


class ForecastRunRequest(Input):
    target_date: date
    horizon_days: int = Field(default=1, ge=1, le=14)
    location_id: int | None = Field(default=None, gt=0)
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=120, pattern=r"^[A-Za-z0-9_-]+$")


@router.post("/forecast-runs", status_code=201)
def create_forecast_run(payload: ForecastRunRequest, db: DB):
    require_forecast_access(db)
    if not 1 <= (payload.target_date - today_local()).days <= 90:
        raise HTTPException(422, "Выберите дату от завтра до ближайших 90 дней")
    config = db.scalar(select(ApplicationSettings).order_by(ApplicationSettings.id))
    if config is None:
        raise HTTPException(409, "Рабочее пространство не инициализировано")
    request_json = json.dumps(payload.model_dump(mode="json", exclude={"idempotency_key"}), sort_keys=True)
    if payload.idempotency_key:
        saved = db.scalar(select(ForecastRun).where(ForecastRun.bakery_id == config.bakery_id, ForecastRun.idempotency_key == payload.idempotency_key))
        if saved is not None:
            if saved.request_json != request_json:
                raise HTTPException(409, "Этот ключ запроса уже использован для других параметров")
            return json.loads(saved.result_json)
    result = assortment_report(db, payload.target_date, payload.horizon_days, payload.location_id)
    saved = ForecastRun(bakery_id=config.bakery_id, idempotency_key=payload.idempotency_key, request_json=request_json, result_json="{}")
    try:
        db.add(saved)
        db.flush()
        result["run_id"] = saved.id
        saved.result_json = json.dumps(result, ensure_ascii=False)
        # Insufficient-data diagnostics do not spend a paid forecast allowance.
        if result["summary"]["eligible_count"]:
            consume_forecast_quota(db, payload.idempotency_key)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Такой расчёт уже выполняется. Повторите запрос с тем же ключом.")
    return result
