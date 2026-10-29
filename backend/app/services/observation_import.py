"""Import complete daily sales observations independently from the inventory ledger.

Wide rows may contain sold, remaining and produced columns. Explicit zero sales
are valid; absent remaining/produced stay NULL and never create stock movements.
"""

from collections import Counter
from types import SimpleNamespace
import hashlib
import json

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import BakeryLocation, ForecastObservation, ImportBatch, ImportFingerprint, Product
from app.services.data_import import (
    ALIASES,
    classification,
    guard_origin,
    integer,
    key,
    parse_date,
    read_tables,
    resolve,
    text,
    unit_key,
)

OBSERVATION_ALIASES = {
    **{field: ALIASES[field] for field in ("date", "product", "location", "unit", "unit_price_kzt")},
    "sold": {
        "sold",
        "sales",
        "quantity",
        "количество",
        "продано",
        "продажи",
        "количество продаж",
        "продано шт",
        "продано, шт.",
        "сатылды",
        "сатылған",
        "сату саны",
    },
    "remaining": {"remaining", "остаток", "остатки", "осталось", "остаток на конец дня", "қалдық", "қалды"},
    "produced": {"produced", "production", "произведено", "выпущено", "производство", "өндірілді", "өндірілген"},
    "waste": {"waste", "списано", "списание", "ысырап", "есептен шығарылды"},
    "opening": {"opening", "opening stock", "начальный остаток", "остаток на начало дня", "бастапқы қалдық"},
    "revenue": {"revenue", "выручка", "түсім"},
    "category": {"category", "категория", "санат"},
    "discount": {"discount", "скидка", "жеңілдік"},
    "weather": {"weather", "погода", "ауа райы"},
    "holiday": {"holiday", "праздник", "мереке"},
    "weekday": {"weekday", "day of week", "день недели", "апта күні"},
}


def observation_mapping(columns):
    return {
        field: matches[0]
        for field, aliases in OBSERVATION_ALIASES.items()
        if len(matches := [column for column in columns if key(column) in aliases]) == 1
    }


