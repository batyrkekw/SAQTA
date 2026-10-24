import json
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.db.session import scoped_db
from app.services.data_import import MAX_BYTES, ImportOptions, commit_import, guard_origin, inspect_file, preview_import
from app.services.subscriptions import require_forecast_access

router = APIRouter(prefix="/api/imports", tags=["Import preview"])
DB = Annotated[Session, Depends(scoped_db)]


def parse_options(raw: str) -> ImportOptions:
    if len(raw) > 10_000:
        raise HTTPException(422, "Слишком большое сопоставление")
    try:
        return ImportOptions.model_validate(json.loads(raw))
    except (json.JSONDecodeError, ValidationError):
        raise HTTPException(422, "Некорректные параметры импорта: проверьте источник, лист, сопоставление и форматы")


async def read_upload(file: UploadFile):
    content = await file.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise HTTPException(413, "Файл превышает ограничение 2 МБ")
    return content


@router.post("/inspect")
async def inspect_upload(db: DB, file: UploadFile = File(...), source_origin: Literal["demo", "real"] = Form(...)):
    require_forecast_access(db)
    guard_origin(db, source_origin)
    return inspect_file(db, await read_upload(file), file.filename or "", source_origin)


@router.post("/preview")
async def preview_upload(db: DB, file: UploadFile = File(...), options: str = Form(...)):
    require_forecast_access(db)
    parsed = parse_options(options)
    guard_origin(db, parsed.source_origin)
    return preview_import(db, await read_upload(file), file.filename or "", parsed)


@router.post("/commit")
async def commit_upload(db: DB, file: UploadFile = File(...), options: str = Form(...), preview_token: str = Form(...), confirm: str = Form(...)):
    require_forecast_access(db)
    parsed = parse_options(options)
    guard_origin(db, parsed.source_origin)
    return commit_import(db, await read_upload(file), file.filename or "", parsed, preview_token, confirm)
