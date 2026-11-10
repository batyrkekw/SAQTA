"""Explicit operator API, isolated from organization session authorization."""

import hmac
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.rate_limit import limiter, peer_key
from app.db.session import get_db
from app.models import ApplicationSettings, AuthSession, AuthUser, Bakery
from app.schemas import Input
from app.services.auth import hash_password


def require_admin(request: Request):
    configured = get_settings().admin_token
    if not configured:
        raise HTTPException(503, "Администраторский API отключён")
    limiter.check("admin-ip", peer_key(request), limit=60, window=60)
    header = request.headers.get("authorization", "")
    supplied = header[7:] if header.startswith("Bearer ") and len(header) <= 1024 else ""
    if not hmac.compare_digest(supplied.encode(), configured.encode()):
        raise HTTPException(401, "Требуется токен администратора", headers={"WWW-Authenticate": "Bearer"})


router = APIRouter(prefix="/api/admin", tags=["Operator"], dependencies=[Depends(require_admin)])
DB = Annotated[Session, Depends(get_db)]


class EmailRequest(Input):
    email: str = Field(min_length=3, max_length=254)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value):
        value = value.strip().casefold()
        if value.count("@") != 1 or "." not in value.rsplit("@", 1)[-1] or any(char.isspace() for char in value):
            raise ValueError("Укажите корректный email")
        return value


class ApproveRequest(EmailRequest):
    role: Literal["consumer", "business", "charity"]


class ResetPasswordRequest(EmailRequest):
    password: str = Field(min_length=10, max_length=128)


def real_users():
    return select(AuthUser).join(ApplicationSettings, ApplicationSettings.bakery_id == AuthUser.bakery_id).where(
        ApplicationSettings.workspace_mode == "real",
    )


def find_user(db, email):
    user = db.scalar(real_users().where(AuthUser.email == email).with_for_update())
    if user is None:
        raise HTTPException(404, "Учётная запись не найдена")
    return user


@router.get("/pending")
def pending(db: DB):
    rows = db.scalars(real_users().where(AuthUser.role == "consumer", AuthUser.requested_role.in_(["business", "charity"])).order_by(AuthUser.id))
    return {"users": [
        {"id": row.id, "email": row.email, "bakery_name": db.get(Bakery, row.bakery_id).name,
         "role": row.role, "requested_role": row.requested_role}
        for row in rows
    ]}


@router.post("/approve")
def approve(payload: ApproveRequest, db: DB):
    user = find_user(db, payload.email)
    user.role = payload.role
    db.commit()
    return {"id": user.id, "role": user.role, "message": "Роль обновлена"}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: DB):
    user = find_user(db, payload.email)
    user.password_hash = hash_password(payload.password)
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    db.commit()
    return {"id": user.id, "message": "Пароль обновлён, все сессии завершены"}
