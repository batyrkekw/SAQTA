import { describe, expect, it } from "vitest";
import { calculateEconomics, DEFAULT_ECONOMICS } from "../src/lib/economics";

describe("hypothetical unit economics", () => {
  it("calculates the documented default assumptions", () => {
    const result = calculateEconomics(DEFAULT_ECONOMICS);
    expect(result.monthlyRevenue).toBe(30_000);
    expect(result.variableCosts).toBe(9_000);
    expect(result.contributionMargin).toBe(21_000);
    expect(result.contributionMarginPercent).toBe(70);
    expect(result.ltv).toBe(252_000);
    expect(result.ltvCac).toBe(6.3);
    expect(result.paybackMonths).toBeCloseTo(1.90476, 4);
    expect(result.customersForTarget).toBe(10);
    expect(result.annualRecurringRevenue).toBe(3_600_000);
  });

  it("recalculates expenses and rounds target locations upward", () => {
    const result = calculateEconomics({ ...DEFAULT_ECONOMICS, hosting: 4_000, support: 5_000, monthlyRevenueTarget: 300_001 });
    expect(result.variableCosts).toBe(12_000);
    expect(result.contributionMargin).toBe(18_000);
    expect(result.customersForTarget).toBe(11);
  });

  it("does not claim CAC payback for a non-positive contribution margin", () => {
    const result = calculateEconomics({ ...DEFAULT_ECONOMICS, subscription: 8_000 });
    expect(result.contributionMargin).toBe(-1_000);
    expect(result.ltv).toBe(-12_000);
    expect(result.paybackMonths).toBeNull();
  });

  it("handles zero denominators without infinite results", () => {
    const result = calculateEconomics({ ...DEFAULT_ECONOMICS, subscription: 0, cac: 0 });
    expect(result.contributionMarginPercent).toBeNull();
    expect(result.ltvCac).toBeNull();
    expect(result.customersForTarget).toBeNull();
    expect(result.paybackMonths).toBeNull();
    expect(calculateEconomics({ ...DEFAULT_ECONOMICS, monthlyRevenueTarget: 0 }).customersForTarget).toBe(0);
    expect(calculateEconomics({ ...DEFAULT_ECONOMICS, cac: 0 }).paybackMonths).toBe(0);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid assumption %s", (value) => {
    expect(() => calculateEconomics({ ...DEFAULT_ECONOMICS, cac: value })).toThrow(RangeError);
  });
});
