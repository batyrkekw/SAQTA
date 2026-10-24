import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn(() => { throw new Error("REDIRECT"); }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/forecast", redirect: redirectMock }));
import { ProductHeader } from "../src/components/product-header";
import Dashboard from "../src/app/dashboard/page";
import Inventory from "../src/app/inventory/page";
import Impact from "../src/app/impact/page";
import Settings from "../src/app/settings/page";
import Economics from "../src/app/economics/page";

beforeEach(() => vi.clearAllMocks());
describe("unified product navigation", () => {
  it("exposes only Forecast, Save and About in the main navigation and toggles mobile controls", () => {
    render(<ProductHeader/>);
    const nav = screen.getByRole("navigation", { name: "Основная навигация" });
    expect(within(nav).getAllByRole("link").map(link => link.textContent)).toEqual(["Прогнозирование", "SAQTA Save", "О проекте"]);
    expect(within(nav).queryByText(/Экономика|Инвентарь|Настройки|Impact|CAC|LTV/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Открыть меню" }));
    expect(screen.getByRole("button", { name: "Закрыть меню" })).toHaveAttribute("aria-expanded", "true");
  });
  it.each([
    [Dashboard, "/forecast?view=results"], [Inventory, "/forecast?view=data"],
    [Impact, "/forecast?view=results"], [Settings, "/forecast?view=data&settings=1"],
    [Economics, "/forecast?view=pricing"],
  ] as const)("preserves a legacy route by redirecting into Forecast", (Page, target) => {
    expect(() => Page()).toThrow("REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith(target);
  });
});
