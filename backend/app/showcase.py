"""Operator CLI: prepare a clearly labelled demo bakery for a live presentation.

Everything goes through the public HTTP API in-process, so the usual validation, tenant
isolation and stock rules apply. The bakery name says "демо" and every offer description
says the data is illustrative. Generated passwords are written only to the credentials file
(default: artifacts/showcase-accounts.json, ignored by Git) and are never printed.

    python -m app.showcase                      # create once, or refresh expired offers
    python -m app.showcase --credentials-file /secure/path.json
"""

import argparse
import io
import json
import random
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import get_settings, today_local
from app.db.session import SessionLocal
from app.main import app
from app.models import AuthUser

BUSINESS = {"bakery_name": "Нан үйі · демо", "city": "Астана", "location_name": "Нан үйі на Кенесары", "address": "ул. Кенесары, 40 (демо-адрес)"}
# name, category, unit, regular price, weekday base demand (Mon..Sun), ingredients, allergens
PRODUCTS = [
    ("Хлеб на закваске", "Хлеб", "шт.", 1200, [30, 28, 31, 32, 38, 44, 35], "Мука пшеничная, вода, закваска, соль", ["gluten"]),
    ("Багет пшеничный", "Хлеб", "шт.", 650, [40, 38, 41, 42, 52, 61, 47], "Мука пшеничная, вода, дрожжи, соль", ["gluten"]),
    ("Круассан классический", "Выпечка", "шт.", 750, [48, 45, 50, 52, 64, 78, 70], "Мука пшеничная, сливочное масло, молоко, яйца, сахар", ["eggs", "gluten", "milk"]),
    ("Самса с тыквой", "Выпечка", "шт.", 600, [60, 58, 62, 61, 70, 66, 55], "Мука пшеничная, тыква, лук, масло растительное, кунжут", ["gluten", "sesame"]),
    ("Синнабон с корицей", "Выпечка", "шт.", 900, [34, 33, 36, 38, 46, 58, 52], "Мука пшеничная, молоко, яйца, сливочный сыр, корица, сахар", ["eggs", "gluten", "milk"]),
    ("Баурсаки", "Выпечка", "порция", 500, [25, 24, 26, 27, 33, 45, 41], "Мука пшеничная, молоко, дрожжи, масло растительное", ["gluten", "milk"]),
]
# product index, quantity, discount %, pickup preset, bulk
OFFERS = [(0, 6, 50, "tonight", True), (2, 12, 40, "tonight", False), (3, 8, 45, "soon", True), (4, 5, 35, "tonight", False), (5, 10, 50, "morning", True)]


def window(kind, tz):
    now = datetime.now(tz).replace(second=0, microsecond=0)
    start = now + timedelta(minutes=15 - now.minute % 15)
    if kind == "morning":
        day = (now + timedelta(days=1)).replace(hour=8, minute=0)
        return day, day.replace(hour=11), day.replace(hour=23, minute=59)
    closing = now.replace(hour=21, minute=0)
    end = closing if kind == "tonight" and closing - start >= timedelta(hours=1) else start + timedelta(hours=2)
    return start, end, end.replace(hour=23, minute=59) if end.date() == now.date() else end + timedelta(hours=6)


def history_csv(days=56, seed=2026):
    rng = random.Random(seed)
    rows = ["date,product,sold,produced,remaining"]
    for back in range(days, 0, -1):
        day = today_local() - timedelta(days=back)
        for name, *_rest in PRODUCTS:
            base = next(p[4] for p in PRODUCTS if p[0] == name)[day.weekday()]
            sold = max(0, round(base * rng.uniform(.86, 1.14)))
            produced = sold + rng.choice([0, 1, 2, 3, 4, 5, 6, 8])
            rows.append(f"{day},{name},{sold},{produced},{produced - sold}")
    return "\n".join(rows).encode()


def ensure_account(client, creds, key, role, payload):
    stored = creds.get(key)
    if stored:
        login = client.post("/api/auth/login", json={"email": stored["email"], "password": stored["password"]})
        if login.status_code == 200:
            return {"Authorization": "Bearer " + login.json()["token"]}
    email = f"{key}-{secrets.token_hex(3)}@demo.saqta.test"
    password = secrets.token_urlsafe(16)
    # Demo accounts belong to the operator running this command, who gives the consent.
    response = client.post("/api/auth/register", json={"email": email, "password": password, "requested_role": role, "consent": True, **payload})
    response.raise_for_status()
    if role != "consumer":
        with SessionLocal() as db:
            db.scalar(select(AuthUser).where(AuthUser.email == email)).role = role
            db.commit()
    creds[key] = {"email": email, "password": password, "role": role}
    return {"Authorization": "Bearer " + response.json()["token"]}


def import_history(client, headers):
    options = {"source_origin": "real", "mode": "observations", "create_products": True, "default_unit": "шт.",
               "column_mapping": {"date": "date", "product": "product", "sold": "sold", "produced": "produced", "remaining": "remaining"}}
    content = history_csv()
    files = lambda: {"file": ("nan-uii-demo-history.csv", io.BytesIO(content))}  # noqa: E731
    preview = client.post("/api/imports/preview", headers=headers, files=files(), data={"options": json.dumps(options)})
    preview.raise_for_status()
    commit = client.post("/api/imports/commit", headers=headers, files=files(),
                         data={"options": json.dumps(options), "preview_token": preview.json()["preview_token"], "confirm": "IMPORT SAQTA"})
    commit.raise_for_status()


def publish_offers(client, headers, tz):
    location = client.get("/api/locations", headers=headers).json()[0]["id"]
    for index, quantity, discount, preset, bulk in OFFERS:
        name, category, unit, price, _demand, ingredients, allergens = PRODUCTS[index]
        start, end, expiry = window(preset, tz)
        response = client.post("/api/market/listings", headers=headers, json={
            "name": name, "category": category, "unit": unit, "quantity": quantity,
            "original_price": price, "price": round(price * (100 - discount) / 100 / 10) * 10, "terms": "discounted",
            "description": "Демонстрационное предложение для показа SAQTA. Выпечка сегодняшнего дня.",
            "ingredients": ingredients, "allergens": allergens, "location_id": location,
            "pickup_start": start.isoformat(), "pickup_deadline": end.isoformat(), "expires_at": expiry.isoformat(),
            "bulk_available": bulk, "stock_confirmed": True,
        })
        response.raise_for_status()


def main():
    parser = argparse.ArgumentParser(description="Prepare the SAQTA demo bakery for a presentation")
    parser.add_argument("--credentials-file", default="artifacts/showcase-accounts.json")
    args = parser.parse_args()
    path = Path(args.credentials_file)
    creds = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    tz = ZoneInfo(get_settings().saqta_timezone)
    with TestClient(app) as client:
        business = ensure_account(client, creds, "bakery", "business", BUSINESS)
        ensure_account(client, creds, "buyer", "consumer", {"bakery_name": "Покупатель · демо", "address": "Не указано"})
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(creds, ensure_ascii=False, indent=1), encoding="utf-8")
        state = client.get("/api/analysis/state", headers=business).json()
        if not state.get("products"):
            import_history(client, business)
            client.post("/api/analysis/runs", headers=business, json={}).raise_for_status()
        mine = client.get("/api/market/my-listings", headers=business).json()
        if not any(offer["status"] == "active" and offer["available_quantity"] > 0 and
                   datetime.fromisoformat(offer["pickup_deadline"]) > datetime.now(tz) for offer in mine):
            publish_offers(client, business, tz)
    print(f"Showcase ready. Accounts saved to {path} (not printed).")


if __name__ == "__main__":
    main()
