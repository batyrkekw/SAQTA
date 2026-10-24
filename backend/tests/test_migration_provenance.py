"""Existing REAL records must survive demo-provenance/settlement migration."""
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import subprocess
import sys

from sqlalchemy import MetaData, create_engine, func, select


def test_existing_demo_and_real_qa_named_records_upgrade_without_deletion(tmp_path):
    database_url = f"sqlite:///{(tmp_path / 'existing-provenance.db').as_posix()}"
    backend = Path(__file__).resolve().parents[1]
    environment = {**os.environ, "DATABASE_URL": database_url, "WORKSPACE_MODE": "demo", "AUTO_SEED_DEMO": "false"}

    def migrate(revision):
        result = subprocess.run([sys.executable, "-m", "alembic", "upgrade", revision], cwd=backend,
                                env=environment, capture_output=True, text=True, timeout=60)
        assert result.returncode == 0, result.stderr

    migrate("c83f42d78b91")
    engine = create_engine(database_url)
    old = MetaData()
    old.reflect(bind=engine)
    timestamp = datetime(2026, 10, 24, 10, tzinfo=timezone.utc)
    timestamps = {"created_at": timestamp, "updated_at": timestamp}
    fixture_name = "QA SYNTHETIC 20261024T100000Z preservation fixture"
    original_tables = ("bakeries", "application_settings", "bakery_locations", "products", "surplus_listings", "orders", "order_items")
    with engine.begin() as connection:
        for identifier, origin in ((1, "demo"), (2, "real")):
            connection.execute(old.tables["bakeries"].insert().values(id=identifier, name=f"Isolated {origin} organization", city="Астана", **timestamps))
            connection.execute(old.tables["application_settings"].insert().values(id=identifier, bakery_id=identifier, currency="KZT",
                               workspace_mode=origin, safety_buffer_percent=10, **timestamps))
            connection.execute(old.tables["bakery_locations"].insert().values(id=identifier, bakery_id=identifier, name="Main",
                               address=f"Synthetic test address {identifier}", city="Астана", **timestamps))
            connection.execute(old.tables["products"].insert().values(id=identifier, bakery_id=identifier, name=fixture_name,
                               category="QA SYNTHETIC", unit="шт.", price_kzt=4000, cost_kzt=500, weight_grams=100,
                               is_active=False, **timestamps))
            connection.execute(old.tables["surplus_listings"].insert().values(id=identifier, product_id=identifier, location_id=identifier,
                               quantity=2, available_quantity=0, reserved_quantity=0, collected_quantity=2,
                               original_price_kzt=4000, discounted_price_kzt=1000, pickup_start=timestamp - timedelta(hours=1),
                               pickup_deadline=timestamp + timedelta(hours=1), status="inactive",
                               description="QA CONCURRENCY SYNTHETIC 20261024T100000Z preservation fixture", **timestamps))
            connection.execute(old.tables["orders"].insert().values(id=identifier, customer_name=fixture_name, status="collected",
                               total_kzt=2000, collected_at=timestamp, **timestamps))
            connection.execute(old.tables["order_items"].insert().values(id=identifier, order_id=identifier, listing_id=identifier,
                               quantity=2, unit_price_kzt=1000, weight_grams=100))
        before_counts = {name: connection.scalar(select(func.count()).select_from(old.tables[name])) for name in original_tables}
    engine.dispose()

    migrate("head")
    engine = create_engine(database_url)
    upgraded = MetaData()
    upgraded.reflect(bind=engine)
    with engine.connect() as connection:
        after_counts = {name: connection.scalar(select(func.count()).select_from(upgraded.tables[name])) for name in original_tables}
        assert after_counts == before_counts == {name: 2 for name in original_tables}
        for table_name in ("products", "surplus_listings", "orders"):
            rows = connection.execute(select(upgraded.tables[table_name]).order_by(upgraded.tables[table_name].c.id)).mappings().all()
            assert rows[0]["is_test_data"] is True, table_name
            assert rows[1]["is_test_data"] is False, table_name
        for row in connection.execute(select(upgraded.tables["orders"]).order_by(upgraded.tables["orders"].c.id)).mappings():
            assert row["bakery_id"] == row["id"]
            assert row["status"] == "collected" and row["total_kzt"] == 2000
            assert row["commission_rate_bps"] == 500
            assert row["commission_tiyn"] == 10000
            assert row["seller_proceeds_tiyn"] == 190000
            assert row["commission_tiyn"] + row["seller_proceeds_tiyn"] == row["total_kzt"] * 100
            assert row["commission_recorded_at"] is None  # Historical estimate, never a retroactive charge.
        products = connection.execute(select(upgraded.tables["products"]).order_by(upgraded.tables["products"].c.id)).mappings().all()
        assert [row["name"] for row in products] == [fixture_name, fixture_name]
        assert all(row["price_kzt"] == 4000 and row["is_active"] is False for row in products)
        settings = connection.execute(select(upgraded.tables["application_settings"]).order_by(upgraded.tables["application_settings"].c.id)).mappings().all()
        assert [row["workspace_mode"] for row in settings] == ["demo", "real"]
    engine.dispose()
