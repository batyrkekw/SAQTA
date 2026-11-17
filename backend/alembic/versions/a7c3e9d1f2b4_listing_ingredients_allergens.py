"""Seller-declared ingredients and allergens on SAVE offers. Additive; existing offers stay undeclared."""

from alembic import op
import sqlalchemy as sa

revision = "a7c3e9d1f2b4"
down_revision = "f5a6b7c8d9e0"
branch_labels = depends_on = None


def upgrade():
    with op.batch_alter_table("surplus_listings") as b:
        b.add_column(sa.Column("ingredients", sa.String(500), nullable=False, server_default=""))
        b.add_column(sa.Column("allergens", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("surplus_listings") as b:
        b.drop_column("allergens")
        b.drop_column("ingredients")
