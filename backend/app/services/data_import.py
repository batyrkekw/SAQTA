"""Explicit preview/mapping/atomic commit for daily CSV and XLSX ledgers.

No source file is persisted. Survey answers are never converted to sales.
"""
import csv
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
from pathlib import Path
import re
from typing import Literal
import unicodedata
from zipfile import ZipFile

from fastapi import HTTPException
import openpyxl
from pydantic import Field, ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import ApplicationSettings, BakeryLocation, ImportBatch, ImportFingerprint, InventorySnapshot, Product
from app.schemas import Input, RecordCreate
from app.services.inventory import RECORD_MODELS, create_record, history_rows, validate_date

MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 5000
MAX_COLUMNS = 80
MAX_SHEETS = 25
MAX_XLSX_EXPANDED_BYTES = 32 * 1024 * 1024
FIELDS = {"date", "quantity", "kind", "product", "location", "unit", "unit_price_kzt", "reason"}
ALIASES = {
    "date": {"date", "дата", "дата продажи", "күн", "күні", "сату күні"}, "quantity": {"quantity", "количество", "кол-во", "продано"},
    "kind": {"kind", "тип", "тип записи"}, "product": {"product", "product_id", "product_name", "товар", "продукт", "өнім", "тауар", "sku", "product name"},
    "location": {"location", "location_id", "location_name", "точка", "филиал", "орын", "нүкте", "дүкен"}, "unit": {"unit", "единица", "ед. изм.", "өлшем бірлігі", "бірлік"},
    "unit_price_kzt": {"unit_price_kzt", "цена", "цена ₸", "цена kzt", "price", "баға", "бағасы"}, "reason": {"reason", "причина"},
}
KIND_ALIASES = {"production": "production", "производство": "production", "выпуск": "production", "sales": "sales", "продажи": "sales", "продажа": "sales", "waste": "waste", "списание": "waste", "списания": "waste"}


class ImportOptions(Input):
    source_origin: Literal["demo", "real"]
    mode: Literal["ledger", "observations"] = "ledger"
    sheet: str | None = Field(default=None, max_length=120)
    column_mapping: dict[str, str] = Field(default_factory=dict, max_length=24)
    default_kind: Literal["production", "sales", "waste"] | None = None
    default_product_id: int | None = Field(default=None, gt=0)
    default_location_id: int | None = Field(default=None, gt=0)
    date_format: Literal["iso", "dmy"] = "iso"
    number_format: Literal["dot", "comma"] = "dot"
    create_products: bool = False
    default_unit: str | None = Field(default=None, min_length=1, max_length=20)
    source_label: str = Field(default="", max_length=120)


def text(value) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(value))).strip() if value is not None else ""


def key(value) -> str:
    return text(value).casefold()


def guard_origin(db: Session, source_origin: str):
    settings = db.scalar(select(ApplicationSettings).order_by(ApplicationSettings.id))
    if settings is None:
        raise HTTPException(409, "Рабочее пространство не инициализировано")
    if settings.workspace_mode != source_origin:
        raise HTTPException(409, "Источник не соответствует рабочему пространству. Реальные данные нельзя загружать в публичное DEMO; используйте отдельную приватную базу реальных данных.")
    return settings


