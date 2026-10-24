"""Add import provenance and unique semantic record fingerprints.

Revision ID: c83f42d78b91
Revises: ee2260d736c6
"""
from alembic import op
import sqlalchemy as sa

revision = "c83f42d78b91"
down_revision = "ee2260d736c6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("import_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bakery_id", sa.Integer(), sa.ForeignKey("bakeries.id"), nullable=False),
        sa.Column("file_sha256", sa.String(64), nullable=False),
        sa.Column("source_origin", sa.String(10), nullable=False),
        sa.Column("source_label", sa.String(120), nullable=False),
        sa.Column("sheet_name", sa.String(120), nullable=False),
        sa.Column("mapping_json", sa.Text(), nullable=False),
        sa.Column("imported_count", sa.Integer(), nullable=False),
        sa.Column("duplicate_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("source_origin IN ('demo', 'real')", name="import_origin_valid"),
        sa.CheckConstraint("imported_count >= 0 AND duplicate_count >= 0", name="import_counts_nonnegative"))
    op.create_index("ix_import_batches_bakery_id", "import_batches", ["bakery_id"])
    op.create_index("ix_import_batches_file_sha256", "import_batches", ["file_sha256"])
    op.create_table("import_fingerprints",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bakery_id", sa.Integer(), sa.ForeignKey("bakeries.id"), nullable=False),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("import_batches.id"), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("record_kind", sa.String(20), nullable=False),
        sa.Column("record_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("bakery_id", "fingerprint", name="uq_import_bakery_fingerprint"))
    op.create_index("ix_import_fingerprints_batch_id", "import_fingerprints", ["batch_id"])
    op.create_index("ix_import_record", "import_fingerprints", ["record_kind", "record_id"])


def downgrade():
    op.drop_table("import_fingerprints")
    op.drop_table("import_batches")
