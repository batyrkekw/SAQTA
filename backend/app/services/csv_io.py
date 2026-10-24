import io

import pandas as pd
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.schemas import RecordCreate
from app.services.inventory import RECORD_MODELS, create_record

MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 5000
COLUMNS = ["kind", "product_id", "location_id", "date", "quantity", "reason", "unit_price_kzt"]


def validate_csv(content: bytes) -> list[RecordCreate]:
    if len(content) > MAX_BYTES:
        raise HTTPException(413, "CSV превышает ограничение 2 МБ")
    try:
        decoded = content.decode("utf-8-sig")
        frame = pd.read_csv(io.StringIO(decoded), dtype=str, keep_default_na=False)
    except (UnicodeDecodeError, pd.errors.ParserError, pd.errors.EmptyDataError):
        raise HTTPException(422, {"message": "Нужен корректный CSV UTF-8 с разделителем-запятой", "errors": [{"row": 1, "message": "Не удалось прочитать CSV"}]})
    missing = set(COLUMNS[:5]) - set(frame.columns)
    unknown = set(frame.columns) - set(COLUMNS)
    if missing or unknown:
        raise HTTPException(422, {"message": "Некорректные столбцы", "errors": [{"row": 1, "message": f"Отсутствуют: {', '.join(sorted(missing)) or 'нет'}; неизвестные: {', '.join(sorted(unknown)) or 'нет'}"}]})
    if frame.empty or len(frame) > MAX_ROWS:
        raise HTTPException(422, {"message": "Допустимо от 1 до 5000 строк", "errors": [{"row": 1, "message": "Некорректное количество строк"}]})
    records, errors = [], []
    for index, raw in frame.iterrows():
        payload = {key: value for key, value in raw.to_dict().items() if value != ""}
        try:
            records.append(RecordCreate.model_validate(payload))
        except ValidationError as exc:
            errors.append({"row": int(index) + 2, "message": "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())})
    if errors:
        raise HTTPException(422, {"message": "Импорт отменён: исправьте строки", "errors": errors[:100]})
    return records


def import_records(db: Session, content: bytes):
    payloads = validate_csv(content)
    for index, payload in enumerate(payloads):
        try:
            create_record(db, payload)
        except HTTPException as exc:
            raise HTTPException(422, {"message": "Импорт отменён целиком", "errors": [{"row": index + 2, "message": str(exc.detail)}]})
    return len(payloads)


def export_csv(db: Session, location_id=None, start_date=None, end_date=None):
    rows = []
    for kind, model in RECORD_MODELS.items():
        query = select(model)
        if location_id:
            query = query.where(model.location_id == location_id)
        if start_date:
            query = query.where(model.date >= start_date)
        if end_date:
            query = query.where(model.date <= end_date)
        for row in db.scalars(query):
            rows.append({"kind": kind, "product_id": row.product_id, "location_id": row.location_id, "date": row.date.isoformat(),
                         "quantity": row.quantity, "reason": getattr(row, "reason", ""), "unit_price_kzt": getattr(row, "unit_price_kzt", "")})
    # Production precedes consumption within a day, so exported CSV can be replayed in an empty workspace.
    priorities = {"production": 0, "sales": 1, "waste": 2}
    rows.sort(key=lambda r: (r["date"], priorities[r["kind"]]))
    return pd.DataFrame(rows, columns=COLUMNS).to_csv(index=False)
