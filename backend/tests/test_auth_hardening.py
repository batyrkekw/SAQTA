from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.core.rate_limit import RateLimiter
from app.db.session import Base, get_db
from app.main import app
from app.models import AuthUser
from app.services.auth import check_password


@pytest.fixture
def access_client(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "workspace_mode", "real")
    monkeypatch.setattr(settings, "admin_token", "test-operator-token")
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)

    def override():
        with factory() as db:
            try:
                yield db
            except Exception:
                db.rollback()
                raise

    app.dependency_overrides[get_db] = override
    with TestClient(app) as client:
        yield client, factory
    app.dependency_overrides.clear()
    engine.dispose()


def signup(client, name="owner", role="business"):
    response = client.post("/api/auth/register", json={
        "email": f"{name}@example.com", "password": "test-password-123", "bakery_name": name,
        "address": "Test address 10", "requested_role": role, "consent": True,
    })
    assert response.status_code == 201, response.text
    return response.json()


ADMIN = {"Authorization": "Bearer test-operator-token"}


def test_pending_approval_and_role_validation(access_client):
    client, factory = access_client
    owner = signup(client)
    signup(client, "charity", "charity")
    signup(client, "buyer", "consumer")
    pending = client.get("/api/admin/pending", headers=ADMIN)
    assert pending.status_code == 200
    assert {row["email"] for row in pending.json()["users"]} == {"owner@example.com", "charity@example.com"}
    assert all(set(row) == {"id", "email", "bakery_name", "role", "requested_role"} for row in pending.json()["users"])
    invalid = client.post("/api/admin/approve", headers=ADMIN, json={"email": "owner@example.com", "role": "admin"})
    assert invalid.status_code == 422
    with factory() as db:
        assert db.get(AuthUser, owner["user"]["id"]).role == "consumer"
    approved = client.post("/api/admin/approve", headers=ADMIN, json={"email": " OWNER@example.com ", "role": "business"})
    assert approved.status_code == 200 and approved.json()["role"] == "business"
    assert [row["email"] for row in client.get("/api/admin/pending", headers=ADMIN).json()["users"]] == ["charity@example.com"]
    assert client.post("/api/admin/approve", headers=ADMIN, json={"email": "charity@example.com", "role": "charity"}).status_code == 200
    assert client.get("/api/admin/pending", headers=ADMIN).json() == {"users": []}


@pytest.mark.parametrize("path,body", [
    ("pending", None),
    ("approve", {"email": "owner@example.com", "role": "business"}),
    ("reset-password", {"email": "owner@example.com", "password": "replacement-password"}),
])
def test_admin_requires_token_and_can_be_disabled(access_client, monkeypatch, path, body):
    client, _ = access_client
    user = signup(client)
    method = client.get if body is None else client.post
    kwargs = {} if body is None else {"json": body}
    for headers in ({}, {"Authorization": "Bearer wrong"}, {"Authorization": f"Bearer {user['token']}"}):
        assert method(f"/api/admin/{path}", headers=headers, **kwargs).status_code == 401
    monkeypatch.setattr(get_settings(), "admin_token", "")
    assert method(f"/api/admin/{path}", headers=ADMIN, **kwargs).status_code == 503


def test_password_reset_revokes_only_target_sessions_without_secret_output(access_client, caplog):
    client, factory = access_client
    a, b = signup(client, "owner"), signup(client, "other")
    credentials = {"email": "owner@example.com", "password": "test-password-123"}
    second = client.post("/api/auth/login", json=credentials).json()
    new_password = "replacement-password-456"
    result = client.post("/api/admin/reset-password", headers=ADMIN, json={"email": credentials["email"], "password": new_password})
    assert result.status_code == 200
    for token in (a["token"], second["token"]):
        assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {b['token']}"}).status_code == 200
    assert client.post("/api/auth/login", json=credentials).status_code == 401
    assert client.post("/api/auth/login", json={**credentials, "password": new_password}).status_code == 200
    with factory() as db:
        assert check_password(new_password, db.scalar(select(AuthUser).where(AuthUser.email == credentials["email"])).password_hash)
    for secret in (new_password, credentials["password"], a["token"], b["token"], "test-operator-token"):
        assert secret not in result.text
        assert secret not in caplog.text


