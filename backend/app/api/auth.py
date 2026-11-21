from datetime import timedelta
import secrets
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import Field, field_validator
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core.config import aware, get_settings, now_utc
from app.core.rate_limit import limit_login, limit_register, limiter, peer_key
from app.db.session import get_db, scoped_db
from app.models import ApplicationSettings, AuthSession, AuthUser, Bakery, BakeryLocation, PasswordResetToken, Subscription
from app.schemas import ConsentInput, Input
from app.services.auth import DUMMY_PASSWORD_HASH, check_password, hash_password, issue_session, organization_json, token_digest
from app.services.billing import start_trial
from app.services.subscriptions import subscription_json

router = APIRouter(prefix="/api", tags=["Organization access"])
DB = Annotated[Session, Depends(get_db)]
ScopedDB = Annotated[Session, Depends(scoped_db)]


class Credentials(Input):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=10, max_length=128)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value):
        value = value.strip().casefold()
        if value.count("@") != 1 or "." not in value.rsplit("@", 1)[-1] or any(char.isspace() for char in value):
            raise ValueError("Укажите корректный email")
        return value


class EmailOnly(Input):
    email: str = Field(min_length=3, max_length=254)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value):
        return Credentials.valid_email(value)


class ResetRequest(Input):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=10, max_length=128)


class RegisterRequest(Credentials, ConsentInput):
    bakery_name: str = Field(min_length=2, max_length=120)
    requested_role: Literal["consumer", "business", "charity"] = "consumer"
    location_name: str = Field(default="Основная точка", min_length=2, max_length=120)
    address: str = Field(min_length=3, max_length=250)
    city: str = Field(default="Астана", min_length=2, max_length=100)


class LocationRequest(Input):
    name: str = Field(min_length=2, max_length=120)
    address: str = Field(min_length=3, max_length=250)
    city: str = Field(default="Астана", min_length=2, max_length=100)


def real_only():
    if get_settings().workspace_mode != "real":
        raise HTTPException(403, "Регистрация и вход реальных организаций недоступны в публичном DEMO. Используйте отдельное приватное окружение WORKSPACE_MODE=real.")


def session_response(db, user):
    token, expires = issue_session(db, user)
    db.commit()
    db.info.update(bakery_id=user.bakery_id, user_id=user.id, demo_access=False)
    return {"token": token, "expires_at": expires.isoformat(), **organization_json(db), "subscription": subscription_json(db)}


@router.post("/auth/register", status_code=201, dependencies=[Depends(limit_register)])
def register(payload: RegisterRequest, db: DB):
    real_only()
    if not get_settings().auth_registration_enabled:
        raise HTTPException(403, "Регистрация организаций отключена оператором")
    if db.scalar(select(AuthUser.id).where(AuthUser.email == payload.email)):
        raise HTTPException(409, "Этот email уже зарегистрирован")
    owner = Bakery(name=payload.bakery_name, city=payload.city)
    db.add(owner)
    db.flush()
    db.add(BakeryLocation(bakery_id=owner.id, name=payload.location_name, address=payload.address, city=payload.city))
    db.add(ApplicationSettings(bakery_id=owner.id, workspace_mode="real", currency="KZT", safety_buffer_percent=10))
    subscription = Subscription(bakery_id=owner.id, plan="free", status="inactive")
    if payload.requested_role == "business":
        start_trial(db, subscription)
    db.add(subscription)
    user = AuthUser(bakery_id=owner.id, email=payload.email, password_hash=hash_password(payload.password),
                    consent_given_at=now_utc(), role="consumer", requested_role=payload.requested_role)
    db.add(user)
    db.flush()
    return session_response(db, user)


@router.post("/auth/login", dependencies=[Depends(limit_login)])
def login(payload: Credentials, db: DB):
    real_only()
    user = db.scalar(select(AuthUser).where(AuthUser.email == payload.email))
    # Same scrypt work for an unknown email; never expose hashes or existence.
    encoded = user.password_hash if user else DUMMY_PASSWORD_HASH
    valid = check_password(payload.password, encoded)
    if user is None or not valid:
        raise HTTPException(401, "Неверный email или пароль")
    source = db.scalar(select(ApplicationSettings.workspace_mode).where(ApplicationSettings.bakery_id == user.bakery_id))
    if source != "real":
        raise HTTPException(403, "Демонстрационная организация не может войти как реальный клиент")
    # Serialize session issuance with password resets. A reset that already won
    # invalidates this verified hash; a later reset waits and revokes this session.
    matched = db.execute(update(AuthUser).where(
        AuthUser.id == user.id, AuthUser.password_hash == encoded,
    ).values(password_hash=AuthUser.password_hash), execution_options={"synchronize_session": False}).rowcount
    if matched != 1:
        raise HTTPException(401, "Неверный email или пароль")
    return session_response(db, user)


