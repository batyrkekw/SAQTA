import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import PricingPanel from "../src/features/forecast/pricing-panel";
import { PRICING, PRICING_CONNECTION_COPY } from "../src/features/forecast/pricing.config";

describe("Forecast pricing keeps proposed plans separate from real subscriptions", () => {
  it("uses the single proposed price configuration and keeps Save free", () => {
    expect(PRICING.plans.map(plan => [plan.name, plan.monthlyKzt, plan.productLimit, plan.forecastLimit, plan.locationLimit])).toEqual([["Free", 0, 3, 0, 1], ["Starter", 15000, 20, 300, 1], ["Pro", 30000, 100, 1000, 10]]);
    expect(PRICING.saveFeeKzt).toBe(0);
    expect(PRICING.saveCommissionPercent).toBe(0);
    expect(PRICING.saveSalesCommissionPercent).toBe(5);
    expect(PRICING.quotasEnforced).toBe(true);
    expect(PRICING.paymentsConnected).toBe(false);
    render(<PricingPanel />);
    expect(screen.getByRole("link", { name: /Открыть рабочее пространство/ })).toHaveAttribute("href", "/forecast?view=forecast");
    expect(screen.getByText(/сервер проверяет организацию/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Открыть SAQTA Save/ })).toHaveAttribute("href", "/save");
  });
  it.each(["Starter", "Pro"])("choosing %s only opens the exact preparation notice", async plan => {
    const user = userEvent.setup();
    render(<PricingPanel />);
    await user.click(screen.getByRole("button", { name: new RegExp(`Выбрать ${plan}`) }));
    const dialog = screen.getByRole("dialog", { name: "Подключение тарифов" });
    expect(within(dialog).getByText(PRICING_CONNECTION_COPY)).toBeInTheDocument();
    expect(within(dialog).queryByRole("form")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Понятно" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
