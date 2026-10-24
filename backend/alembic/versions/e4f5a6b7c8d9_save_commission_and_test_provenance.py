"""Record completed-sale commission and isolate verified historical demo test rows.

Revision ID: e4f5a6b7c8d9
Revises: d1e2f3a4b5c6
"""
from alembic import op
import sqlalchemy as sa

revision = "e4f5a6b7c8d9"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("products", "surplus_listings", "orders"):
        op.add_column(table, sa.Column("is_test_data", sa.Boolean(), nullable=False, server_default=sa.false()))
    for column in (
        sa.Column("commission_rate_bps", sa.Integer(), nullable=False, server_default="500"),
        sa.Column("commission_tiyn", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("seller_proceeds_tiyn", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("commission_recorded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("idempotency_key", sa.String(100), nullable=True),
        sa.Column("request_hash", sa.String(64), nullable=True),
    ):
        op.add_column("orders", column)
    # Old completed orders get an explicitly historical model estimate, NOT an
    # invented charge event: commission_recorded_at deliberately stays NULL.
    op.execute(sa.text("UPDATE orders SET commission_tiyn = CAST(total_kzt AS BIGINT) * 5, seller_proceeds_tiyn = CAST(total_kzt AS BIGINT) * 95 WHERE status = 'collected'"))
    with op.batch_alter_table("orders") as batch:
        batch.alter_column("total_kzt", existing_type=sa.Integer(), type_=sa.BigInteger(), existing_nullable=False)
        batch.create_check_constraint("order_commission_nonnegative", "commission_rate_bps = 500 AND commission_tiyn >= 0 AND seller_proceeds_tiyn >= 0")
        batch.create_check_constraint("order_settlement_balanced", "(status = 'collected' AND commission_tiyn = total_kzt * 5 AND seller_proceeds_tiyn = total_kzt * 95) OR (status != 'collected' AND commission_tiyn = 0 AND seller_proceeds_tiyn = 0)")
        batch.create_unique_constraint("uq_order_bakery_idempotency", ["bakery_id", "idempotency_key"])
    _mark_verified_demo_artifacts()


def _mark_verified_demo_artifacts():
    """Narrow provenance match for the 24 Oct release-verification artifacts.

    Never delete rows, match an arbitrary 'QA' name, or touch real workspaces.
    New verification uses explicit is_test_data instead of name heuristics.
    """
    connection = op.get_bind()
    products = sa.table("products", sa.column("id"), sa.column("bakery_id"), sa.column("name"), sa.column("category"), sa.column("is_active"), sa.column("is_test_data"))
    settings = sa.table("application_settings", sa.column("bakery_id"), sa.column("workspace_mode"))
    demo_owners = sa.select(settings.c.bakery_id).where(settings.c.workspace_mode == "demo")
    connection.execute(products.update().where(
        products.c.bakery_id.in_(demo_owners), products.c.is_active == sa.false(),
        products.c.category.in_(["QA synthetic verification", "QA SYNTHETIC"]),
        sa.or_(products.c.name.like("QA SYNTHETIC 20261024T%"), products.c.name.like("QA PRODUCT UPDATE 20261024T%")),
    ).values(is_test_data=True))
    listings = sa.table("surplus_listings", sa.column("id"), sa.column("product_id"), sa.column("description"), sa.column("is_test_data"))
    demo_products = sa.select(products.c.id).where(products.c.bakery_id.in_(demo_owners))
    marked_products = sa.select(products.c.id).where(products.c.is_test_data == sa.true())
    known_manual_text = "Круассан классический · SAQTA Save\n2 шт. · 375 ₸ вместо 750 ₸ за шт.\nСинтетическая проверка редактирования. Самовывоз в указанное окно.\nОформите демо-заказ."
    connection.execute(listings.update().where(listings.c.product_id.in_(demo_products), sa.or_(
        listings.c.product_id.in_(marked_products),
        listings.c.description.like("QA CONCURRENCY SYNTHETIC 20261024T%"),
        listings.c.description == "QA UI · Синтетическое предложение для проверки публичного демо. Не реальная продукция.",
        listings.c.description == known_manual_text,
    )).values(is_test_data=True))
    items = sa.table("order_items", sa.column("order_id"), sa.column("listing_id"))
    orders = sa.table("orders", sa.column("id"), sa.column("bakery_id"), sa.column("is_test_data"))
    marked_listings = sa.select(listings.c.id).where(listings.c.is_test_data == sa.true())
    connection.execute(orders.update().where(orders.c.bakery_id.in_(demo_owners), orders.c.id.in_(
        sa.select(items.c.order_id).where(items.c.listing_id.in_(marked_listings)))).values(is_test_data=True))


def downgrade():
    with op.batch_alter_table("orders") as batch:
        batch.drop_constraint("uq_order_bakery_idempotency", type_="unique")
        batch.drop_constraint("order_settlement_balanced", type_="check")
        batch.drop_constraint("order_commission_nonnegative", type_="check")
        # Keep widened order totals to avoid integer overflow on downgrade.
        for name in ("request_hash", "idempotency_key", "commission_recorded_at", "seller_proceeds_tiyn", "commission_tiyn", "commission_rate_bps"):
            batch.drop_column(name)
    for table in ("orders", "surplus_listings", "products"):
        op.drop_column(table, "is_test_data")
