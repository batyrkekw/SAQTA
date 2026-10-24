from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db, scoped_db
from app.models import ApplicationSettings, AuthSession, AuthUser, Bakery, BakeryLocation, Subscription
from app.schemas import Input
from app.services.auth import DUMMY_PASSWORD_HASH, check_password, hash_password, issue_session, organization_json
from app.services.subscriptions import PLANS, subscription_json

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


class RegisterRequest(Credentials):
    bakery_name: str = Field(min_length=2, max_length=120)
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


@router.post("/auth/register", status_code=201)
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
    db.add(Subscription(bakery_id=owner.id, plan="free", status="inactive"))
    user = AuthUser(bakery_id=owner.id, email=payload.email, password_hash=hash_password(payload.password))
    db.add(user)
    db.flush()
    return session_response(db, user)


@router.post("/auth/login")
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


@router.get("/subscription")
def subscription(db: ScopedDB):
    return subscription_json(db)


@router.post("/locations", status_code=201)
def create_location(payload: LocationRequest, db: ScopedDB):
    current = subscription_json(db)
    if current["access_mode"] != "demo":
        if current["plan"] != "pro" or not current["active"]:
            raise HTTPException(403, "Добавление филиалов доступно в активном тарифе Pro; у организации уже есть основная точка.")
        if (db.scalar(select(func.count()).select_from(BakeryLocation)) or 0) >= PLANS["pro"]["locations"]:
            raise HTTPException(403, "Достигнут лимит филиалов тарифа Pro")
    row = BakeryLocation(bakery_id=db.info["bakery_id"], **payload.model_dump())
    db.add(row)
    db.commit()
    return {key: getattr(row, key) for key in ("id", "bakery_id", "name", "address", "city")}
