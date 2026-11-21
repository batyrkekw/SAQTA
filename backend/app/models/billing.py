"""Billing: invoices paid by card (TipTop Pay) or bank transfer, and password reset tokens."""
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models import TimestampMixin


class BillingInvoice(TimestampMixin, Base):
    """One payable document. A paid invoice extends the organization's Forecast subscription once."""
    __tablename__ = "billing_invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    bakery_id: Mapped[int] = mapped_column(ForeignKey("bakeries.id"), index=True)
    number: Mapped[str] = mapped_column(String(30), unique=True)
    plan: Mapped[str] = mapped_column(String(12))
    months: Mapped[int] = mapped_column(Integer)
    locations: Mapped[int] = mapped_column(Integer, default=1)
    amount_kzt: Mapped[int] = mapped_column(Integer)
    method: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(12), default="pending")
    auto_renew: Mapped[bool] = mapped_column(default=False)
    payer_name: Mapped[str] = mapped_column(String(160))
    payer_bin: Mapped[str] = mapped_column(String(12), default="")
    payer_email: Mapped[str] = mapped_column(String(254))
    provider_tx_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    payment_reference: Mapped[str] = mapped_column(String(120), default="")
    failure_reason: Mapped[str] = mapped_column(String(200), default="")
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    __table_args__ = (
        CheckConstraint("plan IN ('starter','pro','business')", name="invoice_plan_valid"),
        CheckConstraint("locations BETWEEN 1 AND 50", name="invoice_locations_valid"),
        CheckConstraint("months IN (1,3,12)", name="invoice_months_valid"),
        CheckConstraint("method IN ('card','transfer')", name="invoice_method_valid"),
        CheckConstraint("status IN ('pending','paid','cancelled','failed')", name="invoice_status_valid"),
        CheckConstraint("amount_kzt > 0", name="invoice_amount_positive"),
    )


class PasswordResetToken(TimestampMixin, Base):
    __tablename__ = "password_reset_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("auth_users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
