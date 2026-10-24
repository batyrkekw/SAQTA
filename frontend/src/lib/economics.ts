/** Hypothetical monthly per-location economics; all money is integer KZT. */
export interface EconomicsAssumptions {
  subscription: number;
  hosting: number;
  computation: number;
  support: number;
  miscellaneous: number;
  cac: number;
  lifetimeMonths: number;
  monthlyRevenueTarget: number;
  annualTargetLocations: number;
  contacted: number;
  responses: number;
  demonstrations: number;
  pilots: number;
}

export const DEFAULT_ECONOMICS: EconomicsAssumptions = {
  subscription: 30_000,
  hosting: 3_000,
  computation: 2_000,
  support: 3_000,
  miscellaneous: 1_000,
  cac: 40_000,
  lifetimeMonths: 12,
  monthlyRevenueTarget: 300_000,
  annualTargetLocations: 10,
  contacted: 200,
  responses: 60,
  demonstrations: 30,
  pilots: 15,
};

export function calculateEconomics(assumptions: EconomicsAssumptions) {
  for (const [name, value] of Object.entries(assumptions)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} must be a finite non-negative number`);
    }
  }
  const variableCosts = assumptions.hosting + assumptions.computation + assumptions.support + assumptions.miscellaneous;
  const contributionMargin = assumptions.subscription - variableCosts;
  const ltv = contributionMargin * assumptions.lifetimeMonths;
  return {
    monthlyRevenue: assumptions.subscription,
    variableCosts,
    contributionMargin,
    contributionMarginPercent: assumptions.subscription > 0 ? contributionMargin / assumptions.subscription * 100 : null,
    ltv,
    ltvCac: assumptions.cac > 0 ? ltv / assumptions.cac : null,
    paybackMonths: contributionMargin > 0 ? assumptions.cac / contributionMargin : null,
    customersForTarget: assumptions.monthlyRevenueTarget === 0 ? 0 : assumptions.subscription > 0 ? Math.ceil(assumptions.monthlyRevenueTarget / assumptions.subscription) : null,
    annualRecurringRevenue: assumptions.annualTargetLocations * assumptions.subscription * 12,
  };
}
