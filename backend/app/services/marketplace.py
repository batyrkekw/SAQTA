from datetime import timedelta
import hashlib
import json

from fastapi import HTTPException
from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import aware, now_utc, today_local
from app.db.session import require_row
from app.models import BakeryLocation, Order, OrderItem, OrderEvent, Bakery, Product, SalesRecord, SurplusListing
from app.schemas import ListingCreate, ListingPatch, OrderCreate
from app.services.inventory import adjust_stock
from app.services.commission import settlement_json, split_sale


def validate_window(start, deadline):
    start, deadline = aware(start), aware(deadline)
    if deadline <= start or deadline <= now_utc():
        raise HTTPException(422, "Время окончания должно быть позже начала и текущего времени")
    if deadline > now_utc() + timedelta(days=365):
        raise HTTPException(422, "Окно выдачи не должно превышать один год")
    return start, deadline


def create_listing(db: Session, payload: ListingCreate):
    product = require_row(db, Product, payload.product_id, "Товар")
    if not product.is_active:
        raise HTTPException(422, "Выберите активный товар")
    if product.price_known and payload.discounted_price_kzt > product.price_kzt:
        raise HTTPException(422, "Цена предложения не должна превышать обычную цену")
    start, deadline = validate_window(payload.pickup_start, payload.pickup_deadline)
    if payload.terms in {"free", "negotiated"} and payload.discounted_price_kzt != 0:
        raise HTTPException(422, "Для бесплатной передачи или согласования укажите цену 0")
    if payload.terms == "negotiated" and not payload.bulk_available:
        raise HTTPException(422, "Согласование условий доступно через заявки организаций")
    if payload.expires_at and aware(payload.expires_at) < deadline:
        raise HTTPException(422, "Выдача должна завершиться до срока годности")
    adjust_stock(db, payload.product_id, payload.location_id, reserved_delta=payload.quantity)
    listing = SurplusListing(**payload.model_dump(exclude={"pickup_start", "pickup_deadline"}), pickup_start=start, pickup_deadline=deadline,
                             original_price_kzt=product.price_kzt if product.price_known else None, available_quantity=payload.quantity, reserved_quantity=0, collected_quantity=0, status="active",
                             is_test_data=product.is_test_data or bool(db.info.get("include_test_data")))
    db.add(listing)
    db.flush()
    return listing


def patch_listing(db: Session, listing_id: int, payload: ListingPatch):
    listing = db.scalar(select(SurplusListing).where(SurplusListing.id == listing_id).with_for_update().execution_options(populate_existing=True))
    if not listing:
        raise HTTPException(404, "Предложение не найдено")
    if listing.status == "expired":
        raise HTTPException(409, "Срок предложения истёк. Создайте новое предложение после проверки свежести.")
    fields = payload.model_dump(exclude_unset=True, exclude_none=True)
    start, deadline = validate_window(fields.get("pickup_start", listing.pickup_start), fields.get("pickup_deadline", listing.pickup_deadline))
    price = fields.get("discounted_price_kzt", listing.discounted_price_kzt)
    if listing.original_price_kzt is not None and price > listing.original_price_kzt:
        raise HTTPException(422, "Цена предложения не должна превышать обычную цену")
    if listing.terms in {"free", "negotiated"} and price != 0:
        raise HTTPException(422, "Для бесплатной передачи или согласования укажите цену 0")
    if listing.expires_at and deadline > aware(listing.expires_at):
        raise HTTPException(422, "Выдача должна завершиться до срока годности")
    total = fields.get("quantity", listing.quantity)
    status = fields.get("status", listing.status)
    if total < listing.reserved_quantity + listing.collected_quantity:
        raise HTTPException(409, "Количество меньше уже заказанного и выданного")
    new_available = total - listing.reserved_quantity - listing.collected_quantity if status == "active" else 0
    old_available = listing.available_quantity
    adjust_stock(db, listing.product_id, listing.location_id, reserved_delta=new_available - old_available)
    changed = db.execute(update(SurplusListing).where(
        SurplusListing.id == listing.id,
        SurplusListing.available_quantity == old_available,
        SurplusListing.reserved_quantity == listing.reserved_quantity,
    ).values(quantity=total, available_quantity=new_available, status=status, discounted_price_kzt=price,
             pickup_start=start, pickup_deadline=deadline, description=fields.get("description", listing.description)),
        execution_options={"synchronize_session": False}).rowcount
    if changed != 1:
        raise HTTPException(409, "Предложение изменилось. Обновите данные и повторите действие.")
    db.refresh(listing)
    return listing


