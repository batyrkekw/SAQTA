"""Add source-preserving observations and idempotent assortment runs.

Revision ID: d1e2f3a4b5c6
Revises: b7a1f2d4e6c8
"""
from alembic import op
import sqlalchemy as sa

revision = "d1e2f3a4b5c6"
down_revision = "b7a1f2d4e6c8"
branch_labels = None
depends_on = None


def upgrade():
    def timestamps():
        return [sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False)]
    op.create_table("forecast_observations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bakery_id", sa.Integer(), sa.ForeignKey("bakeries.id"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("location_id", sa.Integer(), sa.ForeignKey("bakery_locations.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False), sa.Column("sold", sa.Integer(), nullable=False),
        sa.Column("remaining", sa.Integer(), nullable=True), sa.Column("produced", sa.Integer(), nullable=True),
        sa.Column("unit_price_kzt", sa.Integer(), nullable=True), sa.Column("source_origin", sa.String(10), nullable=False),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("import_batches.id"), nullable=False),
        sa.Column("source_row", sa.Integer(), nullable=False), *timestamps(),
        sa.UniqueConstraint("bakery_id", "product_id", "location_id", "date", name="uq_observation_day"),
        sa.CheckConstraint("sold >= 0 AND (remaining IS NULL OR remaining >= 0) AND (produced IS NULL OR produced >= 0) AND (unit_price_kzt IS NULL OR unit_price_kzt >= 0)", name="observation_nonnegative"),
        sa.CheckConstraint("source_origin IN ('demo', 'real')", name="observation_origin_valid"))
    for field in ("bakery_id", "product_id", "location_id", "date", "batch_id"):
        op.create_index(f"ix_forecast_observations_{field}", "forecast_observations", [field])
    op.create_table("forecast_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bakery_id", sa.Integer(), sa.ForeignKey("bakeries.id"), nullable=False),
        sa.Column("idempotency_key", sa.String(120), nullable=True),
        sa.Column("request_json", sa.Text(), nullable=False), sa.Column("result_json", sa.Text(), nullable=False),
        *timestamps(), sa.UniqueConstraint("bakery_id", "idempotency_key", name="uq_forecast_run_key"))
    op.create_index("ix_forecast_runs_bakery_id", "forecast_runs", ["bakery_id"])


def downgrade():
    op.drop_table("forecast_runs")
    op.drop_table("forecast_observations")
