from math import ceil

from app.schemas import EconomicsInput


def calculate(inputs: EconomicsInput) -> dict:
    revenue = inputs.subscription_kzt
    costs = inputs.hosting_kzt + inputs.computation_kzt + inputs.support_kzt + inputs.misc_kzt
    contribution = revenue - costs
    ltv = contribution * inputs.lifetime_months
    return {
        "revenue_kzt": revenue, "variable_costs_kzt": costs, "contribution_kzt": contribution,
        "contribution_percent": round(contribution / revenue * 100, 2) if revenue else None,
        "ltv_kzt": ltv, "ltv_cac": round(ltv / inputs.cac_kzt, 4) if inputs.cac_kzt else None,
        "cac_payback_months": round(inputs.cac_kzt / contribution, 4) if contribution > 0 else None,
        "customers_for_target": ceil(inputs.revenue_target_kzt / revenue) if revenue else None,
        "arr_kzt": revenue * inputs.locations * 12,
    }
