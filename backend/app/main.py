from app.api import market, analysis
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.api.routes import router
from app.api.forecast_tools import router as forecast_tools_router
from app.api.imports import router as imports_router
from app.api.assortment import router as assortment_router
from app.api.auth import router as auth_router
from app.core.config import get_settings

app = FastAPI(title="SAQTA API", version="2.0.0", description="SAQTA SAVE marketplace and private SAQTA FORECAST workflows.")
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_origins, allow_credentials=False, allow_methods=["GET", "POST", "PUT", "PATCH", "OPTIONS"], allow_headers=["Content-Type", "Authorization", "X-SAQTA-Verification", "Idempotency-Key"])
app.include_router(router)
app.include_router(forecast_tools_router)
app.include_router(imports_router)
app.include_router(assortment_router)
app.include_router(auth_router)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    issues = [{"field": ".".join(map(str, error["loc"])), "message": error["msg"]} for error in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": "Проверьте введённые данные. Количество должно быть положительным, цены — целыми неотрицательными числами.", "errors": issues})


@app.exception_handler(IntegrityError)
async def integrity_error(request: Request, exc: IntegrityError):
    logging.getLogger("saqta").warning("Database constraint rejected a request")
    return JSONResponse(status_code=409, content={"detail": "Изменение нарушает целостность данных. Обновите страницу и проверьте остаток."})


@app.exception_handler(SQLAlchemyError)
async def database_error(request: Request, exc: SQLAlchemyError):
    logging.getLogger("saqta").error("Database operation failed: %s", type(exc).__name__)
    return JSONResponse(status_code=503, content={"detail": "База данных временно недоступна. Повторите запрос позже."})

app.include_router(market.router)
app.include_router(analysis.router)
