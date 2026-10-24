"""Reproducible synthetic data for an isolated SAQTA demo database."""
import argparse
import random
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings, now_utc, today_local
from app.db.session import Base, SessionLocal
from app.models import ApplicationSettings, Bakery, BakeryLocation, InventorySnapshot, Order, OrderItem, Product, ProductionRecord, SalesRecord, SurplusListing, WasteRecord
from app.schemas import ListingCreate, OrderCreate, OrderLine
from app.services.marketplace import create_listing, create_order, transition_order

PRODUCTS = [
    ("Круассан классический", "Круассаны", 750, 290, 80, 52),
    ("Хлеб на закваске", "Хлеб", 1200, 480, 450, 30),
    ("Синнабон с корицей", "Сладкая выпечка", 900, 340, 120, 42),
    ("Самса с тыквой", "Несладкая выпечка", 600, 220, 130, 64),
    ("Багет пшеничный", "Хлеб", 650, 240, 250, 38),
]


def seed_database(db: Session, reset=False, empty=False):
    existing = db.scalar(select(Bakery))
    if existing and not reset:
        return {"products": len(list(db.scalars(select(Product)))), "days": 42, "message": "Данные уже существуют; используйте --reset в демо-режиме"}
    if reset:
        if get_settings().workspace_mode != "demo":
            raise ValueError("Reset is allowed only with WORKSPACE_MODE=demo")
        settings_table = ApplicationSettings.__table__
        has_real = db.connection().scalar(select(settings_table.c.id).where(settings_table.c.workspace_mode == "real").limit(1))
        if has_real is not None:
            raise ValueError("Reset is disabled for a persisted real-data workspace; use a separate demo database")
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(delete(table))
        db.flush()
        db.expunge_all()
    owner = Bakery(name="SAQTA · демо-пекарня" if not empty else "Моя пекарня", city="Астана")
    db.add(owner)
    db.flush()
    locations = [BakeryLocation(bakery_id=owner.id, name="Есиль · Кабанбай батыра", address="Астана, пр. Кабанбай батыра, 17 (демо-адрес)"),
                 BakeryLocation(bakery_id=owner.id, name="Сарыарка · Кенесары", address="Астана, ул. Кенесары, 42 (демо-адрес)")]
    if empty:
        locations = [BakeryLocation(bakery_id=owner.id, name="Основная точка", address="Укажите адрес точки")]
    db.add_all(locations)
    db.add(ApplicationSettings(bakery_id=owner.id, currency="KZT", safety_buffer_percent=10, workspace_mode="real" if empty else "demo"))
    db.flush()
    if empty:
        return {"products": 0, "days": 0}
    anchor = get_settings().demo_anchor_date or today_local()
    if anchor > today_local():
        raise ValueError("DEMO_ANCHOR_DATE must not be in the future")
    rng = random.Random(24042)
    products = []
    for name, category, price, cost, weight, _ in PRODUCTS:
        product = Product(bakery_id=owner.id, name=name, category=category, price_kzt=price, cost_kzt=cost, weight_grams=weight, unit="шт.", is_active=True)
        db.add(product)
        products.append(product)
    db.flush()
    for location_index, location in enumerate(locations):
        for product_index, product in enumerate(products):
            current_stock = 0
            for offset in range(42):
                day = anchor - timedelta(days=41 - offset)
                weekend = 1.23 if day.weekday() >= 5 else 1.0
                factor = weekend if product_index != 1 else (0.9 if day.weekday() >= 5 else 1.1)
                demand = round(PRODUCTS[product_index][-1] * factor * (1 if location_index == 0 else 0.76) + rng.randint(-7, 7))
                production = demand + rng.randint(5, 16) + (18 if offset == 41 else 0)
                regular_sales = max(1, demand)
                save_sales = 2 if offset % 7 == 3 and product_index < 2 and location_index == 0 else 0
                remaining = production - regular_sales - save_sales
                waste = remaining if offset < 41 else 2
                db.add(ProductionRecord(product_id=product.id, location_id=location.id, date=day, quantity=production))
                db.add(SalesRecord(product_id=product.id, location_id=location.id, date=day, quantity=regular_sales, unit_price_kzt=product.price_kzt, source="regular"))
                if waste:
                    db.add(WasteRecord(product_id=product.id, location_id=location.id, date=day, quantity=waste,
                                       reason="Истёк срок реализации (синтетическая запись)", unit_cost_kzt=product.cost_kzt, weight_grams=product.weight_grams))
                if save_sales:
                    pickup = datetime.combine(day, time(14), tzinfo=timezone.utc)
                    listing = SurplusListing(product_id=product.id, location_id=location.id, quantity=save_sales,
                                             available_quantity=0, reserved_quantity=0, collected_quantity=save_sales,
                                             original_price_kzt=product.price_kzt, discounted_price_kzt=product.price_kzt // 2,
                                             pickup_start=pickup - timedelta(hours=2), pickup_deadline=pickup + timedelta(hours=2), status="inactive", description="Архивный демо-заказ")
                    db.add(listing)
                    db.flush()
                    sale_total = save_sales * listing.discounted_price_kzt
                    order = Order(bakery_id=owner.id, customer_name="Демо-покупатель", status="collected", total_kzt=sale_total,
                                  commission_tiyn=sale_total * 5, seller_proceeds_tiyn=sale_total * 95,
                                  created_at=pickup, collected_at=pickup)
                    db.add(order)
                    db.flush()
                    db.add(OrderItem(order_id=order.id, listing_id=listing.id, quantity=save_sales, unit_price_kzt=listing.discounted_price_kzt, weight_grams=product.weight_grams))
                    db.add(SalesRecord(product_id=product.id, location_id=location.id, date=day, quantity=save_sales, unit_price_kzt=listing.discounted_price_kzt, source="save"))
                current_stock += production - regular_sales - save_sales - waste
            db.add(InventorySnapshot(product_id=product.id, location_id=location.id, on_hand=current_stock, reserved=0))
    db.flush()
    active = []
    timestamp = now_utc()
    for index, product in enumerate(products):
        listing = create_listing(db, ListingCreate(product_id=product.id, location_id=locations[index % 2].id, quantity=12,
                                                  discounted_price_kzt=product.price_kzt // 2, pickup_start=timestamp - timedelta(hours=1),
                                                  pickup_deadline=timestamp + timedelta(hours=12), description="Синтетическое предложение. Свежая выпечка для самовывоза; состав и аллергены уточняйте в пекарне."))
        active.append(listing)
    for index in range(3):
        order = create_order(db, OrderCreate(customer_name=f"Демо-покупатель {index + 1}", items=[OrderLine(listing_id=active[index].id, quantity=2)]))
        if index == 0:
            transition_order(db, order.id, "collect")
        elif index == 2:
            transition_order(db, order.id, "cancel")
    db.flush()
    return {"products": len(products), "days": 42}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reset", action="store_true", help="Erase and reseed an isolated demo database")
    parser.add_argument("--empty", action="store_true", help="Create an empty workspace without synthetic records")
    args = parser.parse_args()
    if get_settings().workspace_mode == "real" and not args.empty:
        parser.error("Use --empty when WORKSPACE_MODE=real; synthetic seeding is disabled")
    with SessionLocal() as db:
        result = seed_database(db, reset=args.reset, empty=args.empty)
        db.commit()
        print(result)


if __name__ == "__main__":
    main()
