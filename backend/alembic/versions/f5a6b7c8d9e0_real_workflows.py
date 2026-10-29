"""Public marketplace, account roles and a separate estimate profile. No data reset."""

from alembic import op
import sqlalchemy as sa

revision = "f5a6b7c8d9e0"
down_revision = "e4f5a6b7c8d9"
branch_labels = depends_on = None


def upgrade():
    for name in ("role", "requested_role"):
        op.add_column("auth_users", sa.Column(name, sa.String(20), nullable=False, server_default="consumer"))
    # Existing accounts were explicitly registered organization owners.
    op.execute("UPDATE auth_users SET role='business', requested_role='business'")
    with op.batch_alter_table("auth_users") as b:
        b.create_check_constraint("user_role_valid", "role IN ('consumer','business','charity')")
        b.create_check_constraint("user_request_role_valid", "requested_role IN ('consumer','business','charity')")
    op.add_column("products", sa.Column("price_known", sa.Boolean(), nullable=False, server_default=sa.true()))
    with op.batch_alter_table("surplus_listings") as b:
        b.alter_column("original_price_kzt", existing_type=sa.Integer(), nullable=True)
        b.drop_constraint("listing_discount", type_="check")
        b.create_check_constraint(
            "listing_discount",
            "discounted_price_kzt >= 0 AND (original_price_kzt IS NULL OR discounted_price_kzt <= original_price_kzt)",
        )
        b.add_column(sa.Column("terms", sa.String(20), nullable=False, server_default="discounted"))
        b.add_column(sa.Column("bulk_available", sa.Boolean(), nullable=False, server_default=sa.false()))
        b.add_column(sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
        b.add_column(sa.Column("photo", sa.LargeBinary(), nullable=True))
        b.add_column(sa.Column("photo_mime", sa.String(30), nullable=True))
    with op.batch_alter_table("orders") as b:
        b.add_column(sa.Column("buyer_id", sa.Integer(), nullable=True))
        b.create_foreign_key("fk_orders_buyer", "auth_users", ["buyer_id"], ["id"])
        b.create_index("ix_orders_buyer_id", ["buyer_id"])
        b.add_column(sa.Column("kind", sa.String(20), nullable=False, server_default="individual"))
        b.add_column(sa.Column("beneficiaries", sa.Integer(), nullable=True))
        b.add_column(sa.Column("logistics", sa.String(1000), nullable=False, server_default=""))
    for name in ("waste", "opening", "revenue"):
        op.add_column("forecast_observations", sa.Column(name, sa.Integer(), nullable=True))
    op.add_column("forecast_observations", sa.Column("context_json", sa.Text(), nullable=True))

    def timestamps():
        return [
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        ]

    op.create_table(
        "business_profiles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bakery_id", sa.Integer(), sa.ForeignKey("bakeries.id"), nullable=False, unique=True),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("answers_json", sa.Text(), nullable=False),
        *timestamps(),
    )
    op.create_table(
        "order_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bakery_id", sa.Integer(), sa.ForeignKey("bakeries.id"), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("auth_users.id"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        *timestamps(),
    )
    op.create_index("ix_order_events_bakery_id", "order_events", ["bakery_id"])
    op.create_index("ix_order_events_order_id", "order_events", ["order_id"])


def downgrade():
    connection = op.get_bind()
    if connection.scalar(
        sa.text(
            "SELECT count(*) FROM surplus_listings WHERE original_price_kzt IS NULL OR discounted_price_kzt >= original_price_kzt"
        )
    ):
        raise RuntimeError(
            "Old schema cannot represent current free/unknown-price offers. Keep this migration or restore a verified backup."
        )
    op.drop_table("order_events")
    op.drop_table("business_profiles")
    for name in ("waste", "opening", "revenue", "context_json"):
        op.drop_column("forecast_observations", name)
    with op.batch_alter_table("orders") as b:
        b.drop_index("ix_orders_buyer_id")
        b.drop_constraint("fk_orders_buyer", type_="foreignkey")
        for name in ("buyer_id", "kind", "beneficiaries", "logistics"):
            b.drop_column(name)
    with op.batch_alter_table("surplus_listings") as b:
        b.drop_constraint("listing_discount", type_="check")
        b.alter_column("original_price_kzt", existing_type=sa.Integer(), nullable=False)
        b.create_check_constraint(
            "listing_discount", "discounted_price_kzt >= 0 AND discounted_price_kzt < original_price_kzt"
        )
        for name in ("terms", "bulk_available", "expires_at", "photo", "photo_mime"):
            b.drop_column(name)
    op.drop_column("products", "price_known")
    with op.batch_alter_table("auth_users") as b:
        b.drop_constraint("user_role_valid", type_="check")
        b.drop_constraint("user_request_role_valid", type_="check")
        b.drop_column("role")
        b.drop_column("requested_role")
