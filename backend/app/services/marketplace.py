from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import aware, now_utc, today_local
from app.db.session import require_row
from app.models import BakeryLocation, Order, OrderItem, Product, SalesRecord, SurplusListing
from app.schemas import ListingCreate, ListingPatch, OrderCreate
from app.services.inventory import adjust_stock


def validate_window(start, deadline):
    start, deadline = aware(start), aware(deadline)
    if deadline <= start or deadline <= now_utc():
        raise HTTPException(422, "Время окончания должно быть позже начала и текущего времени")
    if deadline > now_utc() + timedelta(hours=48):
        raise HTTPException(422, "Для демо окно выдачи ограничено ближайшими 48 часами. Проверьте свежесть товара.")
    return start, deadline


def create_listing(db: Session, payload: ListingCreate):
    product = require_row(db, Product, payload.product_id, "Товар")
    if not product.is_active:
        raise HTTPException(422, "Выберите активный товар")
    if payload.discounted_price_kzt >= product.price_kzt:
        raise HTTPException(422, "Цена со скидкой должна быть ниже обычной цены")
    start, deadline = validate_window(payload.pickup_start, payload.pickup_deadline)
    adjust_stock(db, payload.product_id, payload.location_id, reserved_delta=payload.quantity)
    listing = SurplusListing(**payload.model_dump(exclude={"pickup_start", "pickup_deadline"}), pickup_start=start, pickup_deadline=deadline,
                             original_price_kzt=product.price_kzt, available_quantity=payload.quantity, reserved_quantity=0, collected_quantity=0, status="active")
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
    if price >= listing.original_price_kzt:
        raise HTTPException(422, "Цена со скидкой должна быть ниже обычной цены")
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


def create_order(db: Session, payload: OrderCreate):
    order = Order(customer_name=payload.customer_name, status="reserved", total_kzt=0)
    db.add(order)
    db.flush()
    for line in sorted(payload.items, key=lambda x: x.listing_id):
        listing = db.scalar(select(SurplusListing).where(SurplusListing.id == line.listing_id).with_for_update().execution_options(populate_existing=True))
        if not listing:
            raise HTTPException(404, "Предложение не найдено")
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
        product = db.get(Product, listing.product_id)
        db.add(OrderItem(order_id=order.id, listing_id=listing.id, quantity=line.quantity,
                         unit_price_kzt=listing.discounted_price_kzt, weight_grams=product.weight_grams))
        order.total_kzt += listing.discounted_price_kzt * line.quantity
        db.expire(listing)
    db.flush()
    return order


def transition_order(db: Session, order_id: int, action: str, expired: bool = False):
    order = require_row(db, Order, order_id, "Заказ")
    items = list(db.scalars(select(OrderItem).where(OrderItem.order_id == order.id).order_by(OrderItem.listing_id)))
    if action == "collect":
        for item in items:
            listing = db.get(SurplusListing, item.listing_id)
            if aware(listing.pickup_start) > now_utc() or aware(listing.pickup_deadline) <= now_utc():
                raise HTTPException(409, "Выдача доступна только в указанное окно самовывоза")
    elif not expired and any(aware(db.get(SurplusListing, i.listing_id).pickup_deadline) <= now_utc() for i in items):
        raise HTTPException(409, "Срок заказа истёк; резерв будет освобождён автоматически")
    status = "collected" if action == "collect" else "cancelled"
    changed = db.execute(update(Order).where(Order.id == order.id, Order.status == "reserved").values(
        status=status, collected_at=now_utc() if action == "collect" else None), execution_options={"synchronize_session": False}).rowcount
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
    db.flush()
    db.refresh(order)
    return order


def expire_reservations(db: Session):
    """Expired reservations are released transactionally before marketplace/inventory actions."""
    expired_ids = set(db.scalars(select(SurplusListing.id).where(SurplusListing.pickup_deadline <= now_utc())))
    if not expired_ids:
        return
    order_ids = set(db.scalars(select(OrderItem.order_id).join(Order).where(OrderItem.listing_id.in_(expired_ids), Order.status == "reserved")))
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
        "location_name": location.name, "address": location.address,
    }


def order_json(db: Session, row):
    items = []
    for item in db.scalars(select(OrderItem).where(OrderItem.order_id == row.id)):
        listing = db.get(SurplusListing, item.listing_id)
        items.append({"id": item.id, "listing_id": item.listing_id, "product_name": db.get(Product, listing.product_id).name,
                      "quantity": item.quantity, "unit_price_kzt": item.unit_price_kzt, "pickup_deadline": aware(listing.pickup_deadline),
                      "location_name": db.get(BakeryLocation, listing.location_id).name})
    return {"id": row.id, "status": row.status, "customer_name": row.customer_name, "total_kzt": row.total_kzt, "created_at": aware(row.created_at), "items": items}