def read_tables(content: bytes, filename: str):
    if len(content) > MAX_BYTES:
        raise HTTPException(413, "Файл превышает ограничение 2 МБ")
    suffix = Path(filename or "").suffix.casefold()
    raw_sheets = []
    if suffix == ".csv":
        try:
            try:
                decoded = content.decode("utf-8-sig")
                encoding = "UTF-8"
            except UnicodeDecodeError:
                if content.startswith((b'\xff\xfe', b'\xfe\xff')):
                    decoded, encoding = content.decode('utf-16'), 'UTF-16'
                else:
                    decoded, encoding = content.decode('cp1251'), 'Windows-1251'
            if '\x00' in decoded:
                raise UnicodeDecodeError('utf-8', content, 0, 1, 'binary input')
            try:
                dialect = csv.Sniffer().sniff(decoded[:4096], delimiters=",;\t")
            except csv.Error:
                dialect = csv.excel
            reader = csv.reader(io.StringIO(decoded), dialect, strict=True)
            rows = []
            for row in reader:
                rows.append(row)
                if len(rows) > MAX_ROWS + 1:
                    raise HTTPException(422, "Допустимо не более 5000 строк на листе")
            raw_sheets = [("CSV", rows)]
        except (UnicodeDecodeError, csv.Error):
            raise HTTPException(422, "Нужен корректный CSV UTF-8 с разделителем запятая, точка с запятой или табуляция")
    elif suffix == ".xlsx":
        try:
            with ZipFile(io.BytesIO(content)) as archive:
                info = archive.infolist()
                if len(info) > 2000 or sum(item.file_size for item in info) > MAX_XLSX_EXPANDED_BYTES:
                    raise HTTPException(413, "Распакованный XLSX превышает безопасный размер")
            workbook = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=False, keep_links=False)
            try:
                if len(workbook.worksheets) > MAX_SHEETS:
                    raise HTTPException(422, "Допустимо не более 25 листов")
                for sheet in workbook:
                    rows = []
                    for row in sheet.iter_rows(values_only=True):
                        rows.append(list(row))
                        if len(rows) > MAX_ROWS + 1 or len(row) > MAX_COLUMNS:
                            raise HTTPException(422, "Допустимо не более 5000 строк и 80 столбцов на листе")
                    raw_sheets.append((sheet.title, rows))
            finally:
                workbook.close()
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(422, "Не удалось прочитать XLSX. Экспортируйте таблицу как обычный XLSX без пароля или CSV UTF-8.")
    else:
        raise HTTPException(422, "Поддерживаются только CSV и XLSX; старый XLS и XLSM не поддерживаются")
    tables = []
    for name, rows in raw_sheets:
        if not rows:
            tables.append({"name": name, "columns": [], "rows": [], "row_count": 0, "blank_rows_skipped": 0})
            continue
        columns = [text(value) for value in rows[0]]
        if len(columns) > MAX_COLUMNS:
            raise HTTPException(422, "Допустимо не более 80 столбцов")
        if any(not value for value in columns) or len(set(map(key, columns))) != len(columns):
            raise HTTPException(422, "Заголовки должны быть непустыми и уникальными")
        data, blank_rows = [], 0
        for number, row in enumerate(rows[1:], start=2):
            if all(value is None or text(value) == "" for value in row):
                blank_rows += 1
                continue
            if len(row) != len(columns):
                raise HTTPException(422, {"message": "Число ячеек не совпадает с заголовком", "errors": [{"row": number, "field": "file", "message": "Проверьте разделитель и количество столбцов"}]})
            data.append((number, dict(zip(columns, row, strict=True))))
        tables.append({"name": name, "columns": columns, "rows": data, "row_count": len(data), "blank_rows_skipped": blank_rows, "encoding": encoding if suffix == ".csv" else "XLSX"})
    return tables


def suggested_mapping(columns):
    return {field: matches[0] for field, aliases in ALIASES.items() if len(matches := [column for column in columns if key(column) in aliases]) == 1}


def classification(columns):
    if sum("?" in column or bool(re.match(r"\d+\.", column)) for column in columns) >= 3:
        return "survey"
    mapped = suggested_mapping(columns)
    return "daily_records_candidate" if "date" in mapped and "quantity" in mapped else "unclassified"


