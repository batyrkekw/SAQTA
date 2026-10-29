from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import now_utc
from app.db.session import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class Bakery(TimestampMixin, Base):
    __tablename__ = "bakeries"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(100), default="Астана")


class BakeryLocation(TimestampMixin, Base):
    __tablename__ = "bakery_locations"
    id: Mapped[int] = mapped_column(primary_key=True)
    bakery_id: Mapped[int] = mapped_column(ForeignKey("bakeries.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    address: Mapped[str] = mapped_column(String(250))
    city: Mapped[str] = mapped_column(String(100), default="Астана")


class Product(TimestampMixin, Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    bakery_id: Mapped[int] = mapped_column(ForeignKey("bakeries.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(60))
    unit: Mapped[str] = mapped_column(String(20), default="шт.")
    price_kzt: Mapped[int] = mapped_column(Integer)
    price_known: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    cost_kzt: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_grams: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_test_data: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    __table_args__ = (CheckConstraint("price_kzt >= 0 AND (cost_kzt IS NULL OR cost_kzt >= 0) AND weight_grams >= 0", name="product_nonnegative"),)


class InventorySnapshot(TimestampMixin, Base):
    __tablename__ = "inventory_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("bakery_locations.id"), index=True)
    on_hand: Mapped[int] = mapped_column(Integer, default=0)
    reserved: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (UniqueConstraint("product_id", "location_id"), CheckConstraint("on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand", name="valid_inventory"))


class RecordMixin(TimestampMixin):
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("bakery_locations.id"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    quantity: Mapped[int] = mapped_column(Integer)


class ProductionRecord(RecordMixin, Base):
    __tablename__ = "production_records"
    __table_args__ = (CheckConstraint("quantity > 0", name="production_positive"), Index("ix_production_product_location_date", "product_id", "location_id", "date"))


class SalesRecord(RecordMixin, Base):
    __tablename__ = "sales_records"
    unit_price_kzt: Mapped[int] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(20), default="regular")
    __table_args__ = (CheckConstraint("quantity > 0 AND unit_price_kzt >= 0", name="sales_positive"), Index("ix_sales_product_location_date", "product_id", "location_id", "date"))


class WasteRecord(RecordMixin, Base):
    __tablename__ = "waste_records"
    reason: Mapped[str] = mapped_column(String(250))
    unit_cost_kzt: Mapped[int] = mapped_column(Integer, default=0)
    weight_grams: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (CheckConstraint("quantity > 0 AND unit_cost_kzt >= 0 AND weight_grams >= 0", name="waste_positive"),)


class Forecast(TimestampMixin, Base):
    __tablename__ = "forecasts"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("bakery_locations.id"), index=True)
    target_date: Mapped[date] = mapped_column(Date, index=True)
    horizon_days: Mapped[int] = mapped_column(Integer, default=1)
    result_json: Mapped[str] = mapped_column(Text)


class SurplusListing(TimestampMixin, Base):
    __tablename__ = "surplus_listings"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("bakery_locations.id"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    available_quantity: Mapped[int] = mapped_column(Integer)
    reserved_quantity: Mapped[int] = mapped_column(Integer, default=0)
    collected_quantity: Mapped[int] = mapped_column(Integer, default=0)
    original_price_kzt: Mapped[int | None] = mapped_column(Integer, nullable=True)
    discounted_price_kzt: Mapped[int] = mapped_column(Integer)
    pickup_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    pickup_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    description: Mapped[str] = mapped_column(String(1000), default="")
    terms: Mapped[str] = mapped_column(String(20), default="discounted", server_default="discounted")
    bulk_available: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    photo: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    photo_mime: Mapped[str | None] = mapped_column(String(30), nullable=True)
    is_test_data: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    __table_args__ = (CheckConstraint("quantity > 0 AND available_quantity >= 0 AND reserved_quantity >= 0 AND collected_quantity >= 0", name="listing_nonnegative"), CheckConstraint("discounted_price_kzt >= 0 AND (original_price_kzt IS NULL OR discounted_price_kzt <= original_price_kzt)", name="listing_discount"),)


class Order(TimestampMixin, Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    bakery_id: Mapped[int | None] = mapped_column(ForeignKey("bakeries.id"), nullable=True, index=True)
    buyer_id: Mapped[int | None] = mapped_column(ForeignKey("auth_users.id"), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(20), default="individual", server_default="individual")
    beneficiaries: Mapped[int | None] = mapped_column(Integer, nullable=True)
    logistics: Mapped[str] = mapped_column(String(1000), default="", server_default="")
    customer_name: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default="reserved", index=True)
    total_kzt: Mapped[int] = mapped_column(BigInteger)
    collected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    commission_rate_bps: Mapped[int] = mapped_column(Integer, default=500, server_default="500")
    commission_tiyn: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    seller_proceeds_tiyn: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    commission_recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    request_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_test_data: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    __table_args__ = (
        CheckConstraint("total_kzt >= 0", name="order_total_nonnegative"),
        CheckConstraint("commission_rate_bps = 500 AND commission_tiyn >= 0 AND seller_proceeds_tiyn >= 0", name="order_commission_nonnegative"),
        CheckConstraint("(status = 'collected' AND commission_tiyn = total_kzt * 5 AND seller_proceeds_tiyn = total_kzt * 95) OR (status != 'collected' AND commission_tiyn = 0 AND seller_proceeds_tiyn = 0)", name="order_settlement_balanced"),
        UniqueConstraint("bakery_id", "idempotency_key", name="uq_order_bakery_idempotency"),
    )


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("surplus_listings.id"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price_kzt: Mapped[int] = mapped_column(Integer)
    weight_grams: Mapped[int] = mapped_column(Integer)
    __table_args__ = (CheckConstraint("quantity > 0 AND unit_price_kzt >= 0 AND weight_grams >= 0", name="order_item_positive"),)


class ApplicationSettings(TimestampMixin, Base):
    __tablename__ = "application_settings"
    id: Mapped[int] = mapped_column(primary_key=True)
    bakery_id: Mapped[int] = mapped_column(ForeignKey("bakeries.id"), unique=True)
    currency: Mapped[str] = mapped_column(String(3), default="KZT")
    workspace_mode: Mapped[str] = mapped_column(String(10), default="demo", server_default="demo")
    safety_buffer_percent: Mapped[int] = mapped_column(Integer, default=10)
    __table_args__ = (CheckConstraint("safety_buffer_percent >= 0 AND safety_buffer_percent <= 100", name="buffer_range"), CheckConstraint("workspace_mode IN ('demo', 'real')", name="workspace_mode_valid"))


from app.models.imports import ImportBatch, ImportFingerprint  # noqa: E402,F401
from app.models.identity import AuthSession, AuthUser, QuotaEvent, Subscription, SubscriptionUsage  # noqa: E402,F401
from app.models.observations import ForecastObservation, ForecastRun  # noqa: E402,F401

from app.models.workflows import BusinessProfile, OrderEvent  # noqa: E402,F401
