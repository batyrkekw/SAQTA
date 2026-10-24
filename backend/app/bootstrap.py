"""Opt-in, non-destructive demo initialization after database migrations.

The container runs Alembic before this module. Automatic initialization is
disabled by default and never resets an existing workspace.
"""
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models import ApplicationSettings
from app.seed import seed_database


def initialize_demo(db: Session):
    settings = get_settings()
    if not settings.auto_seed_demo:
        return {"status": "disabled"}
    if settings.workspace_mode != "demo":
        raise ValueError("AUTO_SEED_DEMO requires WORKSPACE_MODE=demo")
    stored_mode = db.scalar(select(ApplicationSettings.workspace_mode).limit(1))
    if stored_mode == "real":
        raise ValueError("AUTO_SEED_DEMO refuses a persisted real-data workspace; use a separate demo database")
    return seed_database(db)


def main():
    with SessionLocal() as db:
        result = initialize_demo(db)
        db.commit()
    print("SAQTA startup: " + json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
