import { z } from "zod";

export const savingsSchema = z.object({
  produced: z.number().int().nonnegative("Не меньше нуля").max(10_000_000),
  sold: z.number().int().nonnegative("Не меньше нуля").max(10_000_000),
  writtenOff: z.number().int().nonnegative("Не меньше нуля").max(10_000_000),
  unitCostKzt: z.number().int().nonnegative("Не меньше нуля").max(10_000_000),
  salePriceKzt: z.number().int().nonnegative("Не меньше нуля").max(10_000_000),
  subscriptionKzt: z.number().int().nonnegative("Не меньше нуля").max(10_000_000),
  reductionPercent: z.number().min(0, "От 0 до 100%").max(100, "От 0 до 100%"),
}).refine(value => value.sold + value.writtenOff <= value.produced, { path: ["writtenOff"], message: "Продажи и списания не могут превышать производство. Для модели используйте одну партию без начального запаса." });

export type SavingsInput = z.infer<typeof savingsSchema>;
export const defaultSavings: SavingsInput = { produced: 3000, sold: 2600, writtenOff: 300, unitCostKzt: 250, salePriceKzt: 500, subscriptionKzt: 0, reductionPercent: 0 };
export function calculateSavings(input: SavingsInput) {
  const value = savingsSchema.parse(input);
  const writeOffLossKzt = value.writtenOff * value.unitCostKzt;
  const avoidedCostKzt = Math.round(writeOffLossKzt * value.reductionPercent / 100);
  const salesRevenueKzt = value.sold * value.salePriceKzt;
  const soldGoodsCostKzt = value.sold * value.unitCostKzt;
  return {
    writeOffLossKzt,
    avoidedCostKzt,
    scenarioWriteOffLossKzt: writeOffLossKzt - avoidedCostKzt,
    effectAfterSubscriptionKzt: avoidedCostKzt - value.subscriptionKzt,
    salesRevenueKzt,
    soldGoodsCostKzt,
    salesGrossProfitKzt: salesRevenueKzt - soldGoodsCostKzt,
    remainingUnits: value.produced - value.sold - value.writtenOff,
    scenarioAvoidedUnits: value.writtenOff * value.reductionPercent / 100,
  };
}
