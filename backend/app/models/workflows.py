"""Questionnaire estimates are stored separately from factual observations."""

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base
from app.models import TimestampMixin


class BusinessProfile(TimestampMixin, Base):
    __tablename__ = "business_profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    bakery_id: Mapped[int] = mapped_column(ForeignKey("bakeries.id"), unique=True)
    schema_version: Mapped[int] = mapped_column(Integer, default=1)
    answers_json: Mapped[str] = mapped_column(Text)


class OrderEvent(TimestampMixin, Base):
    __tablename__ = "order_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    bakery_id: Mapped[int] = mapped_column(ForeignKey("bakeries.id"), index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("auth_users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20))
