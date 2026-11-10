"""Order contact and explicit consent; historical orders remain valid."""

from alembic import op
import sqlalchemy as sa

revision = "a6b7c8d9e0f1"
down_revision = "f5a6b7c8d9e0"
branch_labels = depends_on = None


def upgrade():
    op.add_column("orders", sa.Column("customer_phone", sa.String(12), nullable=True))
    op.add_column("orders", sa.Column("consent_given_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("orders", "consent_given_at")
    op.drop_column("orders", "customer_phone")
