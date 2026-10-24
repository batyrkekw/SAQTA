from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import and_, create_engine, event, select
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker, with_loader_criteria

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def build_engine(url: str):
    engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 30} if url.startswith("sqlite") else {}, pool_pre_ping=True)
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def sqlite_config(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("PRAGMA busy_timeout=30000")
    return engine


engine = build_engine(get_settings().database_url)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def get_db():
    with SessionLocal() as session:
        try:
            yield session
        except Exception:
            session.rollback()
            raise


def scoped_db(request: Request, db: Annotated[Session, Depends(get_db)]):
    from app.services.auth import bind_request_scope
    bind_request_scope(db, request)
    return db


def tenant_predicate(model, bakery_id, include_test_data=False):
    from app.models import Bakery, BakeryLocation, Order, OrderItem, Product
    conditions = []
    if model is Bakery:
        conditions.append(model.id == bakery_id)
    elif hasattr(model, "bakery_id"):
        conditions.append(model.bakery_id == bakery_id)
    elif hasattr(model, "location_id"):
        conditions.append(model.location_id.in_(select(BakeryLocation.id).where(BakeryLocation.bakery_id == bakery_id)))
    if model is OrderItem:
        conditions.append(model.order_id.in_(select(Order.id).where(Order.bakery_id == bakery_id)))
    if hasattr(model, "product_id"):
        visible = select(Product.id).where(Product.bakery_id == bakery_id)
        if hasattr(Product, "is_test_data") and not include_test_data:
            visible = visible.where(Product.is_test_data.is_(False))
        conditions.append(model.product_id.in_(visible))
    if hasattr(model, "is_test_data") and not include_test_data:
        conditions.append(model.is_test_data.is_(False))
    return and_(*conditions) if conditions else None


@event.listens_for(Session, "do_orm_execute")
def restrict_organization_queries(state):
    """Every ORM read/update/delete is constrained, including analytics subqueries.

    Maintenance/seed sessions without a request scope remain explicit server-side
    operations. HTTP data sessions always receive a scope in get_db.
    """
    owner = state.session.info.get("bakery_id")
    if owner is None or not state.is_orm_statement:
        return
    if state.is_select:
        for mapper in Base.registry.mappers:
            condition = tenant_predicate(mapper.class_, owner, state.session.info.get("include_test_data", False))
            if condition is not None:
                state.statement = state.statement.options(with_loader_criteria(mapper.class_, condition, include_aliases=True))
    elif state.is_update or state.is_delete:
        mapper = state.bind_arguments.get("mapper")
        condition = tenant_predicate(mapper.class_, owner, state.session.info.get("include_test_data", False)) if mapper is not None else None
        if condition is not None:
            state.statement = state.statement.where(condition)


@event.listens_for(Session, "before_flush")
def validate_organization_writes(db, flush_context, instances):
    owner = db.info.get("bakery_id")
    if owner is None:
        return
    from app.models import Bakery, BakeryLocation, Order, OrderItem, Product, SurplusListing
    for row in list(db.new) + list(db.dirty) + list(db.deleted):
        if isinstance(row, Bakery):
            if row.id != owner:
                raise HTTPException(403, "Нет доступа к организации")
        elif hasattr(row, "bakery_id"):
            if isinstance(row, Order) and row in db.new and row.bakery_id is None:
                row.bakery_id = owner
            if row.bakery_id != owner:
                raise HTTPException(403, "Нет доступа к данным организации")
        if hasattr(row, "product_id") and db.get(Product, row.product_id) is None:
            raise HTTPException(404, "Товар не найден")
        if hasattr(row, "location_id") and db.get(BakeryLocation, row.location_id) is None:
            raise HTTPException(404, "Точка не найдена")
        if isinstance(row, OrderItem):
            if db.get(Order, row.order_id) is None or db.get(SurplusListing, row.listing_id) is None:
                raise HTTPException(404, "Заказ или предложение не найдены")


def require_row(db: Session, model, row_id: int, label: str):
    from fastapi import HTTPException
    row = db.get(model, row_id)
    if row is None:
        raise HTTPException(404, f"{label} не найден")
    return row