def _order_request_hash(payload: OrderCreate):
    return hashlib.sha256(json.dumps({"customer_name": payload.customer_name, "items": sorted(
        [(item.listing_id, item.quantity) for item in payload.items])}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def create_order(db: Session, payload: OrderCreate):
    try:
        return _create_order(db, payload)
    except IntegrityError:
        # The unique key is the cross-process fallback (including SQLite).
        # Roll back all reservation writes before looking up the winning request.
        db.rollback()
        if payload.idempotency_key:
            listing = require_row(db, SurplusListing, payload.items[0].listing_id, "Предложение")
            product = require_row(db, Product, listing.product_id, "Товар")
            existing = db.scalar(select(Order).where(Order.bakery_id == product.bakery_id, Order.idempotency_key == payload.idempotency_key))
            if existing and existing.request_hash == _order_request_hash(payload):
                return existing
        raise HTTPException(409, "Заказ изменился или ключ уже использован. Обновите данные перед новым заказом.")


def _create_order(db: Session, payload: OrderCreate):
    first_listing = require_row(db, SurplusListing, payload.items[0].listing_id, "Предложение")
    first_product = require_row(db, Product, first_listing.product_id, "Товар")
    owner_id = db.info.get("bakery_id") or first_product.bakery_id
    if first_product.bakery_id != owner_id:
        raise HTTPException(404, "Предложение не найдено")
    request_hash = _order_request_hash(payload)
    if payload.idempotency_key:
        # A transaction-level PostgreSQL lock serializes the same key, including
        # the case where its first order row does not yet exist. Values are bound.
        if db.bind.dialect.name == "postgresql":
            lock_key = int.from_bytes(hashlib.sha256(f"save:{owner_id}:{payload.idempotency_key}".encode()).digest()[:8], "big", signed=True)
            db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})
        existing = db.scalar(select(Order).where(Order.bakery_id == owner_id, Order.idempotency_key == payload.idempotency_key))
        if existing:
            if existing.request_hash != request_hash:
                raise HTTPException(409, "Этот ключ заказа уже использован с другими данными")
            return existing
    order = Order(bakery_id=owner_id, customer_name=payload.customer_name, status="reserved", total_kzt=0,
                  idempotency_key=payload.idempotency_key, request_hash=request_hash,
                  is_test_data=first_listing.is_test_data or bool(db.info.get("include_test_data")))
    db.add(order)
    db.flush()
    for line in sorted(payload.items, key=lambda x: x.listing_id):
        listing = db.scalar(select(SurplusListing).where(SurplusListing.id == line.listing_id).with_for_update().execution_options(populate_existing=True))
        if not listing:
            raise HTTPException(404, "Предложение не найдено")
        product = require_row(db, Product, listing.product_id, "Товар")
        if product.bakery_id != owner_id:
            raise HTTPException(422, "Один заказ должен относиться к одной организации")
        updated = db.execute(update(SurplusListing).where(
            SurplusListing.id == line.listing_id,
            SurplusListing.status == "active",
            SurplusListing.pickup_deadline > now_utc(),
            SurplusListing.available_quantity >= line.quantity,
        ).values(available_quantity=SurplusListing.available_quantity - line.quantity,
                 reserved_quantity=SurplusListing.reserved_quantity + line.quantity),
            execution_options={"synchronize_session": False}).rowcount
        if updated != 1:
            raise HTTPException(409, "Товар закончился или срок выдачи истёк. Обновите витрину.")
        db.add(OrderItem(order_id=order.id, listing_id=listing.id, quantity=line.quantity,
                         unit_price_kzt=listing.discounted_price_kzt, weight_grams=product.weight_grams))
        order.total_kzt += listing.discounted_price_kzt * line.quantity
        db.expire(listing)
    db.flush()
    return order


