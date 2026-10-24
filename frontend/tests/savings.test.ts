import { describe, expect, it } from "vitest";
import { calculateSavings, defaultSavings } from "../src/features/forecast/savings";

describe("bakery savings scenarios", () => {
  it("starts at zero assumed improvement and never invents verified savings", () => {
    expect(defaultSavings.reductionPercent).toBe(0);
    expect(calculateSavings(defaultSavings)).toMatchObject({ writeOffLossKzt: 75000, avoidedCostKzt: 0, effectAfterSubscriptionKzt: 0, salesRevenueKzt: 1300000, soldGoodsCostKzt: 650000, salesGrossProfitKzt: 650000, remainingUnits: 100 });
  });
  it("separates lost cost, scenario saving, subscription and sales profit", () => {
    const result = calculateSavings({ produced: 1000, sold: 800, writtenOff: 100, unitCostKzt: 200, salePriceKzt: 500, subscriptionKzt: 15000, reductionPercent: 25 });
    expect(result).toEqual({ writeOffLossKzt: 20000, avoidedCostKzt: 5000, scenarioWriteOffLossKzt: 15000, effectAfterSubscriptionKzt: -10000, salesRevenueKzt: 400000, soldGoodsCostKzt: 160000, salesGrossProfitKzt: 240000, remainingUnits: 100, scenarioAvoidedUnits: 25 });
    expect(result.effectAfterSubscriptionKzt).not.toBe(result.salesGrossProfitKzt + result.avoidedCostKzt - 15000);
  });
  it("caps a 100% scenario at the full recorded unit cost rather than retail revenue", () => {
    const result = calculateSavings({ ...defaultSavings, reductionPercent: 100, subscriptionKzt: 30000 });
    expect(result.avoidedCostKzt).toBe(75000);
    expect(result.scenarioWriteOffLossKzt).toBe(0);
    expect(result.effectAfterSubscriptionKzt).toBe(45000);
  });
  it("handles zero quantities and zero unit cost without fictitious savings", () => {
    expect(calculateSavings({ produced: 0, sold: 0, writtenOff: 0, unitCostKzt: 0, salePriceKzt: 0, subscriptionKzt: 15000, reductionPercent: 50 }).effectAfterSubscriptionKzt).toBe(-15000);
    expect(calculateSavings({ ...defaultSavings, unitCostKzt: 0, reductionPercent: 100 }).avoidedCostKzt).toBe(0);
  });
  it.each([{ produced: -1 }, { writtenOff: 1000 }, { reductionPercent: 101 }, { reductionPercent: -1 }, { unitCostKzt: NaN }, { sold: 1.5 }])("rejects invalid or unreconciled inputs %o", change => {
    expect(() => calculateSavings({ ...defaultSavings, ...change })).toThrow();
  });
});
