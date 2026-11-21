"""Billing invoices, subscription renewal fields, password reset tokens.

Existing business organizations without an active paid plan receive a 14-day Starter trial,
so enabling paid Forecast does not cut off current users without notice.
"""
from datetime import datetime, timedelta, timezone

from alembic import op
import sqlalchemy as sa

revision = "b9c0d1e2f3a4"
down_revision = "a7c3e9d1f2b4"
branch_labels = depends_on = None


def upgrade():
    op.create_table(
        "billing_invoices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bakery_id", sa.Integer(), sa.ForeignKey("bakeries.id"), nullable=False, index=True),
        sa.Column("number", sa.String(30), nullable=False, unique=True),
        sa.Column("plan", sa.String(12), nullable=False),
        sa.Column("months", sa.Integer(), nullable=False),
        sa.Column("amount_kzt", sa.Integer(), nullable=False),
        sa.Column("method", sa.String(10), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("auto_renew", sa.Boolean(), nullable=False),
        sa.Column("payer_name", sa.String(160), nullable=False),
        sa.Column("payer_bin", sa.String(12), nullable=False),
        sa.Column("payer_email", sa.String(254), nullable=False),
        sa.Column("provider_tx_id", sa.String(64), nullable=True, unique=True),
        sa.Column("payment_reference", sa.String(120), nullable=False),
        sa.Column("failure_reason", sa.String(200), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("plan IN ('starter','pro')", name="invoice_plan_valid"),
        sa.CheckConstraint("months IN (1,3,12)", name="invoice_months_valid"),
        sa.CheckConstraint("method IN ('card','transfer')", name="invoice_method_valid"),
        sa.CheckConstraint("status IN ('pending','paid','cancelled','failed')", name="invoice_status_valid"),
        sa.CheckConstraint("amount_kzt > 0", name="invoice_amount_positive"),
    )
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("auth_users.id"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    with op.batch_alter_table("subscriptions") as b:
        b.add_column(sa.Column("is_trial", sa.Boolean(), nullable=False, server_default=sa.false()))
        b.add_column(sa.Column("auto_renew", sa.Boolean(), nullable=False, server_default=sa.false()))
        b.add_column(sa.Column("provider_subscription_id", sa.String(64), nullable=True))
        b.add_column(sa.Column("reminded_at", sa.DateTime(timezone=True), nullable=True))
        b.create_unique_constraint("uq_subscriptions_provider_subscription_id", ["provider_subscription_id"])

    now = datetime.now(timezone.utc)
    subs = sa.table("subscriptions", sa.column("bakery_id", sa.Integer), sa.column("plan", sa.String),
                    sa.column("status", sa.String), sa.column("expires_at", sa.DateTime(timezone=True)),
                    sa.column("activated_at", sa.DateTime(timezone=True)), sa.column("is_trial", sa.Boolean))
    users = sa.table("auth_users", sa.column("bakery_id", sa.Integer), sa.column("role", sa.String),
                     sa.column("requested_role", sa.String))
    business = sa.select(users.c.bakery_id).where(sa.or_(users.c.role == "business", users.c.requested_role == "business"))
    not_paid = sa.or_(subs.c.status != "active", subs.c.expires_at.is_(None), subs.c.expires_at <= now)
    op.execute(subs.update().where(subs.c.bakery_id.in_(business), not_paid).values(
        plan="starter", status="active", is_trial=True, activated_at=now, expires_at=now + timedelta(days=14)))


def downgrade():
    with op.batch_alter_table("subscriptions") as b:
        b.drop_constraint("uq_subscriptions_provider_subscription_id", type_="unique")
        b.drop_column("reminded_at")
        b.drop_column("provider_subscription_id")
        b.drop_column("auto_renew")
        b.drop_column("is_trial")
    op.drop_table("password_reset_tokens")
    op.drop_table("billing_invoices")
