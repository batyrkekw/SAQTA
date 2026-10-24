from datetime import date, datetime, timezone
from functools import lru_cache
import json
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./saqta.db"
    workspace_mode: Literal["demo", "real"] = "demo"
    auto_seed_demo: bool = False
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    saqta_timezone: str = "Asia/Qyzylorda"
    demo_anchor_date: date | None = None
    auth_session_hours: int = 168
    auth_registration_enabled: bool = True
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value):
        if isinstance(value, str):
            return json.loads(value) if value.lstrip().startswith("[") else [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("database_url", mode="before")
    @classmethod
    def postgres_driver(cls, value):
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix):]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def today_local() -> date:
    return datetime.now(ZoneInfo(get_settings().saqta_timezone)).date()


def aware(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
