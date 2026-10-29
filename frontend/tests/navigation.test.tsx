import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { redirectMock, pathnameStore } = vi.hoisted(() => ({ redirectMock: vi.fn(() => { throw new Error("REDIRECT"); }), pathnameStore: { value: "/forecast" } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathnameStore.value, redirect: redirectMock }));
import { ProductHeader } from "../src/components/product-header";
import Dashboard from "../src/app/dashboard/page";
import Inventory from "../src/app/inventory/page";
import Impact from "../src/app/impact/page";
import Settings from "../src/app/settings/page";
import Economics from "../src/app/economics/page";
import { WorkspaceLayout } from "../src/components/workspace-layout";
import { AppShell } from "../src/components/app-shell";

beforeEach(() => vi.clearAllMocks());
describe("unified product navigation", () => {
  it("preserves the same navigation on Forecast and Save without nesting shells", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ bakery_name: "Демо", city: "Астана", demo_data: true }))));
    pathnameStore.value = "/forecast";
    const { rerender } = render(<WorkspaceLayout><AppShell><p>Forecast content</p></AppShell></WorkspaceLayout>);
    const nav = screen.getByRole("navigation", { name: "Основная навигация" });
    nav.addEventListener("click", event => event.preventDefault());
    expect(within(nav).getByRole("link", { name: "SAQTA FORECAST" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Открыть меню" }));
    expect(screen.getByRole("button", { name: "Закрыть меню" })).toHaveAttribute("aria-expanded", "true");
    for (const [path, text] of [["/save", "SAQTA SAVE"], ["/forecast", "SAQTA FORECAST"]]) {
      pathnameStore.value = path;
      rerender(<WorkspaceLayout><AppShell><p>{text} content</p></AppShell></WorkspaceLayout>);
      expect(screen.getByRole("navigation", { name: "Основная навигация" })).toBe(nav);
      expect(screen.getAllByRole("navigation", { name: "Основная навигация" })).toHaveLength(1);
      expect(within(nav).getByRole("link", { name: text })).toHaveAttribute("aria-current", "page");
      fireEvent.click(within(nav).getByRole("link", { name: text }));
      expect(screen.getByRole("button", { name: "Открыть меню" })).toHaveAttribute("aria-expanded", "false");
    }
    pathnameStore.value = "/forecast"; vi.unstubAllGlobals();
  });
  it("exposes only Forecast and Save in the main navigation and toggles mobile controls", () => {
    render(<ProductHeader/>);
    const nav = screen.getByRole("navigation", { name: "Основная навигация" });
    expect(within(nav).getAllByRole("link").map(link => link.textContent)).toEqual(["SAQTA SAVE", "SAQTA FORECAST"]);
    expect(within(nav).queryByText(/Экономика|Инвентарь|Настройки|Impact|CAC|LTV/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Открыть меню" }));
    expect(screen.getByRole("button", { name: "Закрыть меню" })).toHaveAttribute("aria-expanded", "true");
  });
  it.each([
    [Dashboard, "/forecast?view=results"], [Inventory, "/forecast?view=data"],
    [Impact, "/forecast?view=results"], [Settings, "/forecast?view=data&settings=1"],
    [Economics, "/forecast"],
  ] as const)("preserves a legacy route by redirecting into Forecast", (Page, target) => {
    expect(() => Page()).toThrow("REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith(target);
  });
});