def transition_order(db: Session, order_id: int, action: str, expired: bool = False):
    order = require_row(db, Order, order_id, "Заказ")
    items = list(db.scalars(select(OrderItem).where(OrderItem.order_id == order.id).order_by(OrderItem.listing_id)))
    if action == "collect" and order.status != "reserved":
        raise HTTPException(409, "Сначала подтвердите заявку")
    if action == "collect":
        for item in items:
            listing = db.get(SurplusListing, item.listing_id)
            if aware(listing.pickup_start) > now_utc() or aware(listing.pickup_deadline) <= now_utc():
                raise HTTPException(409, "Выдача доступна только в указанное окно самовывоза")
    elif not expired and any(aware(db.get(SurplusListing, i.listing_id).pickup_deadline) <= now_utc() for i in items):
        raise HTTPException(409, "Срок заказа истёк; резерв будет освобождён автоматически")
    status = "collected" if action == "collect" else "cancelled"
    commission, proceeds = split_sale(order.total_kzt) if action == "collect" else (0, 0)
    recorded_at = now_utc() if action == "collect" else None
    changed = db.execute(update(Order).where(Order.id == order.id, Order.status.in_(["reserved", "pending"])).values(
        status=status, collected_at=recorded_at,
        commission_tiyn=commission, seller_proceeds_tiyn=proceeds, commission_recorded_at=recorded_at), execution_options={"synchronize_session": False}).rowcount
    if changed != 1:
        raise HTTPException(409, "Можно изменить только заказ со статусом «Зарезервирован»")
    for item in items:
        listing = db.scalar(select(SurplusListing).where(SurplusListing.id == item.listing_id).with_for_update().execution_options(populate_existing=True))
        if action == "collect":
            adjust_stock(db, listing.product_id, listing.location_id, on_hand_delta=-item.quantity, reserved_delta=-item.quantity)
            listing.reserved_quantity -= item.quantity
            listing.collected_quantity += item.quantity
            db.add(SalesRecord(product_id=listing.product_id, location_id=listing.location_id, date=today_local(),
                               quantity=item.quantity, unit_price_kzt=item.unit_price_kzt, source="save"))
        else:
            listing.reserved_quantity -= item.quantity
            if listing.status == "active" and aware(listing.pickup_deadline) > now_utc():
                listing.available_quantity += item.quantity
            else:
                adjust_stock(db, listing.product_id, listing.location_id, reserved_delta=-item.quantity)
    db.add(OrderEvent(bakery_id=order.bakery_id, order_id=order.id, actor_id=db.info.get("user_id"), status=status))
    db.flush()
    db.refresh(order)
    return order


def expire_reservations(db: Session):
    """Expired reservations are released transactionally before marketplace/inventory actions."""
    expired_ids = set(db.scalars(select(SurplusListing.id).where(SurplusListing.pickup_deadline <= now_utc())))
    if not expired_ids:
        return
    order_ids = set(db.scalars(select(OrderItem.order_id).join(Order).where(OrderItem.listing_id.in_(expired_ids), Order.status.in_(["reserved", "pending"]))))
    for order_id in sorted(order_ids):
        transition_order(db, order_id, "cancel", expired=True)
    for listing in db.scalars(select(SurplusListing).where(SurplusListing.id.in_(expired_ids), SurplusListing.status == "active").with_for_update()):
        if listing.available_quantity:
            adjust_stock(db, listing.product_id, listing.location_id, reserved_delta=-listing.available_quantity)
        listing.available_quantity = 0
        listing.status = "expired"
    db.flush()


def listing_json(db: Session, row):
    product, location = db.get(Product, row.product_id), db.get(BakeryLocation, row.location_id)
    return {
        **{key: getattr(row, key) for key in ("id", "product_id", "location_id", "quantity", "available_quantity", "reserved_quantity", "original_price_kzt", "discounted_price_kzt", "status", "description")},
        "pickup_start": aware(row.pickup_start), "pickup_deadline": aware(row.pickup_deadline),
        "product_name": product.name, "category": product.category, "weight_grams": product.weight_grams,
        "location_name": location.name, "address": location.address, "city": location.city,
        "business_name": db.get(Bakery, product.bakery_id).name, "unit": product.unit,
        "terms": row.terms, "bulk_available": row.bulk_available,
        "expires_at": aware(row.expires_at) if row.expires_at else None,
        "photo_url": f"/market/listings/{row.id}/photo" if row.photo else None,
        "publication_fee_tiyn": 0, "sales_commission_percent": 5,
    }


def order_json(db: Session, row):
    items = []
    price_approved = db.scalar(select(OrderEvent.id).where(OrderEvent.order_id == row.id, OrderEvent.status == "reserved").limit(1)) is not None
    for item in db.scalars(select(OrderItem).where(OrderItem.order_id == row.id)):
        listing = db.get(SurplusListing, item.listing_id)
        items.append({"id": item.id, "listing_id": item.listing_id, "product_name": db.get(Product, listing.product_id).name,
                      "quantity": item.quantity, "unit_price_kzt": item.unit_price_kzt,
                      "terms": listing.terms, "price_agreed": listing.terms != "negotiated" or price_approved,
                      "original_unit_price_kzt": listing.original_price_kzt, "pickup_deadline": aware(listing.pickup_deadline),
                      "location_name": db.get(BakeryLocation, listing.location_id).name})
    return {"id": row.id, "status": row.status, "customer_name": row.customer_name, "total_kzt": row.total_kzt,
            "created_at": aware(row.created_at), "items": items, "settlement": settlement_json(row),
            "buyer_id": row.buyer_id, "kind": row.kind, "beneficiaries": row.beneficiaries, "logistics": row.logistics,
            "events": [{"status": event.status, "created_at": aware(event.created_at)} for event in db.scalars(select(OrderEvent).where(OrderEvent.order_id == row.id).order_by(OrderEvent.id))]}
