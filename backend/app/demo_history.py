"""Calendar effects for SYNTHETIC demo history: Kazakhstan public holidays and paydays.

Used only to generate illustrative sales (seed and showcase). None of this is real bakery data.
"""
from datetime import date, timedelta

# 150 days: enough for ridge regression (98+ observed days) plus validation and a 7-day holdout.
DEMO_DAYS = 150

# Kurban ait (first day) moves with the lunar calendar; announced dates for the demo years.
KURBAN_AIT = {2025: date(2025, 6, 6), 2026: date(2026, 5, 27), 2027: date(2027, 5, 16)}
# Many employers in Kazakhstan pay an advance and a salary twice a month.
PAYDAYS = (10, 25)


def kz_holidays(year: int) -> set[date]:
    """Public holidays of Kazakhstan (without weekend transfers)."""
    fixed = [(1, 1), (1, 2), (3, 8), (3, 21), (3, 22), (3, 23), (5, 1), (5, 7), (5, 9), (7, 6), (8, 30), (10, 25), (12, 16)]
    days = {date(year, month, day) for month, day in fixed}
    if year in KURBAN_AIT:
        days.add(KURBAN_AIT[year])
    return days


def demand_factor(day: date) -> float:
    """Multiplier on a normal day's demand: quieter holidays, busy holiday eves, payday peaks."""
    if day in kz_holidays(day.year):
        return 0.8
    tomorrow = day + timedelta(days=1)
    if tomorrow in kz_holidays(tomorrow.year):
        return 1.25
    if day.day in PAYDAYS or (day - timedelta(days=1)).day in PAYDAYS:
        return 1.1
    return 1.0