def prepare_observations(db, content, filename, options):
    settings = guard_origin(db, options.source_origin)
    tables = read_tables(content, filename)
    table = (
        next((item for item in tables if item["name"] == options.sheet), None)
        if options.sheet
        else next((item for item in tables if item["row_count"]), None)
    )
    if table is None:
        raise HTTPException(422, "Выберите непустой лист с историей продаж")
    category = classification(table["columns"])
    mapping = {("sold" if field == "quantity" else field): column for field, column in options.column_mapping.items()}
    header_errors = []
    if category == "survey":
        header_errors.append(
            {
                "row": 1,
                "field": "file",
                "message": "Анкета не является ежедневной историей продаж; ответы не преобразуются в наблюдения.",
            }
        )
    if set(mapping) - set(OBSERVATION_ALIASES) or any(column not in table["columns"] for column in mapping.values()):
        header_errors.append(
            {"row": 1, "field": "mapping", "message": "Проверьте поддерживаемые поля и заголовки сопоставления"}
        )
    if len(set(mapping.values())) != len(mapping):
        header_errors.append(
            {"row": 1, "field": "mapping", "message": "Одна колонка не может обозначать несколько полей"}
        )
    for field in ("date", "sold"):
        if field not in mapping:
            header_errors.append({"row": 1, "field": field, "message": "Обязательное поле не сопоставлено"})
    products = list(
        db.scalars(select(Product).where(Product.bakery_id == settings.bakery_id, Product.is_active.is_(True)))
    )
    locations = list(db.scalars(select(BakeryLocation).where(BakeryLocation.bakery_id == settings.bakery_id)))
    if "product" not in mapping and options.default_product_id is None:
        header_errors.append(
            {"row": 1, "field": "product", "message": "Сопоставьте товар/SKU или выберите товар по умолчанию"}
        )
    default_location = options.default_location_id or (locations[0].id if len(locations) == 1 else None)
    if "location" not in mapping and default_location is None:
        header_errors.append(
            {"row": 1, "field": "location", "message": "Выберите филиал или сопоставьте колонку филиала"}
        )
    if not table["row_count"]:
        header_errors.append({"row": 1, "field": "file", "message": "Лист не содержит записей"})
    errors = list(header_errors)
    warnings = [
        "Это наблюдения для прогноза: импорт не создаёт производство, продажи в учёте или остаток для SAQTA Save.",
        "Одна строка означает полный дневной итог товара и филиала. Неполные дневные итоги следует сначала проверить и агрегировать.",
        "Незаписанные дни не считаются нулевыми продажами. Явное значение 0 сохраняется как наблюдение.",
    ]
    if table["blank_rows_skipped"]:
        warnings.append(f"Пропущено полностью пустых строк: {table['blank_rows_skipped']}.")
    new_products = {}
    entries, seen, missing, group_counts = [], {}, Counter(), Counter()
    for number, row in table["rows"]:
        entry = {"row": number, "status": "error"}
        entries.append(entry)
        if header_errors:
            continue
        try:
            if any(isinstance(value, str) and value.lstrip().startswith("=") for value in row.values()):
                raise ValueError("Формулы не исполняются: замените формулы проверенными значениями")

            def get(field):
                return row.get(mapping.get(field, ""))

            for field in ("date", "sold", "remaining", "produced", "unit_price_kzt"):
                if field in mapping and not text(get(field)):
                    missing[field] += 1
            day = parse_date(get("date"), options.date_format)
            try:
                product = resolve(get("product"), options.default_product_id, products, "Товар")
            except ValueError:
                name = text(get("product"))
                matches = [p for p in products if key(p.name) == key(name)]
                if not options.create_products or not name or name.isdecimal() or matches or len(name) > 120:
                    raise
                if key(name) not in new_products:
                    unit = text(get("unit")) or options.default_unit
                    if not unit:
                        raise ValueError("Для нового товара укажите единицу в файле или выберите её явно")
                    new_products[key(name)] = SimpleNamespace(
                        id=-(len(new_products) + 1), name=name, unit=unit, category=text(get("category")) or "Другое"
                    )
                product = new_products[key(name)]
            location = resolve(get("location"), default_location, locations, "Филиал")
            if text(get("unit")) and unit_key(get("unit")) != unit_key(product.unit):
                raise ValueError(
                    "Единица не совпадает с каталогом; автоматическое преобразование единиц не выполняется"
                )
            sold = integer(get("sold"), options.number_format, "Продано", minimum=0)
            optional = {
                field: integer(get(field), options.number_format, field, minimum=0) if text(get(field)) else None
                for field in ("remaining", "produced", "unit_price_kzt", "waste", "opening", "revenue")
            }
            if (
                optional["opening"] is not None
                and optional["produced"] is not None
                and optional["remaining"] is not None
                and optional["waste"] is not None
            ):
                if optional["opening"] + optional["produced"] - sold - optional["waste"] != optional["remaining"]:
                    raise ValueError(
                        "Не сходится баланс: начальный остаток + произведено − продано − списано = конечный остаток"
                    )
            elif optional["produced"] is not None and sold > optional["produced"]:
                warnings.append(f"Строка {number}: продажи выше выпуска; проверьте начальный остаток.")
            if sold > 100_000:
                warnings.append(f"Строка {number}: необычно большое количество; проверьте единицы измерения.")
            context = {
                field: text(get(field))
                for field in ("category", "discount", "weather", "holiday", "weekday")
                if text(get(field))
            }
            record = {
                "bakery_id": settings.bakery_id,
                "product_id": product.id,
                "location_id": location.id,
                "date": day.isoformat(),
                "sold": sold,
                **optional,
                "source_origin": options.source_origin,
                "context_json": json.dumps(context, ensure_ascii=False, sort_keys=True) if context else None,
            }
            identity = hashlib.sha256(
                json.dumps({"kind": "forecast_observation", **record}, sort_keys=True).encode()
            ).hexdigest()
            entry.update(
                record=record,
                fingerprint=identity,
                status="ready",
                display={"product_name": product.name, "location_name": location.name, "unit": product.unit},
            )
            pairday = (product.id, location.id, day)
            existing = db.scalar(
                select(ForecastObservation).where(
                    ForecastObservation.product_id == product.id,
                    ForecastObservation.location_id == location.id,
                    ForecastObservation.date == day,
                )
            )
            if pairday in seen:
                if seen[pairday] != identity:
                    raise ValueError(
                        "Противоречивые дневные итоги одного товара и филиала; объедините и проверьте исходные строки"
                    )
                entry["status"] = "duplicate"
            elif existing is not None:
                comparable = {
                    field: getattr(existing, field)
                    for field in (
                        "sold",
                        "remaining",
                        "produced",
                        "unit_price_kzt",
                        "source_origin",
                        "waste",
                        "opening",
                        "revenue",
                        "context_json",
                    )
                }
                if comparable != {field: record[field] for field in comparable}:
                    raise ValueError(
                        "За эту дату уже сохранён другой дневной итог. Автоматическая перезапись запрещена"
                    )
                entry["status"] = "duplicate"
            seen[pairday] = identity
            group_counts[(product.id, location.id)] += entry["status"] == "ready"
        except (ValueError, HTTPException) as exc:
            entry["status"] = "error"
            errors.append(
                {
                    "row": number,
                    "field": "observation",
                    "message": str(exc.detail) if isinstance(exc, HTTPException) else str(exc),
                }
            )
    for (product_id, location_id), count in group_counts.items():
        if count < 3:
            warnings.append(
                f"Товар {product_id}, филиал {location_id}: в новом файле только {count} новых наблюдений. Для прогноза нужно минимум 3 наблюдаемые даты с учётом сохранённой истории, для выбора модели и отдельной проверки — 28."
            )
    unknown_stock = sum(
        entry.get("record", {}).get("remaining") is None for entry in entries if entry["status"] == "ready"
    )
    if unknown_stock:
        warnings.append(
            f"Для {unknown_stock} строк остаток отсутствует. Это NULL, а не нулевой остаток; рекомендация по производству может быть недоступна."
        )
    file_sha = hashlib.sha256(content).hexdigest()
    token = hashlib.sha256(
        json.dumps(
            {
                "file": file_sha,
                "options": options.model_dump(),
                "bakery": settings.bakery_id,
                "records": [entry.get("record") for entry in entries],
            },
            sort_keys=True,
            ensure_ascii=False,
        ).encode()
    ).hexdigest()
    valid = sum(entry["status"] == "ready" for entry in entries)
    duplicates = sum(entry["status"] == "duplicate" for entry in entries)
    response = {
        "new_products": [
            {"id": p.id, "name": p.name, "unit": p.unit, "category": p.category} for p in new_products.values()
        ],
        "preview_token": token,
        "file_sha256": file_sha,
        "classification": category,
        "mode": "observations",
        "workspace_mode": settings.workspace_mode,
        "source_origin": options.source_origin,
        "selected_sheet": table["name"],
        "total_rows": table["row_count"],
        "valid_rows": valid,
        "duplicate_rows": duplicates,
        "rejected_rows": table["row_count"] if header_errors else len({error["row"] for error in errors}),
        "can_commit": not errors and valid > 0,
        "errors": errors[:100],
        "warnings": warnings,
        "missing_values": dict(missing),
        "recognized_columns": mapping,
        "preview_rows": [
            {
                "row": entry["row"],
                "status": entry["status"],
                **({"record": {**entry["record"], **entry.get("display", {})}} if entry.get("record") else {}),
            }
            for entry in entries[:50]
        ],
    }
    return response, entries, settings


