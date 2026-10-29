from datetime import date as Date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ProductCreate(Input):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(min_length=1, max_length=60)
    unit: str = Field(default="шт.", min_length=1, max_length=20)
    price_kzt: int = Field(ge=0, le=10_000_000)
    cost_kzt: int | None = Field(default=None, ge=0, le=10_000_000)
    weight_grams: int = Field(default=0, ge=0, le=100_000)
    is_active: bool = True
    is_test_data: bool = False


class ProductPatch(Input):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    category: str | None = Field(default=None, min_length=1, max_length=60)
    unit: str | None = Field(default=None, min_length=1, max_length=20)
    price_kzt: int | None = Field(default=None, ge=0, le=10_000_000)
    cost_kzt: int | None = Field(default=None, ge=0, le=10_000_000)
    weight_grams: int | None = Field(default=None, ge=0, le=100_000)
    is_active: bool | None = None


class RecordCreate(Input):
    kind: Literal["production", "sales", "waste"]
    product_id: int = Field(gt=0)
    location_id: int = Field(gt=0)
    date: Date
    quantity: int = Field(gt=0, le=1_000_000)
    reason: str = Field(default="", max_length=250)
    unit_price_kzt: int | None = Field(default=None, ge=0, le=10_000_000)

    @model_validator(mode="after")
    def waste_reason(self):
        if self.kind == "waste" and not self.reason:
            raise ValueError("Укажите причину списания")
        return self


class RecordPatch(Input):
    date: Date | None = None
    quantity: int | None = Field(default=None, gt=0, le=1_000_000)
    reason: str | None = Field(default=None, min_length=1, max_length=250)
    unit_price_kzt: int | None = Field(default=None, ge=0, le=10_000_000)


class ForecastRequest(Input):
    product_id: int = Field(gt=0)
    location_id: int = Field(gt=0)
    target_date: Date
    horizon_days: int = Field(default=1, ge=1, le=14)


class ListingCreate(Input):
    product_id: int = Field(gt=0)
    location_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=100_000)
    discounted_price_kzt: int = Field(ge=0, le=10_000_000)
    terms: Literal["discounted", "free", "negotiated"] = "discounted"
    bulk_available: bool = False
    expires_at: datetime | None = None
    pickup_start: datetime
    pickup_deadline: datetime
    description: str = Field(default="", max_length=1000)


class ListingPatch(Input):
    quantity: int | None = Field(default=None, gt=0, le=100_000)
    discounted_price_kzt: int | None = Field(default=None, ge=0, le=10_000_000)
    pickup_start: datetime | None = None
    pickup_deadline: datetime | None = None
    status: Literal["active", "inactive"] | None = None
    description: str | None = Field(default=None, max_length=1000)


class OrderLine(Input):
    listing_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=100_000)


class OrderCreate(Input):
    customer_name: str = Field(min_length=1, max_length=100)
    items: list[OrderLine] = Field(min_length=1, max_length=20)
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=100, pattern=r"^[A-Za-z0-9_.:-]+$")

    @model_validator(mode="after")
    def unique_lines(self):
        if len({line.listing_id for line in self.items}) != len(self.items):
            raise ValueError("Объедините одинаковые предложения в одну строку")
        return self


class SettingsPatch(Input):
    bakery_name: str | None = Field(default=None, min_length=1, max_length=120)
    city: str | None = Field(default=None, min_length=1, max_length=100)
    safety_buffer_percent: int | None = Field(default=None, ge=0, le=100)


class BakeryPatch(Input):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    city: str | None = Field(default=None, min_length=1, max_length=100)


class ResetRequest(Input):
    confirm: Literal["RESET SAQTA DEMO"]


class EconomicsInput(Input):
    subscription_kzt: int = Field(default=30000, ge=0, le=1_000_000_000)
    hosting_kzt: int = Field(default=3000, ge=0, le=1_000_000_000)
    computation_kzt: int = Field(default=2000, ge=0, le=1_000_000_000)
    support_kzt: int = Field(default=3000, ge=0, le=1_000_000_000)
    misc_kzt: int = Field(default=1000, ge=0, le=1_000_000_000)
    cac_kzt: int = Field(default=40000, ge=0, le=1_000_000_000)
    lifetime_months: int = Field(default=12, ge=0, le=1200)
    revenue_target_kzt: int = Field(default=300000, ge=0, le=1_000_000_000_000)
    locations: int = Field(default=10, ge=0, le=1_000_000)
