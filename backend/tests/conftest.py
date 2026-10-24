import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy import create_engine, event

from app.db.session import Base, get_db
from app.main import app
from app.seed import seed_database


@pytest.fixture
def database():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def enforce_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as session:
        seed_database(session)
        session.commit()
    yield factory
    engine.dispose()


@pytest.fixture
def client(database):
    def override():
        with database() as session:
            try:
                yield session
            except Exception:
                session.rollback()
                raise
    app.dependency_overrides[get_db] = override
    with TestClient(app) as api:
        yield api
    app.dependency_overrides.clear()
