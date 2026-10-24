#!/usr/bin/env python3
"""Verify SAQTA architecture using HTTP and generated synthetic fixtures only.

Default is read-only. --write-demo enables explicit test-marked records in a
confirmed DEMO workspace. No private files, credentials, reset or deletion.
Run only after the requested target release and migrations are ready.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
from datetime import datetime, timedelta, timezone
import io
import json
import os
from pathlib import Path
import re
import sys
from threading import Barrier
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
import uuid

from verify_live import VerificationError, public_url, require
from verify_product_update import Verifier as ProductVerifier, VisibleHTML, xlsx_fixture


class HTTP(ProductVerifier):
    include_verification = False
    write_authorized = False

    def request(self, method, url, body=None, content_type=None, expected=(200,)):
        is_api = url.startswith(self.api + "/")
        if is_api and method in {"POST", "PATCH"}:
            require(self.write_authorized and self.args.write_demo, "Synthetic writes require --write-demo and a passed DEMO guard")
        headers = {"User-Agent": "SAQTA-architecture-verification/1.0"}
        if self.include_verification and is_api:
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
            public_url(urlsplit(final_url)._replace(query="", fragment="").geturl(), self.args.allow_local)
            content = response.read(8 * 1024 * 1024 + 1)
            require(len(content) <= 8 * 1024 * 1024, "Verification response exceeds 8 MiB")
            value = json.loads(content) if "application/json" in response.headers.get("Content-Type", "") else content.decode("utf-8", errors="replace")
            return response.status, value, final_url


class ArchitectureVerifier(HTTP):
    def __init__(self, args):
        super().__init__(args)
        self.marker = "QA ARCHITECTURE " + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + " " + uuid.uuid4().hex[:6]
        self.report["qa_marker"] = self.marker
        self.report["limitations"] = [
            "Only generated synthetic fixtures are used. No private file is read or transmitted.",
            "QA product/listing/order flags hide this run from ordinary DEMO catalog and analytics.",
            "HTTP/SSR assertions do not replace hydrated browser navigation and responsive layout checks.",
            "All monetary settlement checks are business-model accounting; no payment is processed.",
            "Read endpoints may release expired reservations through normal application behavior.",
        ]
        self.qa = HTTP(args)
        self.qa.include_verification = True
        self.qa_products = []
        self.qa_listings = []
        self.pending = set()
        self.default_dashboard = self.default_impact = None
        self.observation_product_id = self.market_product_id = None

    def guard(self):
        result = super().guard()
        require(len(self.products) == 5 and len(self.locations) == 2, "Expected exactly five visible seed products and two demo locations; no mutation attempted")
        subscription = self.get("/subscription")
        require(subscription["access_mode"] == "demo" and subscription["active"] is False and subscription["status"] == "demo", "DEMO must not impersonate a paid subscription")
        require(subscription["usage"]["forecast_runs"] == 0, "DEMO must not consume real paid quota")
        schema = self.request("GET", self.origin + "/openapi.json")[1]
        require("/api/forecast-runs" in schema["paths"], "Assortment endpoint is missing from OpenAPI")
        self.location_id = self.locations[0]["id"]
        self.default_dashboard, self.default_impact = self.get("/dashboard"), self.get("/impact")
        return {**result, "subscription": {key: subscription[key] for key in ("plan", "status", "active", "access_mode")}, "visible_seed_only": True}

    def pages(self):
        result = super().pages()
        for path in ("/forecast", "/save", "/about"):
            _, html, _ = self.request("GET", self.frontend + path)
            require('id="workspace-sidebar"' in html, f"Persistent workspace sidebar is missing on {path}")
            parser = VisibleHTML()
            parser.feed(html)
            require(parser.main_navigation == ["/forecast", "/save", "/about"], "Main navigation disappeared or duplicated")
            require(not re.search(r"\b(?:CAC|LTV|ARR)\b", " ".join(parser.parts), re.I), "Internal startup economics became visible")
        return result

    def assortment(self):
        payload = {"target_date": (self.today + timedelta(days=1)).isoformat(), "horizon_days": 1,
                   "idempotency_key": "architecture-" + uuid.uuid4().hex}
        first = self.json("POST", "/forecast-runs", payload, (201,))
        repeat = self.json("POST", "/forecast-runs", payload, (201,))
        expected = {(product["id"], location["id"]) for product in self.products for location in self.locations}
        require({(item["product_id"], item["location_id"]) for item in first["items"]} == expected, "Automatic run did not include the complete visible assortment")
        require(first == repeat and first["summary"]["item_count"] == first["summary"]["eligible_count"] == 10, "Assortment replay or eligible count differs")
        require(first["summary"]["predicted_demand"] == sum(item["predicted_demand"] for item in first["items"]), "Assortment totals do not reconcile")
        require(all(item["demo_data"] and item["data_source"] == "synthetic" for item in first["items"]), "Seed data was presented as real measurements")
        require(self.get("/subscription")["usage"]["forecast_runs"] == 0, "DEMO run consumed a paid allowance")
        self.remember("forecast_runs", first["run_id"])
        return {"run_id": first["run_id"], "products": 5, "locations": 2, "items": 10, "replay_identical": True}

    def new_product(self, suffix, price=4000):
        product = self.qa.json("POST", "/products", {"name": self.marker + " " + suffix, "category": "Synthetic verification",
            "unit": "шт.", "price_kzt": price, "cost_kzt": 0, "weight_grams": 0, "is_test_data": True}, (201,))
        self.qa_products.append(product["id"])
        self.remember("products", product["id"])
        require(product["id"] not in {row["id"] for row in self.get("/products")}, "Test product leaked into the ordinary catalog")
        return product["id"]

    def qa_stock(self, product_id):
        return next(row for row in self.qa.get("/inventory?" + urlencode({"location_id": self.location_id})) if row["product_id"] == product_id)

    def ledger_ids(self, product_id):
        result = {}
        for kind in ("production", "sales", "waste"):
            query = {"kind": kind, "location_id": self.location_id, "start_date": (self.today - timedelta(days=45)).isoformat(), "end_date": self.today.isoformat(), "page_size": 500}
            ids, page = [], 1
            while True:
                response = self.qa.get("/records?" + urlencode({**query, "page": page}))
                ids.extend(row["id"] for row in response["items"] if row["product_id"] == product_id)
                if page * 500 >= response["total"]:
                    break
                page += 1
            result[kind] = ids
        return result

    def observation_fixture(self, product_id, offset):
        rows = [["Date", "Product", "Sold", "Remaining", "Produced"]]
        for index in range(21):
            rows.append([(self.today - timedelta(days=offset + 20 - index)).isoformat(), product_id,
                         0 if index % 7 == 0 else 8 + index % 5, "", ""])
        return rows

    def observation_options(self, product_id, sheet=None):
        return {"mode": "observations", "source_origin": "demo", "source_label": self.marker,
                "default_location_id": self.location_id, "default_product_id": product_id,
                "column_mapping": {"date": "Date", "product": "Product", "sold": "Sold", "remaining": "Remaining", "produced": "Produced"},
                **({"sheet": sheet} if sheet else {})}

    def commit_observations(self, content, filename, options, expected_count):
        inspect = self.qa.upload("inspect", content, filename, {"source_origin": "demo"})[1]
        require(inspect["suggested_mode"] == "observations" or filename.endswith("xlsx"), "Sales columns were not recognized")
        preview = self.qa.upload("preview", content, filename, {"options": json.dumps(options)})[1]
        require(preview["can_commit"] and preview["valid_rows"] == expected_count and preview["rejected_rows"] == 0, "Valid observed sales failed preview")
        require(preview["missing_values"]["remaining"] == expected_count and preview["missing_values"]["produced"] == expected_count, "Missing optional stock/production values were hidden")
        require(all(row["record"]["remaining"] is None and row["record"]["produced"] is None for row in preview["preview_rows"]), "Missing stock was fabricated")
        committed = self.qa.upload("commit", content, filename, {"options": json.dumps(options), "preview_token": preview["preview_token"], "confirm": "IMPORT SAQTA"})[1]
        require(committed["imported_count"] == expected_count, "Observation commit count mismatch")
        self.remember("import_batches", committed["batch_id"])
        repeat = self.qa.upload("preview", content, filename, {"options": json.dumps(options)})[1]
        require(repeat["duplicate_rows"] == expected_count and repeat["valid_rows"] == 0 and not repeat["can_commit"], "Repeated file was not deduplicated")
        repeated_commit = self.qa.upload("commit", content, filename, {"options": json.dumps(options), "preview_token": repeat["preview_token"], "confirm": "IMPORT SAQTA"})[1]
        require(repeated_commit["imported_count"] == 0, "Duplicate commit created new observations")
        return {"imported": expected_count, "duplicate_repeat": expected_count, "batch_id": committed["batch_id"]}

    def observation_imports(self):
        product_id = self.new_product("observations")
        self.observation_product_id = product_id
        options = self.observation_options(product_id)
        before = self.ledger_ids(product_id)
        buffer = io.StringIO(newline="")
        csv.writer(buffer).writerows(self.observation_fixture(product_id, 0))
        content = buffer.getvalue().encode()
        preview = self.qa.upload("preview", content, "synthetic-sales.csv", {"options": json.dumps(options)})[1]
        require(preview["can_commit"] and self.qa.get(f"/history?product_id={product_id}&location_id={self.location_id}") == [], "Preview wrote observed sales")
        csv_result = self.commit_observations(content, "synthetic-sales.csv", options, 21)
        stock = self.qa_stock(product_id)
        require(stock["stock_known"] is False and self.ledger_ids(product_id) == before, "Sales-only import invented ledger movements or stock")
        report = self.qa.json("POST", "/forecast-runs", {"target_date": (self.today + timedelta(days=1)).isoformat(), "location_id": self.location_id}, (201,))
        item = next(row for row in report["items"] if row["product_id"] == product_id)
        require(item["history_days"] == 21 and item["status"] == "missing_inventory" and item["predicted_demand"] is not None, "Observed sales did not support a limited demand forecast")
        require(all(item[field] is None for field in ("available_inventory", "recommended_production", "expected_surplus", "potential_writeoff_cost_kzt")), "Unknown stock produced fabricated recommendations or financial values")
        require(item["data_quality"]["explicit_zero_days"] == 3 and "shortage" not in item["risks"], "Explicit zeros or conditional risk handling is incorrect")
        self.remember("forecast_runs", report["run_id"])
        csv_backtest = self.qa.backtest(product_id, self.location_id)
        xlsx_content = xlsx_fixture(self.observation_fixture(product_id, 21))
        xlsx_result = self.commit_observations(xlsx_content, "synthetic-sales.xlsx", self.observation_options(product_id, "History"), 21)
        require(len(self.qa.get(f"/history?product_id={product_id}&location_id={self.location_id}")) == 42, "XLSX history was not persisted")
        require(self.ledger_ids(product_id) == before and self.qa_stock(product_id)["stock_known"] is False, "XLSX import changed ledger stock")
        return {"csv": csv_result, "xlsx": xlsx_result, "explicit_zero_days": 6, "stock_unknown": True,
                "production_not_invented": True, "backtest": csv_backtest}

    def invalid_imports(self):
        product_id = self.observation_product_id
        require(product_id is not None, "Observation setup did not complete")
        before = self.qa.get(f"/history?product_id={product_id}&location_id={self.location_id}")
        options = self.observation_options(product_id)
        invalid_rows = self.observation_fixture(product_id, 42)
        invalid_rows[2][2] = -1
        buffer = io.StringIO(newline="")
        csv.writer(buffer).writerows(invalid_rows)
        content = buffer.getvalue().encode()
        preview = self.qa.upload("preview", content, "synthetic-invalid.csv", {"options": json.dumps(options)})[1]
        require(not preview["can_commit"] and preview["rejected_rows"] == 1, "Negative sale was not reported")
        self.qa.upload("commit", content, "synthetic-invalid.csv", {"options": json.dumps(options), "preview_token": preview["preview_token"], "confirm": "IMPORT SAQTA"}, (422,))
        self.qa.upload("inspect", b"SYNTHETIC invalid XLSX", "synthetic-invalid.xlsx", {"source_origin": "demo"}, (422,))
        require(self.qa.get(f"/history?product_id={product_id}&location_id={self.location_id}") == before, "Invalid batch partially changed history")
        return {"negative_sales": "rejected_atomically", "corrupt_xlsx": "rejected", "history_unchanged": True}

    def listing(self, quantity):
        now = datetime.now(timezone.utc)
        listing = self.qa.json("POST", "/listings", {"product_id": self.market_product_id, "location_id": self.location_id,
            "quantity": quantity, "discounted_price_kzt": 2000, "pickup_start": (now - timedelta(minutes=1)).isoformat(),
            "pickup_deadline": (now + timedelta(hours=2)).isoformat(), "description": self.marker + "; generated synthetic fixture, no food or payment"}, (201,))
        self.qa_listings.append(listing["id"])
        self.remember("listings", listing["id"])
        require(listing["publication_fee_tiyn"] == 0 and listing["sales_commission_percent"] == 5, "Creating a listing incurred a fee")
        return listing

    def order(self, listing_id, key=None, customer=None, expected=(201,)):
        return self.qa.json("POST", "/orders", {"customer_name": customer or self.marker,
            "items": [{"listing_id": listing_id, "quantity": 1}], **({"idempotency_key": key} if key else {})}, expected)

    def remember_order(self, order):
        self.pending.add(order["id"])
        self.remember("orders", order["id"])

    def cancel(self, order_id):
        cancelled = self.qa.json("POST", f"/orders/{order_id}/cancel", {}, (200,))
        self.pending.discard(order_id)
        require(cancelled["settlement"]["commission_tiyn"] == cancelled["settlement"]["seller_proceeds_tiyn"] == 0, "Cancellation charged commission")
        return cancelled

    def commission(self):
        self.market_product_id = self.new_product("save")
        produced = self.qa.json("POST", "/records", {"kind": "production", "product_id": self.market_product_id,
            "location_id": self.location_id, "date": self.today.isoformat(), "quantity": 12}, (201,))
        self.remember("production_records", produced["id"])
        listing = self.listing(3)
        reserve = self.order(listing["id"], "cancel-" + uuid.uuid4().hex)
        self.remember_order(reserve)
        require(reserve["settlement"]["commission_tiyn"] == reserve["settlement"]["seller_proceeds_tiyn"] == 0, "Reservation charged commission")
        self.cancel(reserve["id"])
        key = "collect-" + uuid.uuid4().hex
        order = self.order(listing["id"], key)
        self.remember_order(order)
        replay = self.order(listing["id"], key)
        require(replay["id"] == order["id"], "Same order key created another order")
        self.order(listing["id"], key, customer="different generated synthetic request", expected=(409,))
        collected = self.qa.json("POST", f"/orders/{order['id']}/collect", {}, (200,))
        self.pending.discard(order["id"])
        settlement = collected["settlement"]
        require(order["total_kzt"] == 2000 and order["items"][0]["original_unit_price_kzt"] == 4000, "Sale did not use the discounted price")
        require(settlement["completed_sale_tiyn"] == 200000 and settlement["commission_tiyn"] == 10000 and settlement["seller_proceeds_tiyn"] == 190000, "Completed 2000 KZT sale must split 100 KZT fee / 1900 KZT seller")
        require(settlement["status"] == "recorded" and settlement["payments_processed"] is False and settlement["recorded_at"], "Settlement falsely implies processed payment")
        self.qa.json("POST", f"/orders/{order['id']}/collect", {}, (409,))
        persisted = next(row for row in self.qa.get("/orders") if row["id"] == order["id"])
        require(persisted["settlement"] == settlement, "Repeated collection changed settlement")
        return {"order_id": order["id"], "discounted_sale_kzt": 2000, "commission_tiyn": 10000,
                "seller_proceeds_tiyn": 190000, "publication_and_reservation_fee": 0, "payments_processed": False}

    def concurrent_orders(self, identical):
        require(self.market_product_id is not None, "Marketplace setup did not complete")
        listing = self.listing(2 if identical else 1)
        barrier = Barrier(2)
        key = "race-" + uuid.uuid4().hex
        def contender(index):
            barrier.wait(timeout=10)
            payload = {"customer_name": self.marker, "items": [{"listing_id": listing["id"], "quantity": 1}],
                       "idempotency_key": key if identical else key + str(index)}
            return self.qa.request("POST", self.api + "/orders", json.dumps(payload).encode(), "application/json", (201, 409))[:2]
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(contender, (0, 1)))
        successful = [body for status, body in responses if status == 201]
        for order in {body["id"]: body for body in successful}.values():
            self.remember_order(order)
        if identical:
            require([status for status, _ in responses] == [201, 201] and len({row["id"] for row in successful}) == 1, "Concurrent identical keys did not return exactly one order")
        else:
            require(sorted(status for status, _ in responses) == [201, 409], "Last-unit race did not allow exactly one order")
        related = [row for row in self.qa.get("/orders") if any(item["listing_id"] == listing["id"] for item in row["items"])]
        require(len(related) == 1 and related[0]["settlement"]["commission_tiyn"] == 0, "Race created duplicate order/commission")
        live = next(row for row in self.qa.get("/listings?status=all") if row["id"] == listing["id"])
        require(live["reserved_quantity"] == 1 and live["available_quantity"] == (1 if identical else 0), "Race changed stock more than once")
        self.cancel(related[0]["id"])
        return {"statuses": [status for status, _ in responses], "unique_orders": 1, "commission_before_collection": 0}

    def hidden_fixtures(self):
        require(not set(self.qa_products) & {row["id"] for row in self.get("/products")}, "QA products leaked")
        require(not set(self.qa_listings) & {row["id"] for row in self.get("/listings?status=all")}, "QA listings leaked")
        order_ids = set(self.report["created_ids"].get("orders", []))
        require(not order_ids & {row["id"] for row in self.get("/orders")}, "QA orders leaked")
        current = self.get("/dashboard")["metrics"]
        for field in ("produced", "sold", "unsold", "written_off", "waste_kg", "loss_kzt"):
            require(current[field] == self.default_dashboard["metrics"][field], f"QA child ledger polluted ordinary dashboard {field}")
        impact = self.get("/impact")
        for field in ("recovered_units", "recovered_weight_kg", "recovered_value_kzt", "written_off_units", "written_off_kg"):
            require(impact[field] == self.default_impact[field], f"QA orders polluted ordinary impact {field}")
        return {"products_hidden": len(self.qa_products), "listings_hidden": len(self.qa_listings), "orders_hidden": len(order_ids), "ordinary_metrics_unchanged": True}

    def cleanup(self):
        for order_id in sorted(self.pending):
            self.cancel(order_id)
        for listing_id in self.qa_listings:
            self.qa.json("PATCH", f"/listings/{listing_id}", {"status": "inactive"})
        for product_id in self.qa_products:
            stock = self.qa_stock(product_id)
            require(stock["reserved"] == 0, "QA cleanup found an unexpected reservation")
            if stock["available"]:
                waste = self.qa.json("POST", "/records", {"kind": "waste", "product_id": product_id,
                    "location_id": self.location_id, "date": self.today.isoformat(), "quantity": stock["available"],
                    "reason": self.marker + "; synthetic zero-cost zero-weight cleanup only"}, (201,))
                self.remember("waste_records", waste["id"])
            self.qa.json("PATCH", f"/products/{product_id}", {"is_active": False})
            require(self.qa_stock(product_id)["on_hand"] == 0, "QA cleanup left synthetic stock")
        return {"deactivated_products": self.qa_products, "deactivated_listings": self.qa_listings,
                "trace_records_retained": True, "delete_or_reset": False, "cleanup_cost_and_weight": 0}

    def writes(self):
        try:
            self.check("real-origin files refused before parsing", self.origin_refusal)
            self.check("automatic all-assortment run and idempotent replay", self.assortment)
            self.check("CSV XLSX observed sales explicit zeros null stock and independent backtest", self.observation_imports)
            self.check("invalid observation batch and broken XLSX rejected atomically", self.invalid_imports)
            self.check("free publication cancelled reservations and 5 percent completed sale", self.commission)
            self.check("two buyers competing for the last unit", lambda: self.concurrent_orders(False))
            self.check("concurrent identical order key creates one order", lambda: self.concurrent_orders(True))
            self.check("test flags hide catalog marketplace ledger and analytics", self.hidden_fixtures)
        finally:
            self.check("isolated synthetic trace-preserving cleanup", self.cleanup)
        self.check("ordinary analytics remain clean after cleanup", self.hidden_fixtures)
        return {"qa_products": self.qa_products, "qa_listings": self.qa_listings}

    def run(self):
        self.check("public product routes persistent sidebar and no public CAC LTV ARR", self.pages)
        self.check("legacy route redirects", self.redirects)
        guarded = self.check("DEMO guard subscription status seed catalog and API contracts", self.guard)
        if self.args.write_demo:
            if guarded:
                self.write_authorized = self.qa.write_authorized = True
                self.check("generated synthetic architecture workflows", self.writes)
            else:
                self.check("refused writes after failed guard", lambda: require(False, "DEMO guard failed; no writes attempted"))
        failures = sum(check["status"] == "failed" for check in self.report["checks"])
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
    parser.add_argument("--api-url", required=True)
    parser.add_argument("--allow-local", action="store_true")
    parser.add_argument("--write-demo", action="store_true")
    parser.add_argument("--report", default="artifacts/architecture-update.json")
    parser.add_argument("--timeout", type=float, default=55)
    args = parser.parse_args()
    try:
        args.frontend_url = public_url(args.frontend_url, args.allow_local)
        args.api_url = public_url(args.api_url, args.allow_local)
    except argparse.ArgumentTypeError as exc:
        parser.error(str(exc))
    if urlsplit(args.frontend_url).path or not args.api_url.endswith("/api"):
        parser.error("Frontend must be an origin and API base must end in /api")
    if not 0 < args.timeout <= 60:
        parser.error("Timeout must be between 0 and 60 seconds")
    return ArchitectureVerifier(args).run()


if __name__ == "__main__":
    sys.exit(main())
