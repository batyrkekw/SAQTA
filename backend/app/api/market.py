"""Public real offers; all cross-organization actions have explicit actor checks.

The existing tenant-scoped inventory/order services perform the atomic writes.
Public reads deliberately use an unscoped session and a real-origin predicate.
"""

from datetime import datetime
from typing import Annotated, Literal
import io
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from app.core.config import now_utc, today_local
from app.db.session import get_db, scoped_db, require_row
from app.models import ApplicationSettings, BakeryLocation, Order, OrderEvent, OrderItem, Product, SurplusListing
from app.schemas import Input, ListingCreate, ListingPatch, OrderCreate, OrderLine, RecordCreate
from app.services.auth import authenticated_user, require_business
from app.services.inventory import create_record
from app.services.marketplace import (
    create_listing,
    create_order,
    expire_reservations,
    listing_json,
    order_json,
    patch_listing,
    transition_order,
)

router = APIRouter(prefix="/api/market", tags=["SAQTA SAVE"])
DB = Annotated[Session, Depends(get_db)]
Scoped = Annotated[Session, Depends(scoped_db)]


def real_offers():
    return (
        select(SurplusListing)
        .join(Product)
        .join(ApplicationSettings, ApplicationSettings.bakery_id == Product.bakery_id)
        .where(
            ApplicationSettings.workspace_mode == "real",
            Product.is_test_data.is_(False),
            SurplusListing.is_test_data.is_(False),
        )
    )


def public_offer(db, listing_id):
    row = db.scalar(real_offers().where(SurplusListing.id == listing_id))
    if row is None:
        raise HTTPException(404, "Предложение не найдено")
    return row


@router.get("/listings")
def offers(
    db: DB,
    search: str = "",
    category: str = "",
    city: str = "",
    max_price: int | None = None,
    min_discount: int = 0,
    charity: bool = False,
):
    q = (
        real_offers()
        .where(
            SurplusListing.status == "active",
            SurplusListing.available_quantity > 0,
            SurplusListing.pickup_deadline > now_utc(),
        )
        .order_by(SurplusListing.pickup_deadline)
    )
    if search:
        q = q.where(or_(Product.name.ilike(f"%{search[:120]}%"), Product.category.ilike(f"%{search[:120]}%")))
    if category:
        q = q.where(Product.category == category)
    if city:
        q = q.join(BakeryLocation, SurplusListing.location_id == BakeryLocation.id).where(
            BakeryLocation.city.ilike(f"%{city[:100]}%")
        )
    if max_price is not None:
        q = q.where(SurplusListing.terms != "negotiated", SurplusListing.discounted_price_kzt <= max_price)
    if min_discount:
        q = q.where(
            SurplusListing.terms != "negotiated",
            SurplusListing.original_price_kzt > 0,
            SurplusListing.discounted_price_kzt * 100 <= SurplusListing.original_price_kzt * (100 - min_discount),
        )
    if charity:
        q = q.where(SurplusListing.bulk_available.is_(True))
    return [listing_json(db, row) for row in db.scalars(q.limit(200))]


@router.get("/listings/{listing_id}")
def detail(listing_id: int, db: DB):
    return listing_json(db, public_offer(db, listing_id))


@router.get("/listings/{listing_id}/photo")
def photo(listing_id: int, db: DB):
    row = public_offer(db, listing_id)
    if not row.photo:
        raise HTTPException(404, "Фото не найдено")
    return Response(
        row.photo,
        media_type=row.photo_mime,
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=300"},
    )


class Publish(Input):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(min_length=1, max_length=60)
    unit: str = Field(min_length=1, max_length=20)
    quantity: int = Field(gt=0, le=100_000)
    original_price: int | None = Field(default=None, ge=0, le=10_000_000)
    price: int = Field(ge=0, le=10_000_000)
    terms: Literal["discounted", "free", "negotiated"] = "discounted"
    description: str = Field(default="", max_length=1000)
    location_id: int = Field(gt=0)
    pickup_start: datetime
    pickup_deadline: datetime
    expires_at: datetime
    bulk_available: bool = False
    stock_confirmed: Literal[True]


