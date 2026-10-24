"""Organization owners, revocable sessions and manually activated subscriptions."""
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models import TimestampMixin


class AuthUser(TimestampMixin, Base):
    __tablename__ = "auth_users"
    id: Mapped[int] = mapped_column(primary_key=True)
    bakery_id: Mapped[int] = mapped_column(ForeignKey("bakeries.id"), unique=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(250))


class AuthSession(TimestampMixin, Base):
    __tablename__ = "auth_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("auth_users.id"), index=True)
    bakery_id: Mapped[int] = mapped_column(ForeignKey("bakeries.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Subscription(TimestampMixin, Base):
    __tablename__ = "subscriptions"
    id: Mapped[int] = mapped_column(primary_key=True)
    bakery_id: Mapped[int] = mapped_column(ForeignKey("bakeries.id"), unique=True)
    plan: Mapped[str] = mapped_column(String(12), default="free")
    status: Mapped[str] = mapped_column(String(12), default="inactive")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    __table_args__ = (CheckConstraint("plan IN ('free','starter','pro')", name="subscription_plan_valid"),
                      CheckConstraint("status IN ('inactive','active','expired')", name="subscription_status_valid"))


class SubscriptionUsage(TimestampMixin, Base):
    __tablename__ = "subscription_usage"
    id: Mapped[int] = mapped_column(primary_key=True)
    bakery_id: Mapped[int] = mapped_column(ForeignKey("bakeries.id"), index=True)
    period: Mapped[str] = mapped_column(String(7))
    forecast_runs: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (UniqueConstraint("bakery_id", "period", name="uq_subscription_usage_month"),
                      CheckConstraint("forecast_runs >= 0", name="subscription_usage_nonnegative"))


class QuotaEvent(TimestampMixin, Base):
    __tablename__ = "quota_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    bakery_id: Mapped[int] = mapped_column(ForeignKey("bakeries.id"), index=True)
    request_key: Mapped[str] = mapped_column(String(150))
    period: Mapped[str] = mapped_column(String(7))
    __table_args__ = (UniqueConstraint("bakery_id", "request_key", name="uq_quota_event_key"),)
