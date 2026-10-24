"""Organization owners, hashed sessions, subscription quota and order ownership.

Revision ID: b7a1f2d4e6c8
Revises: c83f42d78b91
"""
from alembic import op
import sqlalchemy as sa

revision = "b7a1f2d4e6c8"
down_revision = "c83f42d78b91"
branch_labels = None
depends_on = None


def timestamps():
    return [sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False)]


def upgrade():
    op.create_table("auth_users", sa.Column("id", sa.Integer(), primary_key=True),
                    sa.Column("bakery_id", sa.Integer(), sa.ForeignKey("bakeries.id"), nullable=False, unique=True),
                    sa.Column("email", sa.String(254), nullable=False, unique=True),
                    sa.Column("password_hash", sa.String(250), nullable=False), *timestamps())
    op.create_table("auth_sessions", sa.Column("id", sa.Integer(), primary_key=True),
                    sa.Column("user_id", sa.Integer(), sa.ForeignKey("auth_users.id"), nullable=False),
                    sa.Column("bakery_id", sa.Integer(), sa.ForeignKey("bakeries.id"), nullable=False),
                    sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
                    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False), *timestamps())
    for column in ("user_id", "bakery_id", "expires_at"):
        op.create_index(f"ix_auth_sessions_{column}", "auth_sessions", [column])
    op.create_table("subscriptions", sa.Column("id", sa.Integer(), primary_key=True),
                    sa.Column("bakery_id", sa.Integer(), sa.ForeignKey("bakeries.id"), nullable=False, unique=True),
                    sa.Column("plan", sa.String(12), nullable=False), sa.Column("status", sa.String(12), nullable=False),
                    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True), sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
                    *timestamps(), sa.CheckConstraint("plan IN ('free','starter','pro')", name="subscription_plan_valid"),
                    sa.CheckConstraint("status IN ('inactive','active','expired')", name="subscription_status_valid"))
    op.create_table("subscription_usage", sa.Column("id", sa.Integer(), primary_key=True),
                    sa.Column("bakery_id", sa.Integer(), sa.ForeignKey("bakeries.id"), nullable=False),
                    sa.Column("period", sa.String(7), nullable=False), sa.Column("forecast_runs", sa.Integer(), nullable=False), *timestamps(),
                    sa.UniqueConstraint("bakery_id", "period", name="uq_subscription_usage_month"),
                    sa.CheckConstraint("forecast_runs >= 0", name="subscription_usage_nonnegative"))
    op.create_index("ix_subscription_usage_bakery_id", "subscription_usage", ["bakery_id"])
    op.create_table("quota_events", sa.Column("id", sa.Integer(), primary_key=True),
                    sa.Column("bakery_id", sa.Integer(), sa.ForeignKey("bakeries.id"), nullable=False),
                    sa.Column("request_key", sa.String(150), nullable=False), sa.Column("period", sa.String(7), nullable=False), *timestamps(),
                    sa.UniqueConstraint("bakery_id", "request_key", name="uq_quota_event_key"))
    op.create_index("ix_quota_events_bakery_id", "quota_events", ["bakery_id"])
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("bakery_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_orders_bakery_id", "bakeries", ["bakery_id"], ["id"])
        batch.create_index("ix_orders_bakery_id", ["bakery_id"])
    # Derive only unambiguous ownership. No real records are deleted or re-labelled.
    op.execute(sa.text("""UPDATE orders SET bakery_id = (
      SELECT MIN(products.bakery_id) FROM order_items
      JOIN surplus_listings ON surplus_listings.id = order_items.listing_id
      JOIN products ON products.id = surplus_listings.product_id
      WHERE order_items.order_id = orders.id
      HAVING COUNT(DISTINCT products.bakery_id) = 1
    )"""))


def downgrade():
    with op.batch_alter_table("orders") as batch:
        batch.drop_index("ix_orders_bakery_id")
        batch.drop_constraint("fk_orders_bakery_id", type_="foreignkey")
        batch.drop_column("bakery_id")
    for table in ("quota_events", "subscription_usage", "subscriptions", "auth_sessions", "auth_users"):
        op.drop_table(table)
