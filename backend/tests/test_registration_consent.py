import os
from pathlib import Path
import subprocess
import sys

import pytest
from sqlalchemy import MetaData, create_engine, func, inspect, select

import test_auth_hardening

from app.core.config import aware, now_utc
from app.models import AuthUser, Bakery
from app.services.auth import hash_password

access_client = test_auth_hardening.access_client


def payload(name="owner", **changes):
    return {"email": f"{name}@example.com", "password": "test-password-123", "bakery_name": name,
            "address": "Test address 10", "requested_role": "consumer", "consent": True, **changes}


@pytest.mark.parametrize("role", ["consumer", "business", "charity"])
def test_registration_records_server_consent_without_granting_role(access_client, role):
    client, factory = access_client
    before = now_utc()
    response = client.post("/api/auth/register", json=payload(requested_role=role))
    assert response.status_code == 201, response.text
    assert response.json()["user"]["requested_role"] == role and response.json()["user"]["role"] == "consumer"
    with factory() as db:
        user = db.get(AuthUser, response.json()["user"]["id"])
        assert before <= aware(user.consent_given_at) <= now_utc()


@pytest.mark.parametrize("consent", [False, "true", "false", 1, 0, None, "missing"])
def test_registration_rejects_missing_or_nonboolean_consent_without_creating_rows(access_client, consent):
    client, factory = access_client
    body = payload(consent=consent)
    if consent == "missing":
        body.pop("consent")
    response = client.post("/api/auth/register", json=body)
    assert response.status_code == 422
    assert response.json()["detail"] == "Подтвердите согласие на обработку персональных данных"
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(AuthUser)) == 0
        assert db.scalar(select(func.count()).select_from(Bakery)) == 0


def test_registration_cannot_supply_its_own_consent_timestamp(access_client):
    client, factory = access_client
    response = client.post("/api/auth/register", json=payload(consent_given_at="2000-01-01T00:00:00Z"))
    assert response.status_code == 422
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(AuthUser)) == 0


def test_consent_is_isolated_and_never_rewritten_by_other_registration_or_login(access_client):
    client, factory = access_client
    first = client.post("/api/auth/register", json=payload("first")).json()
    with factory() as db:
        first_stamp = db.get(AuthUser, first["user"]["id"]).consent_given_at
    second = client.post("/api/auth/register", json=payload("second")).json()
    assert first["organization"]["id"] != second["organization"]["id"]
    duplicate = client.post("/api/auth/register", json=payload("first"))
    assert duplicate.status_code == 409
    login = client.post("/api/auth/login", json={"email": "first@example.com", "password": "test-password-123"})
    assert login.status_code == 200
    with factory() as db:
        assert db.get(AuthUser, first["user"]["id"]).consent_given_at == first_stamp
        assert db.get(AuthUser, second["user"]["id"]).consent_given_at is not None
    own = client.get("/api/auth/me", headers={"Authorization": "Bearer " + second["token"]}).json()
    assert own["user"]["id"] == second["user"]["id"] and "first@example.com" not in str(own)


def test_existing_account_with_unknown_consent_can_still_login(access_client):
    client, factory = access_client
    registered = client.post("/api/auth/register", json=payload()).json()
    with factory() as db:
        db.get(AuthUser, registered["user"]["id"]).consent_given_at = None
        db.commit()
    response = client.post("/api/auth/login", json={"email": "owner@example.com", "password": "test-password-123"})
    assert response.status_code == 200
    with factory() as db:
        assert db.get(AuthUser, registered["user"]["id"]).consent_given_at is None


def test_registration_consent_migration_preserves_existing_users_and_reverses(tmp_path):
    database_url = f"sqlite:///{(tmp_path / 'consent-migration.db').as_posix()}"
    environment = {**os.environ, "DATABASE_URL": database_url}
    backend = Path(__file__).resolve().parents[1]

    def migrate(action, revision):
        result = subprocess.run([sys.executable, "-m", "alembic", action, revision], cwd=backend, env=environment,
                                capture_output=True, text=True, timeout=90)
        assert result.returncode == 0, result.stderr

    migrate("upgrade", "b7c8d9e0f1a2")
    engine = create_engine(database_url)
    old = MetaData()
    old.reflect(bind=engine)
    timestamps = {"created_at": now_utc(), "updated_at": now_utc()}
    password_hash = hash_password("legacy-test-password")
    with engine.begin() as connection:
        connection.execute(old.tables["bakeries"].insert().values(id=1, name="Historical organization", city="Астана", **timestamps))
        connection.execute(old.tables["auth_users"].insert().values(id=1, bakery_id=1, email="historical@example.com",
                           password_hash=password_hash, role="business", requested_role="business", **timestamps))
    engine.dispose()
    migrate("upgrade", "c8d9e0f1a2b3")
    engine = create_engine(database_url)
    current = MetaData()
    current.reflect(bind=engine)
    with engine.connect() as connection:
        row = connection.execute(select(current.tables["auth_users"])).mappings().one()
        assert row["email"] == "historical@example.com" and row["password_hash"] == password_hash
        assert row["consent_given_at"] is None and row["role"] == "business"
    engine.dispose()
    migrate("downgrade", "b7c8d9e0f1a2")
    engine = create_engine(database_url)
    assert "consent_given_at" not in {column["name"] for column in inspect(engine).get_columns("auth_users")}
    with engine.connect() as connection:
        assert connection.execute(select(old.tables["auth_users"].c.password_hash)).scalar_one() == password_hash
    engine.dispose()
