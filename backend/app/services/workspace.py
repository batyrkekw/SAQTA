from sqlalchemy import select

from app.core.config import get_settings
from app.models import ApplicationSettings


def workspace_mode(db) -> str:
    """Origin is stored with the data; environment changes cannot relabel a demo."""
    stored = db.scalar(select(ApplicationSettings.workspace_mode).limit(1))
    return stored or get_settings().workspace_mode


def is_demo(db) -> bool:
    return workspace_mode(db) == "demo"
