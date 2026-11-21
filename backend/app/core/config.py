from datetime import date, datetime, timezone
from functools import lru_cache
import json
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./saqta.db"
    workspace_mode: Literal["demo", "real"] = "real"
    auto_seed_demo: bool = False
    forecast_requires_subscription: bool = True
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = "Qwen/Qwen3-0.6B"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    saqta_timezone: str = "Asia/Qyzylorda"
    demo_anchor_date: date | None = None
    auth_session_hours: int = 168
    auth_registration_enabled: bool = True
    admin_token: str = Field(default="", repr=False)
    rate_limit_enabled: bool = True
    rate_limit_max_keys: int = Field(default=10_000, ge=1, le=1_000_000)
    rate_limit_pickup_max_attempts: int = Field(default=5, ge=1, le=100)
    rate_limit_pickup_window_seconds: int = Field(default=300, ge=1, le=86_400)
    login_max_attempts: int = Field(default=10, ge=1, le=10_000)
    login_window_seconds: int = Field(default=300, ge=1, le=86_400)
    register_max_attempts: int = Field(default=5, ge=1, le=10_000)
    register_window_seconds: int = Field(default=3600, ge=1, le=86_400)
    # Public site address used in emails (password reset, invoice links).
    public_url: str = "http://localhost:3000"
    # Billing. Paid Forecast plans; new business accounts start with a free trial.
    trial_days: int = Field(default=14, ge=0, le=90)
    tiptop_public_id: str = ""
    tiptop_api_secret: str = Field(default="", repr=False)
    tiptop_api_url: str = "https://api.tiptoppay.kz"
    billing_test_mode: bool = True
    # Local demo only: pay through a built-in test page. Refused while TipTop keys are configured.
    billing_simulator: bool = False
    invoice_due_days: int = Field(default=5, ge=1, le=60)
    seller_name: str = ""
    seller_bin: str = ""
    seller_address: str = ""
    seller_iban: str = ""
    seller_bank: str = ""
    seller_bik: str = ""
    seller_kbe: str = "19"
    seller_email: str = ""
    seller_phone: str = ""
    seller_vat_payer: bool = False
    # Email. Without SMTP_HOST messages are written to the server log instead of being sent.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = Field(default="", repr=False)
    smtp_starttls: bool = True
    mail_from: str = "SaqtaFood <no-reply@saqta.kz>"
    password_reset_minutes: int = Field(default=60, ge=5, le=1440)
    forgot_max_attempts: int = Field(default=5, ge=1, le=1000)
    forgot_window_seconds: int = Field(default=3600, ge=1, le=86_400)
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
