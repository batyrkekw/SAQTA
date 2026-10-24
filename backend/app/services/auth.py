"""Password authentication without hardcoded credentials or client-owned tenant IDs."""
from datetime import timedelta
import hashlib
import hmac
import secrets

from fastapi import HTTPException
from sqlalchemy import select

from app.core.config import aware, get_settings, now_utc
from app.models import ApplicationSettings, AuthSession, AuthUser, Bakery


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1, dklen=32)
    return f"scrypt$16384$8$1${salt}${digest.hex()}"


def check_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt, expected = encoded.split("$")
        if algorithm != "scrypt" or (n, r, p) != ("16384", "8", "1"):
            return False
        actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(actual.hex(), expected)
    except (ValueError, TypeError):
        return False


# A random comparison secret is discarded immediately; this is not an account
# credential. Unknown-email requests perform the same single scrypt check.
DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_session(db, user):
    token = secrets.token_urlsafe(48)
    expires_at = now_utc() + timedelta(hours=get_settings().auth_session_hours)
    db.add(AuthSession(user_id=user.id, bakery_id=user.bakery_id, token_hash=token_digest(token), expires_at=expires_at))
    return token, expires_at


def bind_request_scope(db, request):
    """Called once per request before data queries; the client never selects bakery_id."""
    path = request.url.path
    if path == "/api/health" or path in {"/api/auth/login", "/api/auth/register"}:
        return
    if get_settings().workspace_mode == "demo":
        owner = db.scalar(select(ApplicationSettings.bakery_id).where(ApplicationSettings.workspace_mode == "demo").order_by(ApplicationSettings.id))
        if owner is None:
            if db.scalar(select(ApplicationSettings.id).where(ApplicationSettings.workspace_mode == "real").limit(1)):
                raise HTTPException(401, "База содержит реальные организации. Требуется отдельное окружение WORKSPACE_MODE=real и вход в учётную запись.")
            raise HTTPException(409, "Демонстрационное пространство не инициализировано")
        db.info.update(bakery_id=owner, demo_access=True, include_test_data=request.headers.get("x-saqta-verification") == "include")
        return
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer ") or len(header) > 256:
        raise HTTPException(401, "Войдите в учётную запись организации", headers={"WWW-Authenticate": "Bearer"})
    token = header[7:]
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == token_digest(token)))
    if session is None or aware(session.expires_at) <= now_utc():
        raise HTTPException(401, "Сессия недействительна или истекла. Войдите снова.", headers={"WWW-Authenticate": "Bearer"})
    source = db.scalar(select(ApplicationSettings.workspace_mode).where(ApplicationSettings.bakery_id == session.bakery_id))
    if source != "real":
        raise HTTPException(403, "Синтетическое пространство не доступно как реальная организация")
    db.info.update(bakery_id=session.bakery_id, user_id=session.user_id, auth_session_id=session.id, demo_access=False)


def organization_json(db):
    user = db.get(AuthUser, db.info.get("user_id")) if db.info.get("user_id") else None
    owner = db.get(Bakery, db.info["bakery_id"])
    return {"user": {"id": user.id, "email": user.email, "bakery_id": user.bakery_id} if user else None,
            "organization": {"id": owner.id, "name": owner.name}}
