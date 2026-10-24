"""Server-enforced manually activated Forecast plans; Save publication is free."""
from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.core.config import aware, now_utc, today_local
from app.models import BakeryLocation, Product, QuotaEvent, Subscription, SubscriptionUsage
from app.services.workspace import is_demo

PLANS = {
    "free": {"products": 3, "forecast_runs_per_month": 0, "locations": 1},
    "starter": {"products": 20, "forecast_runs_per_month": 300, "locations": 1},
    "pro": {"products": 100, "forecast_runs_per_month": 1000, "locations": 10},
}


def current_bakery_id(db):
    from app.models import ApplicationSettings
    return db.info.get("bakery_id") or db.scalar(select(ApplicationSettings.bakery_id).order_by(ApplicationSettings.id))


def subscription_json(db):
    owner = current_bakery_id(db)
    demo = is_demo(db)
    row = db.scalar(select(Subscription).where(Subscription.bakery_id == owner))
    plan = row.plan if row else "free"
    active = bool(row and row.plan != "free" and row.status == "active" and row.expires_at and aware(row.expires_at) > now_utc())
    status = "expired" if row and row.status == "active" and (not row.expires_at or aware(row.expires_at) <= now_utc()) else (row.status if row else "inactive")
    month = today_local().strftime("%Y-%m")
    used = db.scalar(select(SubscriptionUsage.forecast_runs).where(SubscriptionUsage.bakery_id == owner, SubscriptionUsage.period == month)) or 0
    limits = PLANS[plan]
    return {"plan": "demo" if demo else plan, "status": "demo" if demo else status,
            "active": False if demo else active, "access_mode": "demo" if demo else "paid" if active else "unavailable",
            "expires_at": aware(row.expires_at).isoformat() if row and row.expires_at else None,
            "limits": {"products": None, "forecast_runs_per_month": None, "locations": None} if demo else limits,
            "usage": {"period": month, "forecast_runs": 0 if demo else used, "remaining": None if demo else max(0, limits["forecast_runs_per_month"] - used)},
            "manual_activation": True, "payments_integrated": False,
            "message": "Демонстрационный доступ на синтетических данных; это не оплаченная подписка." if demo else "Подключение тарифа выполняет оператор вручную после согласования; автоматическая оплата не подключена."}


def require_forecast_access(db):
    result = subscription_json(db)
    if result["access_mode"] == "demo":
        return result
    if not result["active"]:
        raise HTTPException(402, "Для загрузки данных, анализа и прогнозирования нужен действующий тариф SAQTA Forecast. Тариф отсутствует или истёк; доступна ручная активация.")
    count = db.scalar(select(func.count()).select_from(Product).where(Product.is_active.is_(True))) or 0
    locations = db.scalar(select(func.count()).select_from(BakeryLocation)) or 0
    if count > result["limits"]["products"] or locations > result["limits"]["locations"]:
        raise HTTPException(403, "Количество активных товаров или филиалов превышает лимит тарифа. Обратитесь к оператору.")
    return result


def consume_forecast_quota(db, idempotency_key=None):
    """Atomic UPDATE counts one successful run, independent of its product count.

    Caller commits together with its forecast/run. Failed operations roll back
    usage, and a stable optional request key cannot be counted twice.
    """
    subscription = require_forecast_access(db)
    if subscription["access_mode"] == "demo":
        return False
    owner, month = current_bakery_id(db), today_local().strftime("%Y-%m")
    if idempotency_key:
        if len(idempotency_key) > 150:
            raise HTTPException(422, "Слишком длинный ключ запроса")
        try:
            with db.begin_nested():
                db.add(QuotaEvent(bakery_id=owner, request_key=idempotency_key, period=month))
                db.flush()
        except IntegrityError:
            return False
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    db.execute(insert(SubscriptionUsage).values(bakery_id=owner, period=month, forecast_runs=0, created_at=now_utc(), updated_at=now_utc()).on_conflict_do_nothing(index_elements=["bakery_id", "period"]))
    changed = db.execute(update(SubscriptionUsage).where(SubscriptionUsage.bakery_id == owner, SubscriptionUsage.period == month,
                         SubscriptionUsage.forecast_runs < subscription["limits"]["forecast_runs_per_month"]).values(forecast_runs=SubscriptionUsage.forecast_runs + 1, updated_at=now_utc()), execution_options={"synchronize_session": False}).rowcount
    if changed != 1:
        raise HTTPException(429, "Месячный лимит запусков прогноза исчерпан. Новый лимит доступен в следующем календарном месяце.")
    return True