@router.get("/auth/me")
def me(db: ScopedDB):
    real_only()
    return {**organization_json(db), "subscription": subscription_json(db)}


@router.post("/auth/logout")
def logout(db: ScopedDB):
    real_only()
    db.execute(delete(AuthSession).where(AuthSession.id == db.info["auth_session_id"]))
    db.commit()
    return {"message": "Сессия завершена"}


FORGOT_MESSAGE = "Если такой аккаунт есть, мы отправили на email ссылку для нового пароля. Ссылка действует ограниченное время."


@router.post("/auth/forgot")
def forgot_password(payload: EmailOnly, request: Request, background: BackgroundTasks, db: DB):
    real_only()
    settings = get_settings()
    limiter.check("forgot-ip", peer_key(request), limit=settings.forgot_max_attempts, window=settings.forgot_window_seconds)
    limiter.check("forgot-email", payload.email, limit=settings.forgot_max_attempts, window=settings.forgot_window_seconds)
    user = db.scalar(select(AuthUser).where(AuthUser.email == payload.email))
    source = db.scalar(select(ApplicationSettings.workspace_mode).where(ApplicationSettings.bakery_id == user.bakery_id)) if user else None
    if user is not None and source == "real":
        token = secrets.token_urlsafe(32)
        db.add(PasswordResetToken(user_id=user.id, token_hash=token_digest(token),
                                  expires_at=now_utc() + timedelta(minutes=settings.password_reset_minutes)))
        db.commit()
        link = f"{settings.public_url.rstrip('/')}/reset-password?token={token}"
        from app.services.mailer import send_email
        # Sent after the response so timing does not reveal whether the email is registered.
        background.add_task(send_email, user.email, "SaqtaFood: новый пароль",
                            f"Чтобы задать новый пароль, откройте ссылку (действует {settings.password_reset_minutes} мин.):\n{link}\n\n"
                            "Если вы не запрашивали сброс, просто проигнорируйте это письмо.\n")
    return {"message": FORGOT_MESSAGE}


@router.post("/auth/reset")
def reset_password(payload: ResetRequest, request: Request, db: DB):
    real_only()
    limiter.check("reset-ip", peer_key(request), limit=20, window=3600)
    row = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_digest(payload.token)).with_for_update())
    if row is None or row.used_at is not None or aware(row.expires_at) <= now_utc():
        raise HTTPException(400, "Ссылка недействительна или устарела. Запросите новую.")
    user = db.get(AuthUser, row.user_id)
    user.password_hash = hash_password(payload.password)
    now = now_utc()
    db.execute(update(PasswordResetToken).where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
               .values(used_at=now), execution_options={"synchronize_session": False})
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    db.commit()
    return {"message": "Пароль обновлён. Войдите с новым паролем."}


@router.get("/subscription")
def subscription(db: ScopedDB):
    return subscription_json(db)


@router.post("/locations", status_code=201)
def create_location(payload: LocationRequest, db: ScopedDB):
    current = subscription_json(db)
    if get_settings().forecast_requires_subscription and current["access_mode"] != "demo":
        if not current["active"]:
            raise HTTPException(403, "Добавлять точки можно с активным тарифом или в пробный период.")
        if (db.scalar(select(func.count()).select_from(BakeryLocation)) or 0) >= current["limits"]["locations"]:
            raise HTTPException(403, "Все оплаченные точки заняты. Добавьте точку к тарифу в разделе «Тариф и оплата».")
    row = BakeryLocation(bakery_id=db.info["bakery_id"], **payload.model_dump())
    db.add(row)
    db.commit()
    return {key: getattr(row, key) for key in ("id", "bakery_id", "name", "address", "city")}
