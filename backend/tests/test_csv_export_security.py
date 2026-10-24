import csv
import io

import pytest
from sqlalchemy import select

from app.core.config import today_local
from app.models import WasteRecord
from app.services.csv_io import spreadsheet_text


@pytest.mark.parametrize("value", ["=SUM(1,2)", "+SUM(1,2)", "-SUM(1,2)", "@SUM(1,2)", " \t=SUM(1,2)", "\n@SUM(1,2)"])
def test_formula_like_export_text_is_explicit_text(value):
    assert spreadsheet_text(value) == "'" + value


@pytest.mark.parametrize("value", [0, 123, -1, "Обычная причина", "", "2026-10-24", None])
def test_numeric_values_and_regular_text_are_not_changed(value):
    assert spreadsheet_text(value) == value


def test_export_protects_formula_like_reason_without_mutating_stored_record(client, database):
    reason = '=HYPERLINK("https://example.invalid/","Open")'
    response = client.post("/api/records", json={"kind": "waste", "product_id": 1, "location_id": 1,
        "date": today_local().isoformat(), "quantity": 1, "reason": reason})
    assert response.status_code == 201
    record_id = response.json()["id"]
    exported = client.get(f"/api/export?location_id=1&start_date={today_local()}&end_date={today_local()}")
    assert exported.status_code == 200
    rows = list(csv.DictReader(io.StringIO(exported.text.lstrip("\ufeff"))))
    row = next(item for item in rows if item["reason"].endswith(reason))
    assert row["reason"] == "'" + reason
    assert row["quantity"] == "1" and row["product_id"] == "1"
    with database() as db:
        stored = db.scalar(select(WasteRecord).where(WasteRecord.id == record_id))
        assert stored.reason == reason
