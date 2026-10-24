from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
import io
import json
from threading import Barrier

from fastapi import HTTPException
import openpyxl
import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.core.config import today_local
from app.db.session import Base, build_engine
from app.models import ApplicationSettings, ImportBatch, ImportFingerprint, InventorySnapshot, Product, ProductionRecord
from app.seed import seed_database
from app.services import data_import
from app.services.data_import import MAX_BYTES, ImportOptions, commit_import, inspect_file, preview_import


def csv_data(*rows, header="kind,product,location,date,quantity,unit,unit_price_kzt,reason"):
    return (header + "\n" + "\n".join(rows) + "\n").encode("utf-8")


def options(**changes):
    fields = {"source_origin": "demo", "column_mapping": {"kind": "kind", "product": "product", "location": "location", "date": "date", "quantity": "quantity", "unit": "unit", "unit_price_kzt": "unit_price_kzt", "reason": "reason"}}
    return ImportOptions(**{**fields, **changes})


def row(kind="production", quantity="7", day=None, unit="шт.", price="", reason="", product=1):
    return f"{kind},{product},1,{day or today_local().isoformat()},{quantity},{unit},{price},{reason}"


def preview_commit(db, content, opts=None, filename="history.csv"):
    opts = opts or options()
    preview = preview_import(db, content, filename, opts)
    result = commit_import(db, content, filename, opts, preview["preview_token"], "IMPORT SAQTA")
    return preview, result


def balance(db):
    item = db.scalar(select(InventorySnapshot).where(InventorySnapshot.product_id == 1, InventorySnapshot.location_id == 1))
    db.refresh(item)
    return item.on_hand, item.reserved


def test_preview_does_not_write_and_commit_reconciles_stock(database):
    content = csv_data(row("production", "7"), row("sales", "3", price="750"), row("waste", "2", reason="QA import synthetic"))
    with database() as db:
        before = balance(db)
        preview = preview_import(db, content, "history.csv", options())
        assert preview["can_commit"] and preview["valid_rows"] == 3
        assert balance(db) == before
        assert db.scalar(select(func.count()).select_from(ImportBatch)) == 0
        result = commit_import(db, content, "history.csv", options(), preview["preview_token"], "IMPORT SAQTA")
        assert result["imported_count"] == 3
        assert balance(db) == (before[0] + 2, before[1])
        assert db.scalar(select(func.count()).select_from(ImportFingerprint)) == 3


def test_reimport_renamed_reordered_and_samefile_duplicates(database):
    content = csv_data(row(), row(), row("production", "8"))
    with database() as db:
        preview, first = preview_commit(db, content)
        assert preview["duplicate_rows"] == 1 and first["imported_count"] == 2
        before = balance(db)
        _, second = preview_commit(db, csv_data(row("production", "8"), row()), filename="renamed.csv")
        assert second["imported_count"] == 0 and second["duplicate_count"] == 2
        assert balance(db) == before
        assert db.scalar(select(func.count()).select_from(ImportBatch)) == 1


def test_existing_manual_record_is_not_duplicated(database):
    with database() as db:
        original = db.scalar(select(ProductionRecord).where(ProductionRecord.product_id == 1, ProductionRecord.location_id == 1).limit(1))
        preview, result = preview_commit(db, csv_data(row(quantity=str(original.quantity), day=original.date.isoformat())))
        assert preview["duplicate_rows"] == 1 and result["imported_count"] == 0


@pytest.mark.parametrize("quantity", ["-1", "0", "1.5", "NaN", "Infinity", "1000001"])
def test_invalid_quantities_block_atomic_commit(database, quantity):
    content = csv_data(row(), row(quantity=quantity))
    with database() as db:
        before = balance(db)
        preview = preview_import(db, content, "history.csv", options())
        assert not preview["can_commit"] and preview["rejected_rows"] == 1
        with pytest.raises(HTTPException) as rejected:
            commit_import(db, content, "history.csv", options(), preview["preview_token"], "IMPORT SAQTA")
        assert rejected.value.status_code == 422
        assert balance(db) == before
        assert db.scalar(select(func.count()).select_from(ImportBatch)) == 0


def test_dates_numbers_names_and_units_require_explicit_format(database):
    content = "Товар;Точка;День;Кол-во;Ед\n  Круассан   классический ;1;01.02.2026;7,0;шт\n".encode()
    mapped = {"product": "Товар", "location": "Точка", "date": "День", "quantity": "Кол-во", "unit": "Ед"}
    with database() as db:
        wrong = preview_import(db, content, "ru.csv", options(column_mapping=mapped, default_kind="production"))
        assert not wrong["can_commit"]
        opts = options(column_mapping=mapped, default_kind="production", date_format="dmy", number_format="comma")
        good = preview_import(db, content, "ru.csv", opts)
        assert good["can_commit"]
        assert good["preview_rows"][0]["record"]["date"] == "2026-02-01"
        assert good["preview_rows"][0]["record"]["quantity"] == 7
        assert not preview_import(db, csv_data(row(unit="кг")), "wrong.csv", options())["can_commit"]


