"""Demo history must be long enough for ridge regression and carry a weekly rhythm,
paydays and Kazakhstan public holidays. Everything here is synthetic."""
from datetime import date, timedelta
from statistics import mean

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base
from app.demo_history import DEMO_DAYS, demand_factor, kz_holidays
from app.forecasting.selection import select_forecast
from app.models import Product, SalesRecord
from app.seed import seed_database
from app.showcase import history_csv


def test_kz_holidays_include_fixed_and_movable_days():
    days = kz_holidays(2026)
    for expected in [date(2026, 1, 1), date(2026, 3, 8), date(2026, 3, 22), date(2026, 5, 1), date(2026, 5, 7),
                     date(2026, 5, 9), date(2026, 7, 6), date(2026, 8, 30), date(2026, 10, 25), date(2026, 12, 16),
                     date(2026, 5, 27)]:
        assert expected in days
    assert date(2026, 4, 14) not in days


def test_demand_factor_has_holiday_eve_and_payday_peaks():
    ordinary = demand_factor(date(2026, 4, 14))
    assert demand_factor(date(2026, 12, 15)) > ordinary  # day before Independence Day
    assert demand_factor(date(2026, 12, 16)) < ordinary  # the holiday itself
    assert demand_factor(date(2026, 4, 10)) > ordinary  # payday (10th)


def test_seed_history_is_long_enough_for_ridge():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with sessionmaker(engine)() as db:
        assert seed_database(db)["days"] == DEMO_DAYS
        product = db.scalar(select(Product).where(Product.name == "Круассан классический"))
        days = db.scalar(select(func.count(func.distinct(SalesRecord.date))).where(SalesRecord.product_id == product.id))
        assert DEMO_DAYS >= 150 and days >= DEMO_DAYS
        rows = db.execute(select(SalesRecord.date, func.sum(SalesRecord.quantity)).where(
            SalesRecord.product_id == product.id, SalesRecord.location_id == 1).group_by(SalesRecord.date).order_by(SalesRecord.date)).all()
    history = [{"date": d, "sales": int(q)} for d, q in rows]
    saturdays = mean(r["sales"] for r in history if r["date"].weekday() == 5)
    mondays = mean(r["sales"] for r in history if r["date"].weekday() == 0)
    assert saturdays > mondays
    result = select_forecast(history, history[-1]["date"] + timedelta(days=1), 7, None)
    assert "ridge" in [item["model"] for item in result["comparison"]]


def test_showcase_history_is_long_enough_for_ridge():
    lines = history_csv().decode().splitlines()[1:]
    dates = {line.split(",")[0] for line in lines}
    assert len(dates) >= DEMO_DAYS
