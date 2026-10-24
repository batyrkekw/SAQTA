"""Save's settlement model: free publication, 5% only on completed discounted sales.

Amounts are integer tiyn (1 KZT = 100 tiyn), so a 1 KZT sale has an exact
5 tiyn commission without floating-point money or rounding away small sales.
This is accounting for the business model; no payment provider is connected.
"""
from app.core.config import aware

COMMISSION_RATE_BPS = 500


def split_sale(total_kzt: int) -> tuple[int, int]:
    if isinstance(total_kzt, bool) or not isinstance(total_kzt, int) or total_kzt < 0:
        raise ValueError("Сумма продажи должна быть целым неотрицательным числом тенге")
    commission_tiyn = total_kzt * 5
    return commission_tiyn, total_kzt * 100 - commission_tiyn


def settlement_json(order) -> dict:
    completed = order.status == "collected"
    estimated, _ = split_sale(order.total_kzt)
    return {
        "currency": "KZT", "minor_units_per_kzt": 100, "rate_percent": 5,
        "status": "recorded" if completed and order.commission_recorded_at else "historical_estimate" if completed else "not_due",
        "discounted_order_total_tiyn": order.total_kzt * 100,
        "completed_sale_tiyn": order.total_kzt * 100 if completed else 0,
        "commission_tiyn": order.commission_tiyn,
        "seller_proceeds_tiyn": order.seller_proceeds_tiyn,
        "estimated_commission_tiyn": estimated if order.status == "reserved" else 0,
        "publication_fee_tiyn": 0, "payments_processed": False,
        "recorded_at": aware(order.commission_recorded_at).isoformat() if order.commission_recorded_at else None,
        "methodology": "5% от подтверждённой суммы по скидочной цене. Размещение, резерв и отмена бесплатны. Расчёт по бизнес-модели: деньги не списаны и не перечислены.",
    }