def inspect_file(db: Session, content: bytes, filename: str, source_origin: str):
    settings = guard_origin(db, source_origin)
    tables = read_tables(content, filename)
    selected = next((table for table in tables if table["name"] == "HistoricalData"), None) or next((table for table in tables if table["row_count"]), tables[0] if tables else {"name": "", "columns": [], "rows": []})
    from app.services.observation_import import observation_mapping
    observed_mapping = observation_mapping(selected["columns"])
    return {"file_sha256": hashlib.sha256(content).hexdigest(), "workspace_mode": settings.workspace_mode,
            "source_origin": source_origin, "sheets": [{**{k: table[k] for k in ("name", "columns", "row_count")}, "mapping": observation_mapping(table["columns"])} for table in tables],
            "selected_sheet": selected["name"], "columns": selected["columns"],
            "sample_rows": [{"row": number, "values": {field: text(value) for field, value in row.items()}} for number, row in selected["rows"][:5]],
            "warnings": [f"Лист «{table['name']}»: пропущено полностью пустых строк — {table['blank_rows_skipped']}." for table in tables if table["blank_rows_skipped"]],
            "suggested_mapping": suggested_mapping(selected["columns"]), "classification": classification(selected["columns"]),
            "suggested_observation_mapping": observed_mapping, "encoding": selected.get("encoding", "XLSX"),
            "suggested_mode": "observations" if "sold" in observed_mapping and "date" in observed_mapping and "kind" not in suggested_mapping(selected["columns"]) else "ledger",
            "limits": {"max_bytes": MAX_BYTES, "max_rows": MAX_ROWS, "max_columns": MAX_COLUMNS, "formats": ["csv", "xlsx"]}}


def integer(value, number_format: str, label: str, minimum=0, maximum=1_000_000):
    raw = text(value).replace(" ", "").replace("\u00a0", "").replace("\u202f", "")
    if number_format == "comma":
        if "." in raw:
            raise ValueError(f"{label}: выбран десятичный разделитель запятая; точки неоднозначны")
        raw = raw.replace(",", ".")
    elif "," in raw:
        raise ValueError(f"{label}: выберите формат чисел с запятой или исправьте значение")
    try:
        parsed = Decimal(raw)
    except InvalidOperation:
        raise ValueError(f"{label}: требуется целое число")
    if not parsed.is_finite() or parsed != parsed.to_integral_value() or not minimum <= parsed <= maximum:
        raise ValueError(f"{label}: требуется целое число от {minimum} до {maximum}; округление не выполняется")
    return int(parsed)


def parse_date(value, date_format):
    if isinstance(value, datetime):
        if value.time().isoformat() != "00:00:00":
            raise ValueError("Дата: укажите день без времени; время не отбрасывается автоматически")
        parsed = value.date()
    elif isinstance(value, date):
        parsed = value
    else:
        raw = text(value)
        try:
            if date_format == "iso":
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
                    raise ValueError
                parsed = date.fromisoformat(raw)
            else:
                parsed = datetime.strptime(raw.replace("/", "."), "%d.%m.%Y").date()
        except ValueError:
            raise ValueError("Дата: нужен ГГГГ-ММ-ДД (ISO) или выбранный ДД.ММ.ГГГГ; год обязателен")
    validate_date(parsed)
    return parsed


def unit_key(value):
    normalized = key(value).rstrip(".")
    return "шт" if normalized in {"шт", "штука", "штук", "штуки", "pcs", "pc", "unit", "units", "дана"} else normalized


def resolve(value, default_id, objects, label):
    raw = text(value)
    if not raw:
        matches = [obj for obj in objects if obj.id == default_id] if default_id else []
    elif re.fullmatch(r"\d+", raw):
        matches = [obj for obj in objects if obj.id == int(raw)]
    else:
        matches = [obj for obj in objects if key(obj.name) == key(raw)]
    if len(matches) != 1:
        raise ValueError(f"{label}: неизвестное или неоднозначное значение. Выберите существующий ID или точное название")
    return matches[0]


