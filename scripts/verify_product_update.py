#!/usr/bin/env python3
"""Verify SAQTA's Forecast / Save / About release using synthetic fixtures only.

Read-only by default. --write-demo creates one isolated QA product and imported
ledger, checks transactional import deduplication, then deactivates that product
and clears its synthetic stock with a labeled zero-cost/zero-weight write-off.
Never reads a private workbook, resets a workspace, or deletes existing data.
Python standard library only; no cloud or database credentials are needed.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
from datetime import date, datetime, timedelta, timezone
import hashlib
from html import escape
from html.parser import HTMLParser
import io
import json
import math
import os
from pathlib import Path
import re
from statistics import mean
import sys
from threading import Barrier
import time
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
import uuid
from zipfile import ZIP_DEFLATED, ZipFile

from verify_live import VerificationError, public_url, require


class VisibleHTML(HTMLParser):
    """Ignore executable/serialized scripts when checking visible public prose."""
    def __init__(self):
        super().__init__()
        self.hidden = 0
        self.parts: list[str] = []
        self.nav_depth = 0
        self.main_navigation: list[str] = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag in {"script", "style"}:
            self.hidden += 1
        if tag == "nav" and values.get("aria-label") == "Основная навигация":
            self.nav_depth += 1
        if self.nav_depth and tag == "a":
            self.main_navigation.append(values.get("href", ""))

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.hidden = max(0, self.hidden - 1)
        if tag == "nav" and self.nav_depth:
            self.nav_depth -= 1

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def xlsx_fixture(rows: list[list[Any]]) -> bytes:
    """Build a small ordinary XLSX entirely in memory, with two synthetic sheets."""
    def sheet(values):
        rendered = []
        for row_number, row in enumerate(values, start=1):
            cells = []
            for column, value in enumerate(row):
                ref = chr(65 + column) + str(row_number)
                if isinstance(value, int):
                    cells.append(f'<c r="{ref}" t="n"><v>{value}</v></c>')
                else:
                    cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>')
            rendered.append(f'<row r="{row_number}">{"".join(cells)}</row>')
        return '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + "".join(rendered) + '</sheetData></worksheet>'
    content_types = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
    workbook = '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Notes" sheetId="1" r:id="rId1"/><sheet name="History" sheetId="2" r:id="rId2"/></sheets></workbook>'
    relationships = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'
    root = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    output = io.BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for name, content in {"[Content_Types].xml": content_types, "_rels/.rels": root,
                              "xl/workbook.xml": workbook, "xl/_rels/workbook.xml.rels": relationships,
                              "xl/worksheets/sheet1.xml": sheet([["note"], ["SYNTHETIC QA fixture only"]]),
                              "xl/worksheets/sheet2.xml": sheet(rows)}.items():
            archive.writestr(name, content.encode("utf-8"))
    return output.getvalue()


class Verifier:
    def __init__(self, args):
        self.args = args
        self.include_verification = False
        self.api = args.api_url
        self.frontend = args.frontend_url
        self.origin = self.api[:-4]
        self.health = self.settings = None
        self.products = self.locations = []
        self.product_id = None
        self.location_id = None
        self.marker = "QA PRODUCT UPDATE " + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + " " + uuid.uuid4().hex[:6]
        self.today = datetime.now(timezone(timedelta(hours=5))).date()
        self.report = {"started_at": datetime.now(timezone.utc).isoformat(), "frontend_url": self.frontend,
                       "api_url": self.api, "mode": "synthetic_demo_writes" if args.write_demo else "read_only",
                       "checks": [], "created_ids": {}, "qa_marker": self.marker,
                       "limitations": ["HTTP/SSR checks do not replace hydrated browser interaction tests.",
                                       "No private input files are read or transmitted; every fixture is generated in memory.",
                                       "Import fingerprint protection is observed through API batch IDs, duplicate counts and exact ledger/stock effects; fingerprint-table internals are not publicly exposed.",
                                       "The public unauthenticated demo must contain synthetic data only."]}

    def request(self, method, url, body=None, content_type=None, expected=(200,)):
        headers = {"User-Agent": "SAQTA-product-update-verification/1.0"}
        if self.include_verification and url.startswith(self.api + "/"):
            headers["X-SAQTA-Verification"] = "include"
        if content_type:
            headers["Content-Type"] = content_type
        try:
            response = urlopen(Request(url, data=body, method=method, headers=headers), timeout=self.args.timeout)
        except HTTPError as exc:
            response = exc
        except (URLError, TimeoutError, OSError) as exc:
            raise VerificationError(f"{method} {urlsplit(url).path}: {type(exc).__name__}") from exc
        with response:
            require(response.status in expected, f"{method} {urlsplit(url).path}: expected {expected}, got HTTP {response.status}")
            final_url = response.geturl()
            try:
                public_url(urlsplit(final_url)._replace(query="", fragment="").geturl(), self.args.allow_local)
            except argparse.ArgumentTypeError as exc:
                raise VerificationError(str(exc)) from exc
            content = response.read(8 * 1024 * 1024 + 1)
            require(len(content) <= 8 * 1024 * 1024, "Verification response exceeds 8 MiB")
            value = json.loads(content) if "application/json" in response.headers.get("Content-Type", "") else content.decode("utf-8", errors="replace")
            return response.status, value, final_url

    def get(self, path):
        return self.request("GET", self.api + path)[1]

    def json(self, method, path, data, expected=(200,)):
        return self.request(method, self.api + path, json.dumps(data).encode(), "application/json", expected)[1]

    def upload(self, endpoint, content, filename, fields, expected=(200,)):
        boundary = "saqtaqa" + uuid.uuid4().hex
        pieces = []
        for key, value in fields.items():
            pieces.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
        pieces.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode())
        pieces.extend([content, f'\r\n--{boundary}--\r\n'.encode()])
        status, value, _ = self.request("POST", self.api + "/imports/" + endpoint, b"".join(pieces),
                                        f"multipart/form-data; boundary={boundary}", expected)
        return status, value

    def check(self, name: str, action: Callable):
        started = time.monotonic()
        try:
            details = action()
            entry = {"name": name, "status": "passed", "details": details}
        except Exception as exc:
            entry = {"name": name, "status": "failed", "error": str(exc)}
        entry["duration_seconds"] = round(time.monotonic() - started, 3)
        self.report["checks"].append(entry)
        print(entry["status"].upper() + " " + name + (": " + entry["error"] if "error" in entry else ""), flush=True)
        return entry["status"] == "passed"

    def remember(self, key, value):
        self.report["created_ids"].setdefault(key, []).append(value)

    def pages(self):
        paths = ["/", "/about", "/save"] + ["/forecast?view=" + tab for tab in ("forecast", "data", "results", "savings", "pricing")]
        results = []
        for path in paths:
            _, html, final = self.request("GET", self.frontend + path)
            require("SAQTA" in html and 'lang="ru"' in html, f"Missing Russian SAQTA page: {path}")
            parsed = VisibleHTML()
            parsed.feed(html)
            visible = " ".join(parsed.parts)
            require(not re.search(r"\b(?:CAC|LTV|ARR)\b", visible, re.IGNORECASE), f"Public startup economics prose found at {path}")
            require(parsed.main_navigation == ["/forecast", "/save", "/about"], f"Expected exactly Forecast / Save / About main navigation at {path}")
            results.append({"path": path, "status": 200, "final_path": urlsplit(final).path})
        return results

    def redirects(self):
        expected = {"/dashboard": "/forecast?view=results", "/impact": "/forecast?view=results",
                    "/inventory": "/forecast?view=data", "/settings": "/forecast?view=data&settings=1",
                    "/economics": "/forecast?view=pricing"}
        actual = {}
        for before, after in expected.items():
            _, _, final = self.request("GET", self.frontend + before)
            require(final == self.frontend + after, f"Legacy {before} ended at {final}, expected {after}")
            actual[before] = after
        return actual

    def guard(self):
        self.health, self.settings = self.get("/health"), self.get("/settings")
        require(self.health.get("database") == "connected", "Database is unavailable")
        require(all(value.get("demo_data") is True and value.get("workspace_mode") == "demo" for value in (self.health, self.settings)), "Only confirmed synthetic demo workspaces may be tested")
        self.products, self.locations = self.get("/products"), self.get("/locations")
        require(len(self.products) >= 5 and len(self.locations) >= 1, "Missing seeded reference data")
        schema = self.request("GET", self.origin + "/openapi.json")[1]
        require("/api/backtest" in schema["paths"], "Typed historical-backtest endpoint is missing")
        require("/api/economics" not in schema["paths"], "Internal unit economics should not be in public OpenAPI")
        for path in ("inspect", "preview", "commit"):
            require("/api/imports/" + path in schema["paths"], f"Missing import {path} endpoint")
        return {"demo_data": True, "workspace_mode": "demo", "product_count": len(self.products), "location_count": len(self.locations), "internal_economics_in_public_schema": False}

    def predict(self, prior, day):
        recent = mean(row["sales"] for row in prior[-7:])
        weekday = date.fromisoformat(day).weekday()
        same = [row["sales"] for row in prior if date.fromisoformat(row["date"]).weekday() == weekday][-4:]
        return 0.6 * recent + 0.4 * mean(same) if same else recent

    def backtest(self, product_id, location_id, cutoff=None):
        params = {"product_id": product_id, "location_id": location_id, "test_days": 7, "min_train_days": 14}
        if cutoff:
            params["end_date"] = cutoff
        result = self.get("/backtest?" + urlencode(params))
        history = self.get("/history?" + urlencode({"product_id": product_id, "location_id": location_id}))
        history = sorted((row for row in history if not cutoff or row["date"] <= cutoff), key=lambda row: row["date"])
        require(result["demo_data"] is True and result["data_source"] == "synthetic", "Backtest mislabels synthetic observations")
        require(result["history_days"] == len(history), "History count includes fabricated/missing calendar days")
        if len(history) < 21:
            require(result["status"] == "insufficient_history" and result["points"] == [] and result["evaluation_points"] == 0, "Insufficient history must not return test predictions")
            require(result["metrics"] == {"mae": None, "wape_percent": None} and result["naive_metrics"] == {"mae": None, "wape_percent": None}, "Insufficient history must not invent accuracy")
            return {"status": result["status"], "history_days": len(history), "metrics": result["metrics"]}
        errors, naive_errors, actuals = [], [], []
        require(result["status"] == "ok" and result["evaluation_points"] == len(result["points"]) == 7, "Expected seven genuine held-out observations")
        for index, point in enumerate(result["points"], start=len(history) - 7):
            prior, actual = history[:index], history[index]
            prediction, naive = self.predict(prior, actual["date"]), prior[-1]["sales"]
            error, naive_error = abs(prediction - actual["sales"]), abs(naive - actual["sales"])
            require(point["date"] == actual["date"] and point["actual"] == actual["sales"], "Backtest actual differs from source ledger")
            require(point["training_observations"] == len(prior) and point["training_end_date"] == prior[-1]["date"] < point["date"], "Chronological training leaked current/future data")
            for field, expected in (("predicted", prediction), ("naive_predicted", naive), ("absolute_error", error), ("naive_absolute_error", naive_error)):
                require(math.isclose(point[field], expected, abs_tol=0.00011), f"Independent backtest recomputation differs: {field}")
            errors.append(error)
            naive_errors.append(naive_error)
            actuals.append(actual["sales"])
        for metrics, values in ((result["metrics"], errors), (result["naive_metrics"], naive_errors)):
            require(math.isclose(metrics["mae"], round(mean(values), 2), abs_tol=0.001), "MAE formula mismatch")
            wape = round(sum(values) / sum(actuals) * 100, 2) if sum(actuals) else None
            require(metrics["wape_percent"] == wape, "WAPE denominator or formula mismatch")
        improvement = round((mean(naive_errors) - mean(errors)) / mean(naive_errors) * 100, 2) if mean(naive_errors) else None
        require(result["mae_improvement_percent"] == improvement, "Naive-baseline improvement mismatch")
        require(bool(result["warnings"]) and bool(result["requirements"]), "Accuracy limitations must be provided")
        return {"product_id": product_id, "history_days": len(history), "held_out_points": 7, "metrics": result["metrics"], "naive_metrics": result["naive_metrics"], "cutoff": cutoff}

    def seeded_backtest(self):
        require(bool(self.products) and bool(self.locations), "Reference guard must pass first")
        product_id, location_id = self.products[0]["id"], self.locations[0]["id"]
        full = self.backtest(product_id, location_id)
        history = self.get("/history?" + urlencode({"product_id": product_id, "location_id": location_id}))
        short = self.backtest(product_id, location_id, sorted(row["date"] for row in history)[19])
        return {"full": full, "cutoff_insufficient": short}

    def stock(self):
        return next(row for row in self.get("/inventory?" + urlencode({"location_id": self.location_id})) if row["product_id"] == self.product_id)

    def records(self, kind="production"):
        params = {"kind": kind, "location_id": self.location_id, "start_date": (self.today - timedelta(days=40)).isoformat(), "end_date": self.today.isoformat(), "page_size": 500}
        rows, page = [], 1
        while True:
            response = self.get("/records?" + urlencode({**params, "page": page}))
            rows.extend(row for row in response["items"] if row["product_id"] == self.product_id)
            if page * 500 >= response["total"]:
                break
            page += 1
        return rows

    def options(self, **changes):
        return {"source_origin": "demo", "source_label": self.marker, **changes}

    def fields(self, options, token=None, confirm="IMPORT SAQTA"):
        return {"options": json.dumps(options, ensure_ascii=False), **({"preview_token": token, "confirm": confirm} if token is not None else {})}

    def preview(self, content, name, options):
        return self.upload("preview", content, name, self.fields(options))[1]

    def commit(self, content, name, options, token, expected=(200,), confirm="IMPORT SAQTA"):
        status, result = self.upload("commit", content, name, self.fields(options, token, confirm), expected)
        if result.get("batch_id") is not None:
            self.remember("import_batches", result["batch_id"])
        return status, result

    def origin_refusal(self):
        # An invalid synthetic XLSX proves origin admission precedes workbook parsing.
        refused = {}
        options = self.options(source_origin="real", column_mapping={})
        for endpoint in ("inspect", "preview", "commit"):
            fields = {"source_origin": "real"} if endpoint == "inspect" else self.fields(options)
            if endpoint == "commit":
                fields.update(preview_token="not-a-real-token", confirm="IMPORT SAQTA")
            status, _ = self.upload(endpoint, b"SYNTHETIC INVALID XLSX: never private data", "synthetic-invalid.xlsx", fields, (409,))
            refused[endpoint] = status
        return {"refused_before_workbook_parsing": refused, "private_data_read_or_sent": False}

    def csv_fixture(self):
        stream = io.StringIO(newline="")
        writer = csv.writer(stream, delimiter=";")
        writer.writerow(["Дата", "Количество", "Тип", "Товар", "Точка", "Единица"])
        for offset in range(21):
            day = self.today - timedelta(days=21 - offset)
            sales = 4 + offset * 3 % 8 + (4 if offset % 7 in (5, 6) else 0)
            for kind, quantity in (("production", 15), ("sales", sales)):
                writer.writerow([day.strftime("%d.%m.%Y"), str(quantity) + ",0", kind, self.product_id, self.location_id, "шт."])
        return stream.getvalue().encode("utf-8"), self.options(column_mapping={"date": "Дата", "quantity": "Количество", "kind": "Тип", "product": "Товар", "location": "Точка", "unit": "Единица"}, date_format="dmy", number_format="comma")

    def csv_import(self):
        content, options = self.csv_fixture()
        before = self.stock()
        counts = {kind: len(self.records(kind)) for kind in ("production", "sales")}
        inspected = self.upload("inspect", content, "qa-synthetic.csv", {"source_origin": "demo"})[1]
        require(inspected["file_sha256"] == hashlib.sha256(content).hexdigest(), "CSV source content hash mismatch")
        require(inspected["sheets"][0]["row_count"] == 42 and inspected["suggested_mapping"]["date"] == "Дата", "CSV inspection/mapping is incomplete")
        missing = self.preview(content, "qa-synthetic.csv", self.options())
        require(missing["can_commit"] is False and missing["errors"], "Missing mapping must require explicit choices")
        preview = self.preview(content, "qa-synthetic.csv", options)
        require(preview["can_commit"] and preview["valid_rows"] == 42 and preview["duplicate_rows"] == 0 and preview["rejected_rows"] == 0, "Mapped CSV preview rejected valid synthetic history")
        require(self.stock() == before and all(len(self.records(kind)) == count for kind, count in counts.items()), "Inspect/preview wrote ledger or stock")
        self.commit(content, "qa-synthetic.csv", options, preview["preview_token"], expected=(422,), confirm="NOT CONFIRMED")
        self.commit(content, "qa-synthetic.csv", options, "0" * 64, expected=(409,))
        require(self.stock() == before, "Rejected confirmation/token changed stock")
        _, committed = self.commit(content, "qa-synthetic.csv", options, preview["preview_token"])
        require(committed["imported_count"] == 42 and committed["duplicate_count"] == 0, "Confirmed CSV did not atomically import all rows")
        require(all(len(self.records(kind)) == counts[kind] + 21 for kind in counts), "Committed CSV ledger count mismatch")
        after = self.stock()
        expected_stock = sum(row["record"]["quantity"] * (1 if row["record"]["kind"] == "production" else -1) for row in preview["preview_rows"])
        require(after["on_hand"] == before["on_hand"] + expected_stock and after["reserved"] == before["reserved"], "Imported stock delta mismatch")
        _, repeated = self.commit(content, "renamed-synthetic.csv", options, preview["preview_token"])
        require(repeated["imported_count"] == 0 and repeated["duplicate_count"] == 42 and repeated["batch_id"] is None, "Repeated renamed CSV was not deduplicated")
        require(self.stock() == after, "Repeated CSV changed stock")
        self.report["fixtures"] = {"csv_sha256": hashlib.sha256(content).hexdigest(), "csv_rows": 42}
        return {"rows": 42, "batch_id": committed["batch_id"], "repeat_imported": 0, "repeat_duplicates": 42, "stock_delta": expected_stock, "preview_no_write": True, "explicit_confirmation_and_token_guards": True}

    def invalid_atomic(self):
        content = f"date,quantity\n{self.today.isoformat()},2\n{self.today.isoformat()},-1\n".encode()
        options = self.options(column_mapping={"date": "date", "quantity": "quantity"}, default_kind="production", default_product_id=self.product_id, default_location_id=self.location_id)
        before, records = self.stock(), len(self.records())
        preview = self.preview(content, "synthetic-invalid.csv", options)
        require(not preview["can_commit"] and preview["rejected_rows"] == 1 and any(error["row"] == 3 for error in preview["errors"]), "Invalid row must report its source row number")
        self.commit(content, "synthetic-invalid.csv", options, preview["preview_token"], expected=(422,))
        require(self.stock() == before and len(self.records()) == records, "Invalid batch partially wrote a valid row")
        return {"rejected_row": 3, "commit_http_status": 422, "valid_row_partially_imported": False}

    def xlsx_import(self):
        content = xlsx_fixture([["Когда", "Объём"], [self.today.isoformat(), 3]])
        before, records = self.stock(), len(self.records())
        inspected = self.upload("inspect", content, "synthetic-generated.xlsx", {"source_origin": "demo"})[1]
        require([sheet["name"] for sheet in inspected["sheets"]] == ["Notes", "History"], "XLSX sheet inspection failed")
        require(inspected["file_sha256"] == hashlib.sha256(content).hexdigest(), "XLSX source content hash mismatch")
        options = self.options(sheet="History", column_mapping={"date": "Когда", "quantity": "Объём"}, default_kind="production", default_product_id=self.product_id, default_location_id=self.location_id)
        preview = self.preview(content, "synthetic-generated.xlsx", options)
        require(preview["can_commit"] and preview["valid_rows"] == 1 and preview["selected_sheet"] == "History", "Explicit XLSX sheet/mapping failed")
        require(self.stock() == before and len(self.records()) == records, "XLSX preview changed persistence")
        _, committed = self.commit(content, "synthetic-generated.xlsx", options, preview["preview_token"])
        require(committed["imported_count"] == 1 and self.stock()["on_hand"] == before["on_hand"] + 3 and len(self.records()) == records + 1, "XLSX import persistence mismatch")
        _, repeated = self.commit(content, "renamed-generated.xlsx", options, preview["preview_token"])
        require(repeated["imported_count"] == 0 and repeated["duplicate_count"] == 1, "XLSX repeat was not deduplicated")
        self.report.setdefault("fixtures", {})["xlsx_sha256"] = hashlib.sha256(content).hexdigest()
        return {"sheets": ["Notes", "History"], "selected": "History", "batch_id": committed["batch_id"], "imported": 1, "repeat_imported": 0}

    def import_race(self):
        content = f"date,quantity\n{self.today.isoformat()},1\n".encode()
        options = self.options(column_mapping={"date": "date", "quantity": "quantity"}, default_kind="production", default_product_id=self.product_id, default_location_id=self.location_id)
        preview = self.preview(content, "synthetic-race.csv", options)
        require(preview["valid_rows"] == 1 and preview["can_commit"], "Race fixture must be a unique eligible record")
        before, before_records = self.stock(), self.records()
        barrier = Barrier(2)
        def attempt(name):
            barrier.wait(timeout=10)
            started = datetime.now(timezone.utc).isoformat()
            status, result = self.upload("commit", content, "synthetic-race.csv", self.fields(options, preview["preview_token"]), (200, 409))
            return {"attempt": name, "started_at": started, "http_status": status, "result": result}
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(attempt, name) for name in ("A", "B")]
            outcomes = [future.result(timeout=self.args.timeout + 15) for future in futures]
        for outcome in outcomes:
            if outcome["result"].get("batch_id") is not None:
                self.remember("import_batches", outcome["result"]["batch_id"])
        accepted = [row for row in outcomes if row["http_status"] == 200 and row["result"].get("imported_count") == 1]
        rejected = [row for row in outcomes if row["http_status"] == 409 or row["http_status"] == 200 and row["result"].get("imported_count") == 0 and row["result"].get("duplicate_count") == 1]
        require(len(accepted) == len(rejected) == 1, "Concurrent identical imports did not have exactly one effective commit")
        after_records = self.records()
        added = [row for row in after_records if row["id"] not in {old["id"] for old in before_records}]
        after = self.stock()
        require(len(added) == 1 and added[0]["quantity"] == 1 and added[0]["date"] == self.today.isoformat(), "Import race persisted duplicate or unexpected records")
        require(after["on_hand"] == before["on_hand"] + 1 and after["reserved"] == before["reserved"], "Import race incremented stock more than once")
        repeat = self.preview(content, "race-renamed.csv", options)
        require(repeat["duplicate_rows"] == 1 and repeat["valid_rows"] == 0 and not repeat["can_commit"], "Committed semantic fingerprint was not observed by later preview")
        self.remember("race_production_records", added[0]["id"])
        return {"file_sha256": hashlib.sha256(content).hexdigest(), "preview_token": preview["preview_token"], "outcomes": outcomes, "persisted_record_ids": [added[0]["id"]], "ledger_increment": 1, "stock_increment": 1, "repeat_duplicate_rows": 1}

    def explained_forecast(self):
        # Keep two units to exercise a positive recommendation, without changing seed products.
        before = self.stock()
        if before["available"] > 2:
            trim = self.json("POST", "/records", {"kind": "waste", "product_id": self.product_id, "location_id": self.location_id, "date": self.today.isoformat(), "quantity": before["available"] - 2, "reason": self.marker + "; synthetic balance for forecast verification"}, (201,))
            self.remember("synthetic_waste_records", trim["id"])
        target = (self.today + timedelta(days=1)).isoformat()
        result = self.json("POST", "/forecasts", {"product_id": self.product_id, "location_id": self.location_id, "target_date": target, "horizon_days": 3}, (201,))
        self.remember("forecasts", result["id"])
        explanation = result["explanation_components"]
        require(len(explanation["days"]) == 3 and explanation["existing_inventory"] == result["existing_inventory"] == 2, "Forecast explanation lost existing inventory")
        history = sorted(result["history"], key=lambda row: row["date"])
        require(explanation["history_days"] == len(history) and explanation["limitations"], "Forecast explanation requires history and limitations")
        remaining = result["existing_inventory"]
        demand_total = production_total = 0
        for offset, day in enumerate(explanation["days"]):
            expected_date = (date.fromisoformat(target) + timedelta(days=offset)).isoformat()
            require(day["date"] == expected_date, "Explanation date mismatch")
            recent = history[-7:]
            same = [row for row in history if date.fromisoformat(row["date"]).weekday() == date.fromisoformat(expected_date).weekday()][-4:]
            def sample(rows):
                return [{"date": row["date"], "sales": row["sales"]} for row in rows]
            require(day["recent_sales"] == sample(recent) and day["same_weekday_sales"] == sample(same), "Explained samples differ from prior history")
            require(all(row["date"] < target for row in day["recent_sales"] + day["same_weekday_sales"]), "Forecast explanation includes future observations")
            predicted = self.predict(history, expected_date)
            demand = round(predicted)
            buffered = (demand * (100 + explanation["safety_buffer_percent"]) + 99) // 100
            production = max(0, buffered - remaining)
            require(math.isclose(day["recent_mean"], mean(row["sales"] for row in recent), abs_tol=0.0001), "Recent mean explanation mismatch")
            require(day["same_weekday_mean"] == (mean(row["sales"] for row in same) if same else None), "Same-weekday mean explanation mismatch")
            require(day["recent_weight"] == (0.6 if same else 1) and day["same_weekday_weight"] == (0.4 if same else 0), "Forecast weights are not transparent")
            require(math.isclose(day["weighted_demand"], predicted, abs_tol=0.0001), "Weighted demand calculation mismatch")
            require(day["predicted_demand"] == demand and day["available_inventory"] == remaining and day["buffered_demand"] == buffered and day["recommended_production"] == production, "Inventory/buffer recommendation formula mismatch")
            require(bool(day["production_formula"]) and bool(day["demand_formula"]), "Missing human-readable formulas")
            remaining = max(0, remaining - demand)
            demand_total += demand
            production_total += production
        require(result["predicted_demand"] == demand_total and result["recommended_production"] == production_total > 0, "Forecast totals do not reconcile")
        require(result["expected_surplus"] == max(0, result["existing_inventory"] + production_total - demand_total), "Expected surplus formula mismatch")
        saved = self.get("/forecasts?" + urlencode({"product_id": self.product_id, "location_id": self.location_id}))
        require(any(row["id"] == result["id"] and row["explanation_components"] == explanation for row in saved), "Explanation was not persisted with the forecast")
        return {"forecast_id": result["id"], "horizon": 3, "demand": demand_total, "production": production_total, "existing_inventory": 2, "independently_recomputed": True}

    def cleanup(self):
        if self.product_id is None:
            return {"qa_product_created": False}
        row = self.stock()
        require(row["reserved"] == 0, "Unexpected reservation on isolated QA product; manual cleanup needed")
        if row["available"]:
            waste = self.json("POST", "/records", {"kind": "waste", "product_id": self.product_id, "location_id": self.location_id, "date": self.today.isoformat(), "quantity": row["available"], "reason": self.marker + "; synthetic cleanup only, no physical food"}, (201,))
            self.remember("synthetic_waste_records", waste["id"])
        self.json("PATCH", f"/products/{self.product_id}", {"is_active": False})
        require(self.stock()["on_hand"] == 0, "QA stock was not cleared")
        return {"product_id": self.product_id, "is_active": False, "on_hand": 0, "trace_records_retained": True, "reset_or_deletion": False, "synthetic_writeoff_cost_and_weight": 0}

    def writes(self):
        require(self.health and self.settings and self.health.get("demo_data") is True and self.settings.get("workspace_mode") == "demo", "Write guard failed; no private or real workspace mutations allowed")
        self.include_verification = True
        self.location_id = self.locations[0]["id"]
        product = self.json("POST", "/products", {"name": self.marker, "category": "QA SYNTHETIC", "unit": "шт.", "price_kzt": 500, "cost_kzt": 0, "weight_grams": 0, "is_test_data": True}, (201,))
        self.product_id = product["id"]
        self.remember("products", self.product_id)
        try:
            self.check("isolated empty-history backtest has no invented accuracy", lambda: self.backtest(self.product_id, self.location_id))
            if self.check("CSV inspect mapping preview confirmation persistence and deduplication", self.csv_import):
                self.check("invalid CSV batch is rejected atomically", self.invalid_atomic)
                self.check("isolated synthetic historical backtest recomputes MAE WAPE and naive metrics", lambda: self.backtest(self.product_id, self.location_id))
                self.check("XLSX sheet selection preview atomic commit and repeat deduplication", self.xlsx_import)
                self.check("two concurrent identical imports have exactly one effective commit", self.import_race)
                self.check("forecast explanation reproduces demand and sequential production formulas", self.explained_forecast)
        finally:
            self.check("isolated synthetic QA cleanup", self.cleanup)
            self.include_verification = False
        return {"qa_product_id": self.product_id}

    def run(self):
        self.check("three-product public navigation pages and no public CAC LTV ARR", self.pages)
        self.check("legacy URLs redirect to exact Forecast views", self.redirects)
        guarded = self.check("demo database guard typed backtest import contracts and hidden internal economics", self.guard)
        if guarded:
            self.check("seeded chronological backtest independent recomputation and insufficient cutoff", self.seeded_backtest)
            if self.args.write_demo:
                self.check("real-origin upload refused before workbook parsing", self.origin_refusal)
                self.check("synthetic import and explainable forecast workflows", self.writes)
        elif self.args.write_demo:
            self.check("no writes after failed demo guard", lambda: require(False, "Demo API guard failed; no writes attempted"))
        failures = sum(row["status"] == "failed" for row in self.report["checks"])
        self.report["finished_at"] = datetime.now(timezone.utc).isoformat()
        self.report["summary"] = {"passed": len(self.report["checks"]) - failures, "failed": failures, "success": failures == 0}
        target = Path(self.args.report).resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + "." + uuid.uuid4().hex + ".tmp")
        temporary.write_text(json.dumps(self.report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, target)
        print(json.dumps({"summary": self.report["summary"], "created_ids": self.report["created_ids"], "report": str(target)}, indent=2), flush=True)
        return 1 if failures else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--frontend-url", required=True)
    parser.add_argument("--api-url", required=True, help="API base ending in /api")
    parser.add_argument("--allow-local", action="store_true")
    parser.add_argument("--write-demo", action="store_true", help="Explicitly enable isolated synthetic demo import/forecast mutations")
    parser.add_argument("--report", default="artifacts/product-update-live.json")
    parser.add_argument("--timeout", type=float, default=55)
    args = parser.parse_args()
    try:
        args.frontend_url = public_url(args.frontend_url, args.allow_local)
        args.api_url = public_url(args.api_url, args.allow_local)
    except argparse.ArgumentTypeError as exc:
        parser.error(str(exc))
    if urlsplit(args.frontend_url).path or not args.api_url.endswith("/api"):
        parser.error("Frontend must be an origin; API base must end in /api")
    if not 0 < args.timeout <= 60:
        parser.error("Timeout must be between 0 and 60 seconds")
    return Verifier(args).run()


if __name__ == "__main__":
    sys.exit(main())
