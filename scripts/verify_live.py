#!/usr/bin/env python3
"""Verify deployed SAQTA using only Python's standard library.

Default: HTTP/API read checks. --write-demo explicitly enables synthetic QA
records in a confirmed demo workspace. No reset, deletion, credentials or real
customer data are used. Run from the repository root; see --help.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from statistics import mean
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen


class VerificationError(Exception):
    """Expected check failure without leaking HTTP bodies or credentials."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise VerificationError(message)


def public_url(value: str, allow_local: bool) -> str:
    parsed = urlsplit(value)
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise argparse.ArgumentTypeError("URLs must not contain credentials, query strings or fragments")
    local = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if not parsed.hostname or parsed.scheme != "https" and not (allow_local and local and parsed.scheme == "http"):
        raise argparse.ArgumentTypeError("Use HTTPS; --allow-local permits HTTP only on localhost")
    return value.rstrip("/")


class Client:
    def __init__(self, timeout: float, allow_local: bool):
        self.timeout = timeout
        self.allow_local = allow_local
        self.verification_mode = False

    def fetch(self, url: str, method: str = "GET", payload: dict | None = None,
              expected: int = 200, headers: dict | None = None) -> tuple[Any, dict]:
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request_headers = {"User-Agent": "SAQTA-live-verification/1.0", **(headers or {})}
        if self.verification_mode:
            request_headers["X-SAQTA-Verification"] = "include"
        if body is not None:
            request_headers["Content-Type"] = "application/json"
        request = Request(url, data=body, method=method, headers=request_headers)
        try:
            response = urlopen(request, timeout=self.timeout)
        except HTTPError as exc:
            response = exc
        except (URLError, TimeoutError, OSError) as exc:
            raise VerificationError(f"{method} {urlsplit(url).path}: connection failed ({type(exc).__name__})") from exc
        with response:
            require(response.status == expected,
                    f"{method} {urlsplit(url).path}: expected HTTP {expected}, received {response.status}")
            final_url = urlsplit(response.geturl())._replace(query="", fragment="").geturl()
            public_url(final_url, self.allow_local)
            content = response.read(8 * 1024 * 1024 + 1)
            require(len(content) <= 8 * 1024 * 1024, "Response exceeded 8 MiB verification limit")
            response_headers = dict(response.headers.items())
            if "application/json" in response.headers.get("Content-Type", ""):
                try:
                    return json.loads(content), response_headers
                except (ValueError, UnicodeError) as exc:
                    raise VerificationError("API returned invalid JSON") from exc
            return content.decode("utf-8", errors="replace"), response_headers


