"""Record new registration consent without inventing consent for existing users."""

from alembic import op
import sqlalchemy as sa

revision = "c8d9e0f1a2b3"
down_revision = "b7c8d9e0f1a2"
branch_labels = depends_on = None


def upgrade():
    op.add_column("auth_users", sa.Column("consent_given_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("auth_users", "consent_given_at")
