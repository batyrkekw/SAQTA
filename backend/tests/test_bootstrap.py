import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from app.bootstrap import initialize_demo
from app.core.config import get_settings
from app.db.session import Base, build_engine
from app.models import ApplicationSettings, Bakery, Product, ProductionRecord
from app.seed import seed_database


@pytest.fixture
def blank_database(tmp_path):
    engine = build_engine(f"sqlite:///{(tmp_path / 'bootstrap.db').as_posix()}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    yield factory
    engine.dispose()


@pytest.fixture
def auto_seed_enabled(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "auto_seed_demo", True)
    monkeypatch.setattr(settings, "workspace_mode", "demo")
    return settings


def test_automatic_seed_is_disabled_by_default(blank_database, monkeypatch):
    monkeypatch.setattr(get_settings(), "auto_seed_demo", False)
    with blank_database() as db:
        assert initialize_demo(db) == {"status": "disabled"}
        assert db.scalar(select(func.count()).select_from(Bakery)) == 0


def test_automatic_seed_initializes_empty_demo(blank_database, auto_seed_enabled):
    with blank_database() as db:
        assert initialize_demo(db) == {"products": 5, "days": 42}
        db.commit()
    with blank_database() as db:
        assert db.scalar(select(func.count()).select_from(Product)) == 5
        assert db.scalar(select(func.count()).select_from(ProductionRecord)) == 42 * 5 * 2
        assert db.scalar(select(ApplicationSettings.workspace_mode)) == "demo"


def test_automatic_seed_preserves_existing_demo_mutations(database, auto_seed_enabled):
    with database() as db:
        bakery = db.scalar(select(Bakery))
        bakery.name = "SAQTA · changed during the demo"
        record = db.scalar(select(ProductionRecord).order_by(ProductionRecord.id))
        record.quantity += 1
        record_id, expected_quantity = record.id, record.quantity
        db.commit()
    with database() as db:
        before = db.scalar(select(func.count()).select_from(ProductionRecord))
        result = initialize_demo(db)
        db.commit()
        assert result["products"] == 5
        assert db.scalar(select(func.count()).select_from(ProductionRecord)) == before
        assert db.scalar(select(Bakery.name)) == "SAQTA · changed during the demo"
        assert db.get(ProductionRecord, record_id).quantity == expected_quantity


def test_automatic_seed_refuses_real_environment(blank_database, auto_seed_enabled, monkeypatch):
    monkeypatch.setattr(auto_seed_enabled, "workspace_mode", "real")
    with blank_database() as db:
        with pytest.raises(ValueError, match="requires WORKSPACE_MODE=demo"):
            initialize_demo(db)
        assert db.scalar(select(func.count()).select_from(Bakery)) == 0


def test_automatic_seed_refuses_persisted_real_workspace(blank_database, auto_seed_enabled):
    with blank_database() as db:
        seed_database(db, empty=True)
        db.commit()
    with blank_database() as db:
        with pytest.raises(ValueError, match="persisted real-data workspace"):
            initialize_demo(db)
        assert db.scalar(select(ApplicationSettings.workspace_mode)) == "real"
        assert db.scalar(select(func.count()).select_from(Product)) == 0