class Verifier:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.client = Client(args.timeout, args.allow_local)
        self.frontend = args.frontend_url
        self.api = args.api_url
        self.backend = self.api[:-4]
        self.report: dict[str, Any] = {
            "started_at": datetime.now(timezone.utc).isoformat(),
            "frontend_url": self.frontend, "api_url": self.api,
            "mode": "synthetic_demo_writes" if args.write_demo else "read_only",
            "checks": [], "created_ids": {},
            "limitations": [
                "HTTP/API verification does not replace browser layout and interaction checks.",
                "Public DEMO access is unauthenticated and synthetic only; private REAL authentication is tested separately.",
                "Recovered weight is accounting weight from product-card values, not a measured physical weight.",
                "Read endpoints may release expired demo reservations as part of normal server behavior.",
            ],
        }
        self.health: dict = {}
        self.settings: dict = {}
        self.products: list = []
        self.locations: list = []
        self.stock: list = []

    def check(self, name: str, action: Callable[[], Any]) -> Any:
        started = time.monotonic()
        try:
            result = action()
            entry = {"name": name, "status": "passed", "details": result}
        except (VerificationError, ValueError, KeyError, TypeError, IndexError) as exc:
            result = None
            entry = {"name": name, "status": "failed", "error": str(exc)}
        entry["duration_seconds"] = round(time.monotonic() - started, 3)
        self.report["checks"].append(entry)
        print(f"{entry['status'].upper():6} {name}" + (f": {entry['error']}" if "error" in entry else ""), flush=True)
        return result

    def get(self, path: str) -> Any:
        return self.client.fetch(self.api + path)[0]

    def post(self, path: str, payload: dict | None = None, expected: int = 201) -> Any:
        return self.client.fetch(self.api + path, "POST", payload, expected)[0]

    def patch(self, path: str, payload: dict) -> Any:
        return self.client.fetch(self.api + path, "PATCH", payload)[0]

    def id(self, key: str, value: int) -> None:
        self.report["created_ids"].setdefault(key, []).append(value)

    def page(self, path: str) -> dict:
        html, _ = self.client.fetch(self.frontend + path)
        require(isinstance(html, str) and "SAQTA" in html, "Page is missing the SAQTA brand")
        require('lang="ru"' in html, "Page must declare Russian as its interface language")
        return {"path": path, "http_status": 200}

    def basic_health(self) -> dict:
        self.health = self.get("/health")
        require(self.health.get("status") == "ok" and self.health.get("service") == "SAQTA", "Unexpected health response")
        require(self.health.get("database") == "connected", "Database connection is not healthy")
        require(self.health.get("demo_data") is True and self.health.get("workspace_mode") == "demo", "Expected a synthetic demo workspace")
        return self.health

    def config(self) -> dict:
        self.settings = self.get("/settings")
        require(self.settings.get("demo_data") is True and self.settings.get("workspace_mode") == "demo", "Settings do not confirm a demo workspace")
        require(self.settings.get("currency") == "KZT", "Currency must be KZT")
        require(self.settings.get("auth_enabled") is False, "Update verification assumptions for the new authentication strategy")
        return {key: self.settings[key] for key in ("currency", "demo_data", "workspace_mode", "auth_enabled")}

    def catalog(self) -> dict:
        self.products, self.locations = self.get("/products"), self.get("/locations")
        require(len(self.products) >= 5, "Expected at least five demo products")
        require(len(self.locations) >= 1, "Expected at least one bakery location")
        return {"product_count": len(self.products), "location_count": len(self.locations)}

    def inventory(self) -> dict:
        self.stock = self.get("/inventory")
        require(bool(self.stock), "Inventory is empty")
        for row in self.stock:
            require(min(row["on_hand"], row["reserved"], row["available"]) >= 0, "Inventory contains a negative balance")
            require(row["on_hand"] == row["reserved"] + row["available"], "Inventory balance does not reconcile")
        return {"rows": len(self.stock), "on_hand": sum(row["on_hand"] for row in self.stock)}

    def analytics(self) -> dict:
        dashboard, impact = self.get("/dashboard"), self.get("/impact")
        require(dashboard.get("demo_data") is True and impact.get("demo_data") is True, "Analytics must identify synthetic data")
        require(dashboard["metrics"]["unsold"] == sum(row["on_hand"] for row in self.stock), "Dashboard live stock differs from inventory")
        require(impact.get("potential_avoided_waste_kg") is None, "Avoided-waste claims require additional evidence")
        require(bool(impact.get("methodology")), "Impact methodology is missing")
        return {"dashboard_metrics": dashboard["metrics"], "recovered_units": impact["recovered_units"],
                "recovered_accounting_weight_kg": impact["recovered_weight_kg"]}

    def cors(self) -> dict:
        _, headers = self.client.fetch(self.api + "/health", headers={"Origin": self.frontend})
        value = next((v for k, v in headers.items() if k.lower() == "access-control-allow-origin"), None)
        require(value == self.frontend, "Backend CORS does not allow the exact frontend origin")
        _, preflight = self.client.fetch(self.api + "/orders", "OPTIONS", headers={
            "Origin": self.frontend, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
        allowed = next((v for k, v in preflight.items() if k.lower() == "access-control-allow-origin"), None)
        require(allowed == self.frontend, "Marketplace browser preflight did not allow the frontend")
        return {"allowed_origin": value, "post_preflight": "passed"}

    def docs(self) -> dict:
        schema, _ = self.client.fetch(self.backend + "/openapi.json")
        require(schema["info"]["title"] == "SAQTA API", "OpenAPI title mismatch")
        for path in ("/api/health", "/api/products", "/api/inventory", "/api/forecasts", "/api/orders", "/api/impact"):
            require(path in schema["paths"], f"Missing OpenAPI endpoint {path}")
        html, _ = self.client.fetch(self.backend + "/docs")
        require("swagger-ui" in html, "Interactive API docs unavailable")
        return {"endpoint_count": len(schema["paths"])}

    def assets(self) -> dict:
        for path in ("/brand/saqta-symbol.svg", "/brand/saqta-logo.svg", "/brand/favicon.svg", "/brand/app-icon.svg"):
            svg, _ = self.client.fetch(self.frontend + path)
            require("<svg" in svg, f"{path} is not SVG")
        manifest, _ = self.client.fetch(self.frontend + "/manifest.webmanifest")
        manifest = json.loads(manifest) if isinstance(manifest, str) else manifest
        require("SAQTA" in manifest.get("name", ""), "App manifest brand mismatch")
        return {"svg_assets": 4, "manifest": "SAQTA"}

    def forecast(self) -> dict:
        tomorrow = (datetime.now(timezone(timedelta(hours=5))).date() + timedelta(days=1)).isoformat()
        for product in self.products:
            for location in self.locations:
                history = self.get("/history?" + urlencode({"product_id": product["id"], "location_id": location["id"]}))
                if len(history) < 21:
                    continue
                result = self.post("/forecasts", {"product_id": product["id"], "location_id": location["id"], "target_date": tomorrow, "horizon_days": 1})
                self.id("forecasts", result["id"])
                require(result.get("demo_data") is True, "Forecast missing demo-data flag")
                require(result["method"] == "recent_weekday_baseline_v1", "Unexpected forecast method")
                require(result["predicted_demand"] >= 0 and result["recommended_production"] >= 0, "Negative forecast result")
                history = sorted(result["history"], key=lambda row: row["date"])
                errors = []
                for index in range(max(14, len(history) - 7), len(history)):
                    prior, current = history[:index], history[index]
                    weekday = date.fromisoformat(current["date"]).weekday()
                    same = [r["sales"] for r in prior if date.fromisoformat(r["date"]).weekday() == weekday][-4:]
                    estimate = 0.6 * mean(r["sales"] for r in prior[-7:]) + 0.4 * mean(same) if same else mean(r["sales"] for r in prior[-7:])
                    errors.append(abs(estimate - current["sales"]))
                require(result["evaluation_points"] == len(errors) == 7, "Expected seven chronological held-out predictions")
                require(math.isclose(result["mae"], round(mean(errors), 2), abs_tol=0.001), "MAE differs from independently recalculated held-out errors")
                saved = self.get("/forecasts?" + urlencode({"product_id": product["id"], "location_id": location["id"]}))
                require(any(r["id"] == result["id"] for r in saved), "Forecast was not persisted")
                return {"forecast_id": result["id"], "method": result["method"], "mae": result["mae"], "held_out_points": len(errors)}
        raise VerificationError("No product/location has enough history for held-out forecast evaluation")

    def economics(self) -> dict:
        result = self.post("/economics", {}, expected=200)
        expected = {"revenue_kzt": 30000, "variable_costs_kzt": 9000, "contribution_kzt": 21000,
                    "contribution_percent": 70, "ltv_kzt": 252000, "ltv_cac": 6.3, "arr_kzt": 3600000}
        require(all(result.get(k) == v for k, v in expected.items()), "Illustrative economics formulas differ from documented defaults")
        require(math.isclose(result["cac_payback_months"], 40000 / 21000, abs_tol=0.0001), "CAC payback formula mismatch")
        return result

    def qa_stock(self, product_id: int, location_id: int) -> dict:
        return next(row for row in self.get("/inventory?" + urlencode({"location_id": location_id})) if row["product_id"] == product_id)

    def qa_listing(self, listing_id: int) -> dict:
        return next(row for row in self.get("/listings?status=all") if row["id"] == listing_id)

    def marketplace(self) -> dict:
        now = datetime.now(timezone.utc)
        business_date = now.astimezone(timezone(timedelta(hours=5))).date().isoformat()
        marker = "QA SYNTHETIC " + now.strftime("%Y%m%dT%H%M%SZ") + " " + uuid.uuid4().hex[:8]
        location_id = self.locations[0]["id"]
        product_id = listing_id = None
        pending: set[int] = set()
        self.report["qa_marker"] = marker
        self.client.verification_mode = True
        try:
            product = self.post("/products", {"name": marker, "category": "QA synthetic verification", "unit": "шт.",
                                                   "price_kzt": 1000, "cost_kzt": 400, "weight_grams": 100, "is_test_data": True})
            product_id = product["id"]
            self.id("products", product_id)
            product = self.patch(f"/products/{product_id}", {"name": marker + " edited"})
            require(product["name"] == marker + " edited", "Catalog edit failed")
            negative = {"kind": "production", "product_id": product_id, "location_id": location_id,
                        "date": business_date, "quantity": -1}
            self.post("/records", negative, expected=422)
            require(self.qa_stock(product_id, location_id)["on_hand"] == 0, "Rejected negative production changed stock")
            record = self.post("/records", {**negative, "quantity": 6})
            self.id("production_records", record["id"])
            record = self.patch(f"/records/production/{record['id']}", {"quantity": 8})
            require(record["quantity"] == 8 and self.qa_stock(product_id, location_id)["on_hand"] == 8, "Production edit did not persist inventory change")
            persisted = self.get("/records?" + urlencode({"kind": "production", "location_id": location_id,
                                                         "start_date": business_date, "end_date": business_date, "page_size": 500}))
            require(any(r["id"] == record["id"] and r["quantity"] == 8 for r in persisted["items"]), "Production record not persisted")
            listing = self.post("/listings", {"product_id": product_id, "location_id": location_id, "quantity": 4,
                                                     "discounted_price_kzt": 500, "pickup_start": (now - timedelta(minutes=5)).isoformat(),
                                                     "pickup_deadline": (now + timedelta(hours=2)).isoformat(), "description": marker + "; no physical food or payment"})
            listing_id = listing["id"]
            self.id("listings", listing_id)
            before = self.qa_listing(listing_id)
            order_payload = {"customer_name": marker, "items": [{"listing_id": listing_id, "quantity": 2}]}
            cancelled = self.post("/orders", order_payload)
            self.id("orders", cancelled["id"])
            pending.add(cancelled["id"])
            require(self.qa_listing(listing_id)["available_quantity"] == 2, "Order did not reserve listing quantity")
            cancelled = self.post(f"/orders/{cancelled['id']}/cancel", expected=200)
            pending.discard(cancelled["id"])
            after_cancel = self.qa_listing(listing_id)
            require(cancelled["status"] == "cancelled" and after_cancel["available_quantity"] == before["available_quantity"]
                    and after_cancel["reserved_quantity"] == before["reserved_quantity"], "Cancellation did not restore listing availability")
            stock_before = self.qa_stock(product_id, location_id)
            oversell = {"customer_name": marker, "items": [{"listing_id": listing_id, "quantity": 5}]}
            self.post("/orders", oversell, expected=409)
            require(self.qa_listing(listing_id) == after_cancel and self.qa_stock(product_id, location_id) == stock_before,
                    "Rejected overselling changed listing or inventory")
            collected = self.post("/orders", order_payload)
            self.id("orders", collected["id"])
            pending.add(collected["id"])
            impact_query = "/impact?" + urlencode({"location_id": location_id, "start_date": business_date, "end_date": business_date})
            impact_before = self.get(impact_query)
            collected = self.post(f"/orders/{collected['id']}/collect", expected=200)
            pending.discard(collected["id"])
            require(collected["status"] == "collected", "Collection failed")
            impact_after = self.get(impact_query)
            require(impact_after["recovered_units"] - impact_before["recovered_units"] == 2, "Collected units impact delta is not two")
            require(impact_after["recovered_value_kzt"] - impact_before["recovered_value_kzt"] == 1000, "Recovered revenue impact delta is not 1000 KZT")
            require(math.isclose(impact_after["recovered_weight_kg"] - impact_before["recovered_weight_kg"], 0.2, abs_tol=0.001),
                    "Catalog-based accounting weight delta is not 0.2 kg")
            require(self.qa_stock(product_id, location_id)["on_hand"] == 6, "Collection did not consume exactly two stock units")
            orders = self.get("/orders")
            require(any(o["id"] == collected["id"] and o["status"] == "collected" for o in orders), "Collected order status not persisted")
            return {"marker": marker, "product_id": product_id, "listing_id": listing_id,
                    "cancelled_order_id": cancelled["id"], "collected_order_id": collected["id"],
                    "negative_quantities": "rejected", "overselling": "rejected_without_balance_changes",
                    "recovered_units_delta": 2, "recovered_value_kzt_delta": 1000,
                    "catalog_accounting_weight_kg_delta": 0.2}
        finally:
            # Only touch entities created in this run. Keep all trace records.
            def cleanup() -> dict:
                for order_id in sorted(pending):
                    self.post(f"/orders/{order_id}/cancel", expected=200)
                if listing_id is not None:
                    self.patch(f"/listings/{listing_id}", {"status": "inactive"})
                if product_id is not None:
                    stock = self.qa_stock(product_id, location_id)
                    if stock["available"]:
                        waste = self.post("/records", {"kind": "waste", "product_id": product_id,
                                                        "location_id": location_id, "date": business_date,
                                                        "quantity": stock["available"], "reason": marker + "; synthetic QA cleanup only"})
                        self.id("waste_records", waste["id"])
                    self.patch(f"/products/{product_id}", {"is_active": False})
                    require(self.qa_stock(product_id, location_id)["on_hand"] == 0, "QA cleanup left stock behind")
                return {"product_deactivated": product_id, "listing_deactivated": listing_id,
                        "trace_records_retained": True, "existing_data_deleted_or_reset": False}
            self.check("synthetic QA cleanup", cleanup)
            self.client.verification_mode = False

    def run(self) -> int:
        for route in ("/", "/dashboard", "/forecast", "/inventory", "/save", "/impact", "/economics", "/settings", "/docs"):
            self.check("frontend " + route, lambda route=route: self.page(route))
        self.check("brand assets and favicon", self.assets)
        self.check("API and database health", self.basic_health)
        self.check("demo workspace and currency", self.config)
        self.check("catalog and locations", self.catalog)
        self.check("inventory nonnegative balance", self.inventory)
        self.check("data-derived dashboard and impact", self.analytics)
        self.check("browser CORS and write preflight", self.cors)
        self.check("API OpenAPI and interactive docs", self.docs)
        self.check("marketplace read endpoints", lambda: {"listings": len(self.get("/listings?status=all")), "orders": len(self.get("/orders"))})
        if self.args.write_demo:
            guarded = (self.health.get("demo_data") is True and self.health.get("workspace_mode") == "demo"
                       and self.settings.get("demo_data") is True and self.settings.get("workspace_mode") == "demo"
                       and len(self.products) >= 5 and len(self.locations) >= 1)
            if guarded:
                self.check("forecast generation persistence and held-out MAE", self.forecast)
                self.check("illustrative unit economics", self.economics)
                self.check("synthetic inventory order cancellation oversell and collection", self.marketplace)
            else:
                self.check("demo write guard", lambda: require(False, "Demo health, settings or reference-data guard failed; no writes attempted"))
        failed = sum(check["status"] == "failed" for check in self.report["checks"])
        self.report["finished_at"] = datetime.now(timezone.utc).isoformat()
        self.report["summary"] = {"passed": len(self.report["checks"]) - failed, "failed": failed, "success": failed == 0}
        path = Path(self.args.report).resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
        temporary.write_text(json.dumps(self.report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, path)
        print(f"Report: {path}\nPassed: {self.report['summary']['passed']}; failed: {failed}")
        return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--frontend-url", required=True, help="HTTPS frontend origin, without a path")
    parser.add_argument("--api-url", required=True, help="HTTPS backend base ending in /api")
    parser.add_argument("--allow-local", action="store_true", help="Allow HTTP on localhost for local rehearsal only")
    parser.add_argument("--write-demo", action="store_true", help="Explicitly create synthetic QA records in a confirmed demo workspace; never resets existing data")
    parser.add_argument("--report", default="artifacts/live-smoke.json", help="JSON report file (default: artifacts/live-smoke.json)")
    parser.add_argument("--timeout", type=float, default=90, help="Per-request timeout in seconds; accommodates Render cold starts")
    args = parser.parse_args()
    try:
        args.frontend_url = public_url(args.frontend_url, args.allow_local)
        args.api_url = public_url(args.api_url, args.allow_local)
    except argparse.ArgumentTypeError as exc:
        parser.error(str(exc))
    if urlsplit(args.frontend_url).path:
        parser.error("--frontend-url must be an origin without a path")
    if not args.api_url.endswith("/api"):
        parser.error("--api-url must end in /api")
    if not 0 < args.timeout <= 300:
        parser.error("--timeout must be between 0 and 300 seconds")
    return Verifier(args).run()


if __name__ == "__main__":
    sys.exit(main())