def fingerprint(payload: RecordCreate, product, bakery_id, origin):
    meaning = payload.model_dump(mode="json")
    meaning.update(bakery_id=bakery_id, source_origin=origin)
    if payload.kind == "waste":
        meaning.update(unit_cost_kzt=product.cost_kzt or 0, weight_grams=product.weight_grams)
    return hashlib.sha256(json.dumps(meaning, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def existing_record(db, payload, product):
    model = RECORD_MODELS[payload.kind]
    query = select(model.id).where(model.product_id == payload.product_id, model.location_id == payload.location_id,
                                   model.date == payload.date, model.quantity == payload.quantity)
    if payload.kind == "sales":
        query = query.where(model.unit_price_kzt == payload.unit_price_kzt, model.source == "regular")
    if payload.kind == "waste":
        query = query.where(model.reason == payload.reason, model.unit_cost_kzt == (product.cost_kzt or 0), model.weight_grams == product.weight_grams)
    return db.scalar(query.limit(1)) is not None


def prepare(db: Session, content: bytes, filename: str, options: ImportOptions):
    settings = guard_origin(db, options.source_origin)
    tables = read_tables(content, filename)
    table = next((item for item in tables if item["name"] == options.sheet), None) if options.sheet else next((item for item in tables if item["row_count"]), None)
    if table is None:
        raise HTTPException(422, "Выберите существующий непустой лист")
    errors, warnings, entries = [], [], []
    columns, mapping = table["columns"], options.column_mapping
    if set(mapping) - FIELDS or len(set(mapping.values())) != len(mapping):
        raise HTTPException(422, "Сопоставление содержит неизвестные поля или повторное использование столбца")
    if any(column not in columns for column in mapping.values()):
        raise HTTPException(422, "Сопоставленный столбец отсутствует на выбранном листе")
    category = classification(columns)
    if category == "survey":
        errors.append({"row": 1, "field": "file", "message": "Это ответы анкеты, а не дневная история продаж. Импорт в учёт запрещён; подготовьте реальные записи по датам и продуктам."})
    for field in ("date", "quantity"):
        if field not in mapping:
            errors.append({"row": 1, "field": field, "message": "Сопоставьте обязательный столбец"})
    for field, default in (("kind", options.default_kind), ("product", options.default_product_id), ("location", options.default_location_id)):
        if field not in mapping and default is None:
            errors.append({"row": 1, "field": field, "message": "Сопоставьте столбец или явно выберите значение для всех строк"})
    if not table["row_count"]:
        errors.append({"row": 1, "field": "file", "message": "Лист не содержит записей"})
    if "unit" not in mapping:
        warnings.append("Единицы в файле не указаны: используются единицы выбранных товаров из каталога, без преобразования количества.")
    if table["blank_rows_skipped"]:
        warnings.append(f"Пропущено полностью пустых строк на выбранном листе: {table['blank_rows_skipped']}. Непустые строки не удалялись.")
    warnings.append("Повтор определяется по смыслу строки, независимо от имени файла. Намеренно одинаковые операции нужно объединить или проверить вручную; нулевые количества не меняются и не пропускаются молча.")
    products = list(db.scalars(select(Product).where(Product.bakery_id == settings.bakery_id)))
    locations = list(db.scalars(select(BakeryLocation).where(BakeryLocation.bakery_id == settings.bakery_id)))
    seen, known = set(), set(db.scalars(select(ImportFingerprint.fingerprint).where(ImportFingerprint.bakery_id == settings.bakery_id)))
    header_errors = bool(errors)
    catalog_price_rows, unknown_cost_rows, unknown_weight_rows, unused_price_rows = [], [], [], []
    if not header_errors:
        for number, source in table["rows"]:
            raw = {field: source[column] for field, column in mapping.items()}
            try:
                if any(isinstance(value, str) and value.lstrip().startswith("=") for value in raw.values()):
                    raise ValueError("Формулы не вычисляются при импорте; экспортируйте значения и проверьте их")
                product = resolve(raw.get("product"), options.default_product_id, products, "Товар")
                location = resolve(raw.get("location"), options.default_location_id, locations, "Точка")
                kind = KIND_ALIASES.get(key(raw.get("kind") or options.default_kind))
                if kind is None:
                    raise ValueError("Тип: нужен production, sales, waste или соответствующее русское название")
                supplied_unit = raw.get("unit")
                if "unit" in mapping and (not text(supplied_unit) or unit_key(supplied_unit) != unit_key(product.unit)):
                    raise ValueError("Единица не совпадает с каталогом; автоматическое преобразование веса в штуки запрещено")
                price = integer(raw["unit_price_kzt"], options.number_format, "Цена KZT", maximum=10_000_000) if text(raw.get("unit_price_kzt")) else (product.price_kzt if kind == "sales" else None)
                payload = RecordCreate(kind=kind, product_id=product.id, location_id=location.id,
                    date=parse_date(raw.get("date"), options.date_format),
                    quantity=integer(raw.get("quantity"), options.number_format, "Количество", minimum=1),
                    reason=text(raw.get("reason")), unit_price_kzt=price if kind == "sales" else None)
                if kind != "waste" and payload.reason:
                    raise ValueError("Причина применяется только к списанию; проверьте сопоставление столбцов")
                if kind == "sales" and not text(raw.get("unit_price_kzt")):
                    catalog_price_rows.append(number)
                if kind == "waste" and product.cost_kzt is None:
                    unknown_cost_rows.append(number)
                if kind == "waste" and product.weight_grams == 0:
                    unknown_weight_rows.append(number)
                if kind != "sales" and text(raw.get("unit_price_kzt")):
                    unused_price_rows.append(number)
                identity = fingerprint(payload, product, settings.bakery_id, options.source_origin)
                duplicate = identity in seen or identity in known or existing_record(db, payload, product)
                seen.add(identity)
                record = {**payload.model_dump(mode="json"), "unit": product.unit, "product_name": product.name, "location_name": location.name}
                if kind == "waste":
                    record.update(unit_cost_kzt=product.cost_kzt or 0, weight_grams=product.weight_grams)
                entries.append({"row": number, "status": "duplicate" if duplicate else "ready", "payload": payload, "fingerprint": identity, "record": record})
            except (ValueError, ValidationError, HTTPException) as exc:
                message = str(exc.detail) if isinstance(exc, HTTPException) else "; ".join(error["msg"] for error in exc.errors()) if isinstance(exc, ValidationError) else str(exc)
                errors.append({"row": number, "field": "record", "message": message})
                entries.append({"row": number, "status": "error"})
    if catalog_price_rows:
        warnings.append(f"Для {len(catalog_price_rows)} строк продаж цена отсутствует: использована текущая цена существующего товара из каталога, показанная в предпросмотре. Подтвердите её соответствие исторической цене.")
    if unknown_cost_rows:
        warnings.append(f"Для {len(unknown_cost_rows)} строк списания себестоимость в каталоге неизвестна: учётное значение 0 ₸ не является подтверждённой нулевой себестоимостью; финансовые потери будут занижены.")
    if unknown_weight_rows:
        warnings.append(f"Для {len(unknown_weight_rows)} строк списания вес товара в каталоге равен 0: подтверждённая масса отсутствует, 0 г не означает физически измеренный нулевой вес.")
    if unused_price_rows:
        warnings.append(f"В {len(unused_price_rows)} строках производства/списания цена продажи не применяется и не сохраняется как цена учётной записи; себестоимость списаний берётся отдельно из каталога.")
    # Validate ledger/available balance in memory. Preview must never write stock.
    ready = [entry for entry in entries if entry["status"] == "ready"]
    pairs = {(entry["payload"].product_id, entry["payload"].location_id) for entry in ready}
    for product_id, location_id in pairs:
        pair = [entry for entry in ready if (entry["payload"].product_id, entry["payload"].location_id) == (product_id, location_id)]
        daily = {row["date"]: row["production"] - row["sales"] - row["waste"] for row in history_rows(db, product_id, location_id)}
        delta = 0
        for entry in pair:
            payload = entry["payload"]
            movement = payload.quantity * (1 if payload.kind == "production" else -1)
            daily[payload.date] = daily.get(payload.date, 0) + movement
            delta += movement
        running, bad_date = 0, None
        for day in sorted(daily):
            running += daily[day]
            if running < 0:
                bad_date = day
                break
        stock = db.scalar(select(InventorySnapshot).where(InventorySnapshot.product_id == product_id, InventorySnapshot.location_id == location_id))
        on_hand, reserved = (stock.on_hand, stock.reserved) if stock else (0, 0)
        if bad_date or on_hand + delta < reserved:
            for entry in pair:
                entry["status"] = "error"
                errors.append({"row": entry["row"], "field": "quantity", "message": f"Отрицательный исторический остаток на {bad_date.isoformat()}" if bad_date else "Импорт расходует зарезервированный/отсутствующий остаток. Добавьте проверенное производство/начальный баланс."})
    file_sha = hashlib.sha256(content).hexdigest()
    token_input = {"file": file_sha, "options": options.model_dump(), "bakery": settings.bakery_id,
                   "records": [entry.get("record") for entry in entries], "identities": [entry.get("fingerprint") for entry in entries]}
    token = hashlib.sha256(json.dumps(token_input, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    duplicate_rows = sum(entry["status"] == "duplicate" for entry in entries)
    rejected_rows = len({error["row"] for error in errors if error["row"] != 1}) if not header_errors else table["row_count"]
    valid_rows = sum(entry["status"] == "ready" for entry in entries)
    response = {"preview_token": token, "file_sha256": file_sha, "classification": category,
        "workspace_mode": settings.workspace_mode, "source_origin": options.source_origin, "selected_sheet": table["name"],
        "total_rows": table["row_count"], "valid_rows": valid_rows, "duplicate_rows": duplicate_rows,
        "rejected_rows": rejected_rows, "can_commit": not errors and valid_rows > 0,
        "errors": errors[:100], "warnings": warnings,
        "preview_rows": [{k: value for k, value in entry.items() if k in {"row", "status", "record"}} for entry in entries[:50]]}
    return response, entries, settings


def preview_import(db: Session, content: bytes, filename: str, options: ImportOptions):
    if options.mode == "observations":
        from app.services.observation_import import prepare_observations
        return prepare_observations(db, content, filename, options)[0]
    return prepare(db, content, filename, options)[0]


def commit_import(db: Session, content: bytes, filename: str, options: ImportOptions, preview_token: str, confirm: str):
    if options.mode == "observations":
        from app.services.observation_import import commit_observations
        return commit_observations(db, content, filename, options, preview_token, confirm)
    if confirm != "IMPORT SAQTA":
        raise HTTPException(422, "Подтвердите проверенный импорт")
    response, entries, settings = prepare(db, content, filename, options)
    if response["preview_token"] != preview_token:
        raise HTTPException(409, "Файл, сопоставление или каталог изменились после просмотра. Повторите проверку.")
    if response["errors"]:
        raise HTTPException(422, {"message": "Импорт отменён целиком; исправьте ошибки", "errors": response["errors"], "rejected_count": response["rejected_rows"]})
    ready = [entry for entry in entries if entry["status"] == "ready"]
    if not ready:
        return {"batch_id": None, "imported_count": 0, "duplicate_count": response["duplicate_rows"], "rejected_count": 0,
                "message": "Все строки уже существуют; повторный импорт не выполнен"}
    batch = ImportBatch(bakery_id=settings.bakery_id, file_sha256=response["file_sha256"], source_origin=options.source_origin,
                        source_label=options.source_label, sheet_name=response["selected_sheet"], mapping_json=json.dumps(options.model_dump(), ensure_ascii=False),
                        imported_count=len(ready), duplicate_count=response["duplicate_rows"])
    try:
        db.add(batch)
        db.flush()
        priorities = {"production": 0, "sales": 1, "waste": 2}
        for entry in sorted(ready, key=lambda entry: (entry["payload"].date, priorities[entry["payload"].kind], entry["row"])):
            # The unique insert happens before any ledger mutation, protecting
            # overlapping concurrent batches as well as same-file repeats.
            identity = ImportFingerprint(bakery_id=settings.bakery_id, batch_id=batch.id, fingerprint=entry["fingerprint"], record_kind=entry["payload"].kind, record_id=0)
            db.add(identity)
            db.flush()
            record = create_record(db, entry["payload"])
            identity.record_id = record.id
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Параллельный импорт уже сохранил такую запись. Весь пакет отменён; повторите просмотр.")
    except HTTPException as exc:
        db.rollback()
        raise HTTPException(409, f"Остатки изменились; импорт отменён целиком. {exc.detail}")
    return {"batch_id": batch.id, "imported_count": len(ready), "duplicate_count": response["duplicate_rows"], "rejected_count": 0,
            "message": "Импорт сохранён; дубликаты пропущены", "source_origin": options.source_origin}