@router.post("/listings", status_code=201)
def publish(payload: Publish, db: Scoped):
    require_business(db)
    require_row(db, BakeryLocation, payload.location_id, "Точка")
    product = Product(
        bakery_id=db.info["bakery_id"],
        name=payload.name,
        category=payload.category,
        unit=payload.unit,
        price_kzt=payload.original_price or 0,
        price_known=payload.original_price is not None,
    )
    db.add(product)
    db.flush()
    # Explicitly confirmed physical receipt, never inferred from a forecast.
    create_record(
        db,
        RecordCreate(
            kind="production",
            product_id=product.id,
            location_id=payload.location_id,
            date=today_local(),
            quantity=payload.quantity,
        ),
    )
    row = create_listing(
        db,
        ListingCreate(
            product_id=product.id,
            location_id=payload.location_id,
            quantity=payload.quantity,
            discounted_price_kzt=payload.price,
            pickup_start=payload.pickup_start,
            pickup_deadline=payload.pickup_deadline,
            expires_at=payload.expires_at,
            description=payload.description,
            terms=payload.terms,
            bulk_available=payload.bulk_available,
        ),
    )
    db.commit()
    return listing_json(db, row)


@router.patch("/listings/{listing_id}")
def edit(listing_id: int, payload: ListingPatch, db: Scoped):
    require_business(db)
    row = patch_listing(db, listing_id, payload)
    db.commit()
    return listing_json(db, row)


@router.post("/listings/{listing_id}/photo")
async def upload_photo(listing_id: int, db: Scoped, file: UploadFile = File(...)):
    require_business(db)
    row = require_row(db, SurplusListing, listing_id, "Предложение")
    content = await file.read(2 * 1024 * 1024 + 1)
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(413, "Фото должно быть не больше 2 МБ")
    from PIL import Image, UnidentifiedImageError

    try:
        with Image.open(io.BytesIO(content)) as original:
            if original.format not in {"JPEG", "PNG", "WEBP"} or original.width * original.height > 16_000_000:
                raise ValueError()
            original.load()
            original.thumbnail((1600, 1600))
            output = io.BytesIO()
            original.convert("RGB").save(output, format="JPEG", quality=85)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, "Нужно корректное изображение JPEG, PNG или WebP")
    row.photo, row.photo_mime = output.getvalue(), "image/jpeg"
    db.commit()
    return {"photo_url": f"/market/listings/{row.id}/photo"}


class Reservation(Input):
    listing_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=100_000)
    customer_name: str = Field(min_length=1, max_length=100)
    kind: Literal["individual", "bulk"] = "individual"
    beneficiaries: int | None = Field(default=None, gt=0, le=1_000_000)
    logistics: str = Field(default="", max_length=1000)
    idempotency_key: str = Field(min_length=8, max_length=60, pattern=r"^[A-Za-z0-9_-]+$")