def test_admin_missing_user_and_invalid_password_do_not_mutate(access_client):
    client, _ = access_client
    user = signup(client)
    assert client.post("/api/admin/approve", headers=ADMIN, json={"email": "missing@example.com", "role": "business"}).status_code == 404
    assert client.post("/api/admin/reset-password", headers=ADMIN, json={"email": "missing@example.com", "password": "new-long-password"}).status_code == 404
    assert client.post("/api/admin/reset-password", headers=ADMIN, json={"email": "owner@example.com", "password": "short"}).status_code == 422
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {user['token']}"}).status_code == 200


def test_login_attempts_limited_before_password_hashing(access_client, monkeypatch):
    client, _ = access_client
    monkeypatch.setattr(get_settings(), "login_max_attempts", 2)
    calls = []
    monkeypatch.setattr("app.api.auth.check_password", lambda *_: calls.append(True) or False)
    for index in range(2):
        response = client.post("/api/auth/login", json={"email": "missing@example.com", "password": "long-wrong-password"}, headers={"X-Forwarded-For": f"192.0.2.{index}"})
        assert response.status_code == 401
    blocked = client.post("/api/auth/login", json={"email": "another@example.com", "password": "long-wrong-password"}, headers={"X-Forwarded-For": "192.0.2.99"})
    assert blocked.status_code == 429 and int(blocked.headers["Retry-After"]) > 0
    assert len(calls) == 2


def test_registration_invalid_requests_are_limited(access_client, monkeypatch):
    client, factory = access_client
    monkeypatch.setattr(get_settings(), "register_max_attempts", 2)
    assert client.post("/api/auth/register", json={}).status_code == 422
    signup(client)
    assert client.post("/api/auth/register", json={}).status_code == 429
    with factory() as db:
        assert len(list(db.scalars(select(AuthUser)))) == 1


@pytest.mark.parametrize("email", [" MISSING@EXAMPLE.COM ", " " * 300 + "MISSING@EXAMPLE.COM" + " " * 300])
def test_login_email_budget_shared_between_peers(access_client, monkeypatch, email):
    client, _ = access_client
    monkeypatch.setattr(get_settings(), "login_max_attempts", 1)
    payload = {"email": "missing@example.com", "password": "long-wrong-password"}
    assert client.post("/api/auth/login", json=payload).status_code == 401
    with TestClient(app, client=("192.0.2.1", 50000)) as other_peer:
        assert other_peer.post("/api/auth/login", json={**payload, "email": email}).status_code == 429


def test_rate_limiter_window_capacity_hashes_and_disable(monkeypatch):
    now = [0.0]
    limiter = RateLimiter(clock=lambda: now[0])
    monkeypatch.setattr(get_settings(), "rate_limit_max_keys", 2)
    limiter.check("login", "private@example.com", limit=1, window=10)
    assert "private@example.com" not in str(limiter._buckets)
    with pytest.raises(HTTPException) as blocked:
        limiter.check("login", "private@example.com", limit=1, window=10)
    assert blocked.value.status_code == 429 and blocked.value.headers["Retry-After"] == "10"
    limiter.check("login", "second", limit=1, window=10)
    with pytest.raises(HTTPException):
        limiter.check("login", "third", limit=1, window=10)
    assert len(limiter._buckets) == 2
    now[0] = 10.0
    limiter.check("login", "third", limit=1, window=10)
    assert len(limiter._buckets) == 1
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", False)
    limiter.check("login", "third", limit=1, window=10)


def test_rate_limiter_concurrent_calls_cannot_exceed_budget():
    limiter = RateLimiter()

    def attempt(_):
        try:
            limiter.check("concurrent", "peer", limit=5, window=60)
            return True
        except HTTPException as exc:
            assert exc.status_code == 429
            return False

    with ThreadPoolExecutor(max_workers=8) as pool:
        assert sum(pool.map(attempt, range(20))) == 5