def commit_observations(db, content, filename, options, preview_token, confirm):
    if confirm != "IMPORT SAQTA":
        raise HTTPException(422, "Подтвердите проверенный импорт")
    response, entries, settings = prepare_observations(db, content, filename, options)
    if response["preview_token"] != preview_token:
        raise HTTPException(409, "Файл, сопоставление или каталог изменились. Повторите предпросмотр")
    if response["errors"]:
        raise HTTPException(
            422,
            {
                "message": "Импорт отменён целиком; исправьте ошибки",
                "errors": response["errors"],
                "rejected_count": response["rejected_rows"],
            },
        )
    ready = [entry for entry in entries if entry["status"] == "ready"]
    if not ready:
        return {
            "batch_id": None,
            "imported_count": 0,
            "duplicate_count": response["duplicate_rows"],
            "rejected_count": 0,
            "message": "Наблюдения уже существуют; повторная загрузка не выполнена",
        }
    batch = ImportBatch(
        bakery_id=settings.bakery_id,
        file_sha256=response["file_sha256"],
        source_origin=options.source_origin,
        source_label=options.source_label,
        sheet_name=response["selected_sheet"],
        mapping_json=json.dumps(
            {
                **options.model_dump(),
                "quality": {
                    k: response[k] for k in ("total_rows", "valid_rows", "duplicate_rows", "missing_values", "warnings")
                },
            },
            ensure_ascii=False,
        ),
        imported_count=len(ready),
        duplicate_count=response["duplicate_rows"],
    )
    try:
        db.add(batch)
        db.flush()
        from datetime import date

        product_ids = {}
        for item in response.get("new_products", []):
            # Lock the organization while introducing catalog names, so two imports cannot race.
            from app.models import Bakery

            db.scalar(select(Bakery).where(Bakery.id == settings.bakery_id).with_for_update())
            existing = next((p for p in db.scalars(select(Product)) if key(p.name) == key(item["name"])), None)
            if existing:
                raise HTTPException(409, "Каталог изменился. Повторите предпросмотр")
            product = Product(
                bakery_id=settings.bakery_id,
                name=item["name"],
                unit=item["unit"],
                category=item["category"],
                price_kzt=0,
                price_known=False,
            )
            db.add(product)
            db.flush()
            product_ids[item["id"]] = product.id
        for entry in ready:
            fields = {**entry["record"], "date": date.fromisoformat(entry["record"]["date"])}
            fields["product_id"] = product_ids.get(fields["product_id"], fields["product_id"])
            observation = ForecastObservation(**fields, batch_id=batch.id, source_row=entry["row"])
            db.add(observation)
            db.flush()
            db.add(
                ImportFingerprint(
                    bakery_id=settings.bakery_id,
                    batch_id=batch.id,
                    fingerprint=entry["fingerprint"],
                    record_kind="forecast_observation",
                    record_id=observation.id,
                )
            )
        # Recheck current organization/plan constraints at the atomic commit,
        # including subscription expiry or catalog changes since preview.
        from app.services.subscriptions import require_forecast_access

        require_forecast_access(db)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            409, "Параллельный импорт уже сохранил дневной итог. Весь пакет отменён; повторите просмотр"
        )
    return {
        "batch_id": batch.id,
        "imported_count": len(ready),
        "duplicate_count": response["duplicate_rows"],
        "rejected_count": 0,
        "message": "Наблюдения сохранены для прогноза. Учётные остатки не изменены",
        "source_origin": options.source_origin,
    }
