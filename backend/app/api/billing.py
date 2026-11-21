"""Billing API: plans, checkout, invoices, auto-renewal and TipTop Pay notifications."""
import json
from typing import Annotated, Literal
from urllib.parse import parse_qsl

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter, peer_key
from app.db.session import get_db, scoped_db
from app.models import BakeryLocation, BillingInvoice, Subscription
from app.schemas import Input
from app.services import billing

router = APIRouter(prefix="/api/billing", tags=["Billing"])
DB = Annotated[Session, Depends(get_db)]
ScopedDB = Annotated[Session, Depends(scoped_db)]


class CheckoutRequest(Input):
    months: Literal[1, 3, 12] = 1
    locations: int = Field(default=1, ge=1, le=50)
    method: Literal["card", "transfer"]
    payer_name: str = Field(min_length=2, max_length=160)
    payer_bin: str = Field(default="", max_length=12)
    payer_email: str = Field(min_length=3, max_length=254)
    auto_renew: bool = False

    @field_validator("payer_bin")
    @classmethod
    def valid_bin(cls, value):
        value = value.strip()
        if value and (len(value) != 12 or not value.isdigit()):
            raise ValueError("БИН/ИИН — 12 цифр")
        return value

    @field_validator("payer_email")
    @classmethod
    def valid_email(cls, value):
        value = value.strip().casefold()
        if value.count("@") != 1 or "." not in value.rsplit("@", 1)[-1] or any(char.isspace() for char in value):
            raise ValueError("Укажите корректный email")
        return value


class AutoRenewRequest(Input):
    enabled: Literal[False]


def owner_only(db):
    if db.info.get("demo_access"):
        raise HTTPException(403, "Оплата недоступна в демонстрационном пространстве")
    return db.info["bakery_id"]


@router.get("/plans")
def plans():
    return billing.plans_json()


@router.post("/checkout", status_code=201)
def checkout(payload: CheckoutRequest, request: Request, db: ScopedDB):
    bakery_id = owner_only(db)
    limiter.check("checkout", f"{bakery_id}:{peer_key(request)}", limit=20, window=3600)
    existing = db.scalar(select(func.count()).select_from(BakeryLocation)) or 1
    if payload.locations < existing:
        raise HTTPException(422, f"У организации {existing} точек: оплатите не меньше {existing}.")
    row = billing.create_invoice(db, bakery_id, payload.months, payload.locations, payload.method, payload.payer_name,
                                 payload.payer_bin, payload.payer_email, payload.auto_renew)
    db.commit()
    billing.notify_invoice(db, row)
    out = {"invoice": billing.invoice_json(row, with_seller=row.method == "transfer")}
    if row.method == "card":
        out["widget"] = billing.widget_params(row)
    return out


@router.get("/invoices")
def invoices(db: ScopedDB):
    bakery_id = owner_only(db)
    rows = db.scalars(select(BillingInvoice).where(BillingInvoice.bakery_id == bakery_id).order_by(BillingInvoice.id.desc()).limit(50))
    return {"invoices": [billing.invoice_json(row) for row in rows]}


@router.get("/invoices/{number}")
def invoice(number: str, db: ScopedDB):
    bakery_id = owner_only(db)
    row = billing.find_invoice(db, number)
    if row is None or row.bakery_id != bakery_id:
        raise HTTPException(404, "Счёт не найден")
    return billing.invoice_json(row, with_seller=True)


@router.post("/invoices/{number}/cancel")
def cancel_invoice(number: str, db: ScopedDB):
    bakery_id = owner_only(db)
    row = billing.find_invoice(db, number)
    if row is None or row.bakery_id != bakery_id:
        raise HTTPException(404, "Счёт не найден")
    if row.status != "pending":
        raise HTTPException(409, "Отменить можно только неоплаченный счёт")
    row.status, row.failure_reason = "cancelled", "Отменён организацией"
    db.commit()
    return billing.invoice_json(row)


@router.post("/auto-renew")
def auto_renew(payload: AutoRenewRequest, db: ScopedDB):
    bakery_id = owner_only(db)
    sub = db.scalar(select(Subscription).where(Subscription.bakery_id == bakery_id))
    if sub is None or not sub.auto_renew:
        return {"auto_renew": False}
    billing.cancel_recurring(db, sub)
    db.commit()
    return {"auto_renew": False}


@router.post("/simulate/{number}")
def simulate_payment(number: str, db: ScopedDB):
    """Local demo only (BILLING_SIMULATOR=true, test mode, no TipTop keys): pay an invoice without money."""
    bakery_id = owner_only(db)
    if not billing.simulator_enabled():
        raise HTTPException(404, "Not found")
    row = billing.find_invoice(db, number)
    if row is None or row.bakery_id != bakery_id or row.method != "card":
        raise HTTPException(404, "Счёт не найден")
    billing.mark_paid(db, row, tx_id=f"sim-{row.number}")
    db.commit()
    return billing.invoice_json(row)


# ------------------------------------------------------------------ TipTop Pay notifications
async def notification(request: Request) -> dict:
    raw = await request.body()
    if len(raw) > 64_000 or not billing.verify_signature(raw, request.headers):
        raise HTTPException(401, "Invalid signature")
    if "json" in request.headers.get("content-type", ""):
        try:
            data = json.loads(raw.decode())
        except ValueError:
            raise HTTPException(400, "Bad payload")
        return data if isinstance(data, dict) else {}
    return dict(parse_qsl(raw.decode("utf-8", "replace"), keep_blank_values=True))


@router.post("/tiptop/check")
async def tiptop_check(request: Request, db: DB):
    data = await notification(request)
    return {"code": billing.check_notification(db, data)}


@router.post("/tiptop/pay")
async def tiptop_pay(request: Request, db: DB):
    data = await notification(request)
    billing.pay_notification(db, data)
    db.commit()
    return {"code": 0}


@router.post("/tiptop/fail")
async def tiptop_fail(request: Request, db: DB):
    data = await notification(request)
    billing.fail_notification(db, data)
    db.commit()
    return {"code": 0}


@router.post("/tiptop/recurrent")
async def tiptop_recurrent(request: Request, db: DB):
    data = await notification(request)
    billing.recurrent_notification(db, data)
    db.commit()
    return {"code": 0}

