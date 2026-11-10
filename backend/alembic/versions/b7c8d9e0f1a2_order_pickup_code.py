"""Secure pickup codes, unique among a business's active orders."""

import secrets

from alembic import op
import sqlalchemy as sa

revision = "b7c8d9e0f1a2"
down_revision = "a6b7c8d9e0f1"
branch_labels = depends_on = None


def upgrade():
    op.add_column("orders", sa.Column("pickup_code", sa.String(6), nullable=True))
    orders = sa.table("orders", sa.column("id", sa.Integer()), sa.column("bakery_id", sa.Integer()),
                      sa.column("status", sa.String()), sa.column("pickup_code", sa.String()))
    connection = op.get_bind()
    active = connection.execute(sa.select(orders.c.id, orders.c.bakery_id).where(orders.c.status.in_(["reserved", "pending"]))).all()
    used_by_owner: dict[int | None, set[str]] = {}
    for order_id, owner in active:
        used = used_by_owner.setdefault(owner, set())
        if len(used) >= 1_000_000:
            raise RuntimeError("No free pickup codes for this business")
        while (code := f"{secrets.randbelow(1_000_000):06d}") in used:
            pass
        used.add(code)
        connection.execute(orders.update().where(orders.c.id == order_id).values(pickup_code=code))
    predicate = sa.text("status IN ('reserved','pending') AND pickup_code IS NOT NULL")
    op.create_index("uq_order_active_pickup_code", "orders", ["bakery_id", "pickup_code"], unique=True,
                    sqlite_where=predicate, postgresql_where=predicate)


def downgrade():
    op.drop_index("uq_order_active_pickup_code", table_name="orders")
    op.drop_column("orders", "pickup_code")