@router.post("/orders", status_code=201)
def reserve(payload: Reservation, request: Request, db: DB):
    user = authenticated_user(db, request)
    offer = public_offer(db, payload.listing_id)
    owner = db.get(Product, offer.product_id).bakery_id
    if owner == user.bakery_id:
        raise HTTPException(409, "Нельзя бронировать собственное предложение")
    if payload.kind == "bulk" and (user.role != "charity" or not offer.bulk_available):
        raise HTTPException(
            403, "Оптовые заявки доступны подтверждённым благотворительным организациям для подходящих предложений"
        )
    if offer.terms == "negotiated" and payload.kind != "bulk":
        raise HTTPException(422, "Условия этого предложения нужно согласовать через заявку организации")
    db.info.update(bakery_id=owner, user_id=user.id)
    expire_reservations(db)
    key = f"buyer:{user.id}:{payload.idempotency_key}"
    row = create_order(
        db,
        OrderCreate(
            customer_name=payload.customer_name,
            items=[OrderLine(listing_id=offer.id, quantity=payload.quantity)],
            idempotency_key=key,
        ),
    )
    if row.buyer_id is not None:
        if (row.buyer_id, row.kind, row.beneficiaries, row.logistics) != (
            user.id,
            payload.kind,
            payload.beneficiaries,
            payload.logistics,
        ):
            raise HTTPException(409, "Ключ заявки уже использован с другими данными")
    else:
        row.buyer_id, row.kind, row.beneficiaries, row.logistics = (
            user.id,
            payload.kind,
            payload.beneficiaries,
            payload.logistics,
        )
        row.status = "pending" if payload.kind == "bulk" else "reserved"
        db.add(OrderEvent(bakery_id=owner, order_id=row.id, actor_id=user.id, status=row.status))
    db.commit()
    return order_json(db, row)


@router.get("/my-listings")
def my_listings(db: Scoped):
    require_business(db)
    expire_reservations(db)
    db.commit()
    return [
        listing_json(db, row)
        for row in db.scalars(select(SurplusListing).order_by(SurplusListing.id.desc()).limit(200))
    ]


@router.get("/orders")
def orders(request: Request, db: DB):
    user = authenticated_user(db, request)
    # Expire only this actor's orders, not unrelated tenants' records.
    visible = (
        or_(Order.buyer_id == user.id, Order.bakery_id == user.bakery_id)
        if user.role == "business"
        else Order.buyer_id == user.id
    )
    rows = list(
        db.scalars(select(Order).where(visible, Order.is_test_data.is_(False)).order_by(Order.id.desc()).limit(200))
    )
    for row in rows:
        # Seller scope makes the existing expiry routine safe for its inventory.
        db.info.update(bakery_id=row.bakery_id, user_id=user.id)
        expire_reservations(db)
        db.info.pop("bakery_id", None)
    db.commit()
    return [{**order_json(db, row), "seller": row.bakery_id == user.bakery_id} for row in rows]


class OrderAction(Input):
    agreed_price_kzt: int | None = Field(default=None, ge=0, le=10_000_000)


@router.post("/orders/{order_id}/{action}")
def order_action(
    order_id: int,
    action: Literal["approve", "cancel", "collect"],
    request: Request,
    db: DB,
    payload: OrderAction | None = None,
):
    user = authenticated_user(db, request)
    row = db.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if row is None or not (row.buyer_id == user.id or (row.bakery_id == user.bakery_id and user.role == "business")):
        raise HTTPException(404, "Заказ не найден")
    seller = row.bakery_id == user.bakery_id and user.role == "business"
    if action != "cancel" and not seller:
        raise HTTPException(403, "Действие доступно только продавцу")
    db.info.update(bakery_id=row.bakery_id, user_id=user.id)
    expire_reservations(db)
    if action == "approve":
        if row.status != "pending":
            raise HTTPException(409, "Заявка уже обработана")
        items = list(db.scalars(select(OrderItem).where(OrderItem.order_id == row.id)))
        for item in items:
            offer = db.get(SurplusListing, item.listing_id)
            if offer.terms == "negotiated":
                price = payload.agreed_price_kzt if payload else None
                if price is None:
                    raise HTTPException(422, "Укажите согласованную цену за единицу перед подтверждением")
                if offer.original_price_kzt is not None and price > offer.original_price_kzt:
                    raise HTTPException(422, "Цена предложения не должна превышать обычную цену")
                item.unit_price_kzt = price
        row.total_kzt = sum(item.unit_price_kzt * item.quantity for item in items)
        row.status = "reserved"
        db.add(OrderEvent(bakery_id=row.bakery_id, order_id=row.id, actor_id=user.id, status="reserved"))
    else:
        row = transition_order(db, row.id, action)
    db.commit()
    return order_json(db, row)
