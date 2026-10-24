import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { ForecastExplanation } from "../src/features/forecast/explanation-panel";
import SavingsCalculator from "../src/features/forecast/savings-calculator";
import type { DetailedForecast } from "../src/features/forecast/types";

it("renders source observations, comparison and the exact backend production formula", async () => {
  const report: DetailedForecast = {
    id: 1, product_id: 1, product_name: "Круассан", location_id: 1, target_date: "2026-10-25", horizon_days: 1, predicted_demand: 50, recommended_production: 47, existing_inventory: 8, expected_surplus: 5, stockout_risk: "снижен буфером, но не исключён", method: "recent_weekday_baseline_v1", explanation: "Рекомендуем 47 шт.: спрос 50, с буфером 55, остаток 8.", generated_at: "2026-10-24T08:00:00Z", mae: null, evaluation_points: 0, history: [], daily: [{ date: "2026-10-25", predicted_demand: 50, recommended_production: 47 }], demo_data: true,
    explanation_components: { history_days: 15, safety_buffer_percent: 10, existing_inventory: 8, days: [{ date: "2026-10-25", recent_sales: [{ date: "2026-10-24", sales: 40 }], recent_mean: 40, same_weekday_sales: [{ date: "2026-10-18", sales: 65 }], same_weekday_mean: 65, recent_weight: 0.6, same_weekday_weight: 0.4, weekday_difference: 25, weighted_demand: 50, predicted_demand: 50, available_inventory: 8, buffered_demand: 55, recommended_production: 47, demand_formula: "0.6 × 40 + 0.4 × 65 = 50", production_formula: "max(0, ceil(50 × 1.10) − 8) = 47 шт." }], limitations: ["Остаток требует проверки свежести."] },
  };
  render(<ForecastExplanation forecast={report} />);
  expect(screen.getByText(report.explanation)).toBeInTheDocument();
  expect(screen.getByText("0.6 × 40 + 0.4 × 65 = 50")).toBeInTheDocument();
  expect(screen.getByText("max(0, ceil(50 × 1.10) − 8) = 47 шт.")).toBeInTheDocument();
  expect(screen.getByText(/выше недавнего среднего на 25 шт./)).toBeInTheDocument();
  expect(screen.getByText("Недостаточно данных для оценки точности")).toBeInTheDocument();
  expect(screen.getByText("Остаток требует проверки свежести.")).toBeInTheDocument();
});

it("recalculates the savings scenario interactively and stops calculations for inconsistent inventory", async () => {
  const user = userEvent.setup();
  render(<SavingsCalculator />);
  const reduction = screen.getByLabelText(/Сценарий сокращения списаний/);
  await user.clear(reduction);
  await user.type(reduction, "50");
  expect(screen.getAllByText(/37\s500\s₸/).length).toBeGreaterThan(0);
  const production = screen.getByLabelText("Произведено, ед.");
  await user.clear(production);
  await user.type(production, "100");
  expect(screen.getByRole("alert")).toHaveTextContent("Продажи и списания не могут превышать производство");
  expect(screen.queryByText("Эффект после стоимости подписки")).not.toBeInTheDocument();
});
