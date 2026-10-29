"""Sales observations are evidence for forecasting, never invented stock movements."""
from datetime import date

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models import TimestampMixin


class ForecastObservation(TimestampMixin, Base):
    __tablename__ = "forecast_observations"
    id: Mapped[int] = mapped_column(primary_key=True)
    bakery_id: Mapped[int] = mapped_column(ForeignKey("bakeries.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("bakery_locations.id"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    sold: Mapped[int] = mapped_column()
    remaining: Mapped[int | None] = mapped_column(nullable=True)
    produced: Mapped[int | None] = mapped_column(nullable=True)
    unit_price_kzt: Mapped[int | None] = mapped_column(nullable=True)
    waste: Mapped[int | None] = mapped_column(Integer, nullable=True)
    opening: Mapped[int | None] = mapped_column(Integer, nullable=True)
    revenue: Mapped[int | None] = mapped_column(Integer, nullable=True)
    context_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_origin: Mapped[str] = mapped_column(String(10))
    batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"), index=True)
    source_row: Mapped[int] = mapped_column()
    __table_args__ = (
        UniqueConstraint("bakery_id", "product_id", "location_id", "date", name="uq_observation_day"),
        CheckConstraint("sold >= 0 AND (remaining IS NULL OR remaining >= 0) AND (produced IS NULL OR produced >= 0) AND (unit_price_kzt IS NULL OR unit_price_kzt >= 0)", name="observation_nonnegative"),
        CheckConstraint("source_origin IN ('demo', 'real')", name="observation_origin_valid"),
    )


class ForecastRun(TimestampMixin, Base):
    __tablename__ = "forecast_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    bakery_id: Mapped[int] = mapped_column(ForeignKey("bakeries.id"), index=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    request_json: Mapped[str] = mapped_column(Text)
    result_json: Mapped[str] = mapped_column(Text)
    __table_args__ = (UniqueConstraint("bakery_id", "idempotency_key", name="uq_forecast_run_key"),)