def test_missing_identity_and_unmapped_defaults_are_not_invented(database):
    with database() as db:
        preview = preview_import(db, csv_data(row(product=999999)), "unknown.csv", options())
        assert not preview["can_commit"] and "неизвестное" in preview["errors"][0]["message"]
        unknown = options(column_mapping={"date": "date", "quantity": "quantity"})
        preview = preview_import(db, csv_data(row()), "unknown.csv", unknown)
        assert {error["field"] for error in preview["errors"]} == {"kind", "product", "location"}


def xlsx_bytes(sheets):
    # Synthetic in-memory fixture, never the private source workbook.
    workbook = openpyxl.Workbook()
    workbook.remove(workbook.active)
    for name, rows in sheets.items():
        sheet = workbook.create_sheet(name)
        for values in rows:
            sheet.append(values)
    stream = io.BytesIO()
    workbook.save(stream)
    workbook.close()
    return stream.getvalue()


def test_xlsx_sheet_selection_and_native_excel_date(database):
    content = xlsx_bytes({"Notes": [["note"], ["synthetic fixture"]], "History": [["day", "count"], [datetime.combine(today_local(), datetime.min.time()), 7]]})
    with database() as db:
        inspected = inspect_file(db, content, "sample.xlsx", "demo")
        assert [sheet["name"] for sheet in inspected["sheets"]] == ["Notes", "History"]
        opts = options(sheet="History", column_mapping={"date": "day", "quantity": "count"}, default_kind="production", default_product_id=1, default_location_id=1)
        preview, result = preview_commit(db, content, opts, filename="sample.xlsx")
        assert preview["selected_sheet"] == "History" and result["imported_count"] == 1


def test_survey_never_becomes_daily_history(database):
    # Non-identifying synthetic questionnaire columns/answers.
    content = xlsx_bytes({"Responses": [["Timestamp", "1. Production?", "2. Surplus?", "3. Interest?"], [datetime.now(), "range", "sometimes", "yes"]]})
    with database() as db:
        result = inspect_file(db, content, "survey.xlsx", "demo")
        assert result["classification"] == "survey"
        preview = preview_import(db, content, "survey.xlsx", options(column_mapping={}))
        assert not preview["can_commit"] and preview["classification"] == "survey"
        assert preview["rejected_rows"] == 1


def test_formulas_bad_files_and_size_limits(database):
    with database() as db:
        opts = options(column_mapping={"date": "date", "quantity": "quantity"}, default_kind="production", default_product_id=1, default_location_id=1)
        content = xlsx_bytes({"History": [["date", "quantity"], [today_local(), "=2+2"]]})
        assert not preview_import(db, content, "formulas.xlsx", opts)["can_commit"]
        for content, filename in [(b"bad zip", "bad.xlsx"), (b"x,y\n1,2\n", "bad.xls"), (b"d,d\n1,2", "bad.csv"), (b"x" * (MAX_BYTES + 1), "big.csv")]:
            with pytest.raises(HTTPException):
                inspect_file(db, content, filename, "demo")


def test_origin_guard_uses_persisted_mode_and_preview_token_guard(database, monkeypatch):
    with database() as db:
        monkeypatch.setenv("WORKSPACE_MODE", "real")
        for fn in (lambda: inspect_file(db, csv_data(row()), "private.csv", "real"),
                   lambda: preview_import(db, csv_data(row()), "private.csv", options(source_origin="real"))):
            with pytest.raises(HTTPException) as rejected:
                fn()
            assert rejected.value.status_code == 409
        preview = preview_import(db, csv_data(row()), "test.csv", options())
        with pytest.raises(HTTPException) as rejected:
            commit_import(db, csv_data(row(quantity="8")), "test.csv", options(), preview["preview_token"], "IMPORT SAQTA")
        assert rejected.value.status_code == 409
        with pytest.raises(HTTPException):
            commit_import(db, csv_data(row()), "test.csv", options(), preview["preview_token"], "wrong")


def test_origin_real_allowed_only_in_persisted_real_workspace(database):
    with database() as db:
        settings = db.scalar(select(ApplicationSettings))
        settings.workspace_mode = "real"
        db.commit()
        # Fixture only: validate that stored mode, not the process default,
        # governs admission. No actual private values are used in tests.
        opts = options(source_origin="real")
        preview, result = preview_commit(db, csv_data(row()), opts)
        assert preview["workspace_mode"] == "real" and result["source_origin"] == "real"


def test_negative_historical_ledger_preview_and_database_identity_constraint(database):
    with database() as db:
        product = Product(bakery_id=1, name="Synthetic import ledger", category="QA", unit="шт.", price_kzt=500, cost_kzt=200, weight_grams=100)
        db.add(product)
        db.commit()
        content = csv_data(row("sales", "3", day=(today_local() - timedelta(days=1)).isoformat(), product=product.id), row("production", "7", product=product.id))
        preview = preview_import(db, content, "invalid-ledger.csv", options())
        assert not preview["can_commit"] and any("исторический" in error["message"] for error in preview["errors"])
        preview_commit(db, csv_data(row()))
        identity = db.scalar(select(ImportFingerprint))
        db.add(ImportFingerprint(bakery_id=identity.bakery_id, batch_id=identity.batch_id, fingerprint=identity.fingerprint, record_kind="production", record_id=999))
        with pytest.raises(IntegrityError):
            db.flush()
        db.rollback()


