"""Import provenance and content identities; uploaded files are never stored."""
from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models import TimestampMixin


class ImportBatch(TimestampMixin, Base):
    __tablename__ = "import_batches"
    id: Mapped[int] = mapped_column(primary_key=True)
    bakery_id: Mapped[int] = mapped_column(ForeignKey("bakeries.id"), index=True)
    file_sha256: Mapped[str] = mapped_column(String(64), index=True)
    source_origin: Mapped[str] = mapped_column(String(10))
    source_label: Mapped[str] = mapped_column(String(120), default="")
    sheet_name: Mapped[str] = mapped_column(String(120))
    mapping_json: Mapped[str] = mapped_column(Text)
    imported_count: Mapped[int] = mapped_column(Integer)
    duplicate_count: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (CheckConstraint("source_origin IN ('demo', 'real')", name="import_origin_valid"),
                      CheckConstraint("imported_count >= 0 AND duplicate_count >= 0", name="import_counts_nonnegative"))


class ImportFingerprint(TimestampMixin, Base):
    __tablename__ = "import_fingerprints"
    id: Mapped[int] = mapped_column(primary_key=True)
    bakery_id: Mapped[int] = mapped_column(ForeignKey("bakeries.id"))
    batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"), index=True)
    fingerprint: Mapped[str] = mapped_column(String(64))
    record_kind: Mapped[str] = mapped_column(String(20))
    record_id: Mapped[int] = mapped_column(Integer)
    __table_args__ = (UniqueConstraint("bakery_id", "fingerprint", name="uq_import_bakery_fingerprint"),
                      Index("ix_import_record", "record_kind", "record_id"))
