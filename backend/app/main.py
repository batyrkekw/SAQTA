import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.api.routes import router
from app.core.config import get_settings

app = FastAPI(title="SAQTA API", version="1.0.0", description="Прогноз спроса, учёт пекарни и демо-витрина SAQTA Save. Без аутентификации; только изолированное демо.")
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_origins, allow_credentials=False, allow_methods=["GET", "POST", "PATCH", "OPTIONS"], allow_headers=["Content-Type"])
app.include_router(router)


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
    logging.getLogger("saqta").exception("Database operation failed")
    return JSONResponse(status_code=503, content={"detail": "База данных временно недоступна. Повторите запрос позже."})