def test_import_endpoints_preserve_legacy_csv_and_accept_multipart(client):
    content = csv_data(row())
    inspected = client.post("/api/imports/inspect", files={"file": ("test.csv", content, "text/csv")}, data={"source_origin": "demo"})
    assert inspected.status_code == 200
    assert inspected.json()["suggested_mapping"]["date"] == "date"
    payload = {"options": json.dumps(options().model_dump())}
    checked = client.post("/api/imports/preview", files={"file": ("test.csv", content)}, data=payload)
    assert checked.status_code == 200 and checked.json()["can_commit"]
    confirmed = client.post("/api/imports/commit", files={"file": ("test.csv", content)}, data={**payload, "preview_token": checked.json()["preview_token"], "confirm": "IMPORT SAQTA"})
    assert confirmed.status_code == 200 and confirmed.json()["imported_count"] == 1
    refused = client.post("/api/imports/inspect", files={"file": ("private.xlsx", b"not read")}, data={"source_origin": "real"})
    assert refused.status_code == 409
    assert client.post("/api/imports/preview", files={"file": ("test.csv", content)}, data={"options": "{bad"}).status_code == 422
    assert client.get("/api/health").status_code == 200


def test_confirmed_demo_reset_handles_import_audit_foreign_keys(client, database):
    content = csv_data(row())
    payload = {"options": json.dumps(options().model_dump())}
    preview = client.post("/api/imports/preview", files={"file": ("synthetic.csv", content)}, data=payload).json()
    committed = client.post("/api/imports/commit", files={"file": ("synthetic.csv", content)}, data={**payload, "preview_token": preview["preview_token"], "confirm": "IMPORT SAQTA"})
    assert committed.status_code == 200
    assert client.post("/api/demo/reset", json={"confirm": "wrong"}).status_code == 422
    with database() as db:
        assert db.scalar(select(func.count()).select_from(ImportFingerprint)) == 1
    restored = client.post("/api/demo/reset", json={"confirm": "RESET SAQTA DEMO"})
    assert restored.status_code == 200 and restored.json()["days"] == 42
    with database() as db:
        assert db.scalar(select(func.count()).select_from(ImportFingerprint)) == 0
        assert db.scalar(select(func.count()).select_from(ImportBatch)) == 0
        assert db.scalar(select(func.count()).select_from(Product)) == 5


def test_preview_discloses_catalog_defaults_unknown_cost_weight_and_blank_rows(database):
    with database() as db:
        product = Product(bakery_id=1, name="Synthetic missing catalog measures", category="QA", unit="шт.", price_kzt=500, cost_kzt=None, weight_grams=0)
        db.add(product)
        db.commit()
        content = csv_data(row(product=product.id), "", row("sales", "3", product=product.id), "", row("waste", "2", reason="Synthetic reason", product=product.id))
        preview = preview_import(db, content, "missing.csv", options())
        assert preview["can_commit"] and preview["valid_rows"] == 3 and preview["total_rows"] == 3
        assert preview["preview_rows"][1]["record"]["unit_price_kzt"] == 500
        assert preview["preview_rows"][2]["record"]["unit_cost_kzt"] == 0
        assert preview["preview_rows"][2]["record"]["weight_grams"] == 0
        messages = " ".join(preview["warnings"])
        assert "пустых строк на выбранном листе: 2" in messages
        assert "цена отсутствует" in messages and "исторической цене" in messages
        assert "себестоимость в каталоге неизвестна" in messages
        assert "подтверждённая масса отсутствует" in messages


def test_concurrent_imports_cannot_duplicate_semantic_rows(tmp_path, monkeypatch):
    """Force both previews to finish before either transaction writes."""
    engine = build_engine(f"sqlite:///{tmp_path / 'import-race.db'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as db:
        seed_database(db)
        db.commit()
        before = balance(db)
        token = preview_import(db, csv_data(row()), "same.csv", options())["preview_token"]
    barrier = Barrier(2)
    real_prepare = data_import.prepare

    def simultaneous_prepare(*args, **kwargs):
        prepared = real_prepare(*args, **kwargs)
        barrier.wait(timeout=15)
        return prepared

    monkeypatch.setattr(data_import, "prepare", simultaneous_prepare)

    def import_once():
        with factory() as db:
            try:
                return commit_import(db, csv_data(row()), "same.csv", options(), token, "IMPORT SAQTA")["imported_count"]
            except HTTPException as exc:
                return exc.status_code

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: import_once(), range(2)))
        assert sorted(results) == [1, 409]
        with factory() as db:
            assert db.scalar(select(func.count()).select_from(ImportFingerprint)) == 1
            assert db.scalar(select(func.count()).select_from(ImportBatch)) == 1
            assert balance(db) == (before[0] + 7, before[1])
    finally:
        engine.dispose()
