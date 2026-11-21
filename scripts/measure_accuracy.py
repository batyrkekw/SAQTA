"""Reproducible accuracy check of the forecast on SYNTHETIC bakery data.

Run from backend/:  .venv/bin/python ../scripts/measure_accuracy.py
6 products x 200 days (weekly pattern, slow trend, payday peaks, noise);
8 cutoffs per product; each prediction covers the next 7 days, unseen.
Compares the AI choice with "same as yesterday" and the 7-day mean.
This is synthetic data: it shows the method works, not real-bakery accuracy.
"""
import random
import sys
from datetime import date, timedelta
sys.path.insert(0, ".")
from app.forecasting.selection import select_forecast, estimate
random.seed(2026)
products = {"Батон": 120, "Багет": 60, "Круассан": 45, "Бородинский": 35, "Самса": 80, "Баурсак": 50}
week = [0.9, 0.85, 0.9, 1.0, 1.15, 1.35, 1.2]
start = date(2026, 3, 1)
res = []
for name, base in products.items():
    hist = []
    for i in range(200):
        d = start + timedelta(days=i)
        trend = 1 + 0.0008 * i
        lam = base * week[d.weekday()] * trend * (1.25 if d.day in (1, 2) else 1)
        sales = max(0, round(random.gauss(lam, lam ** 0.5 * 1.3)))
        hist.append({"date": d, "sales": sales})
    for cut in range(120, 200, 10):  # 8 cutoffs
        h = hist[:cut]
        target = hist[cut]["date"]
        r = select_forecast(h, target, 7, None)
        actual = hist[cut:cut + 7]
        def err(method):
            return sum(abs(estimate(method, h, a["date"]) - a["sales"]) for a in actual)
        tot = sum(a["sales"] for a in actual)
        ai = sum(abs(d["demand"] - a["sales"]) for d, a in zip(r["daily"], actual))
        res.append((name, r["model"], ai / tot, err("last") / tot, err("mean7") / tot, tot))
import collections
w = lambda i: sum(x[i] * x[5] for x in res) / sum(x[5] for x in res) * 100
print("cases", len(res), "models", collections.Counter(x[1] for x in res))
print(f"WAPE 7-day: AI {w(2):.1f}%  last {w(3):.1f}%  mean7 {w(4):.1f}%")
print(f"improvement vs last {100*(1-w(2)/w(3)):.0f}%, vs mean7 {100*(1-w(2)/w(4)):.0f}%")
