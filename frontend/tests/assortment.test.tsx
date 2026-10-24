import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForecastAccessProvider } from "../src/features/forecast/access-panel";
import AssortmentPanel, { AssortmentResults } from "../src/features/forecast/assortment-panel";
import type { AssortmentItem, AssortmentRun } from "../src/features/forecast/assortment-types";
vi.mock("../src/features/data/import-workflow", () => ({ ImportWorkflow: ({ onImported }: { onImported: () => void }) => <button onClick={onImported}>CONFIRM_SYNTHETIC_IMPORT</button> }));

afterEach(() => { vi.unstubAllGlobals(); window.sessionStorage.clear(); });
const item: AssortmentItem = { product_id: 1, product_name: "Круассан", unit: "шт.", location_id: 7, location_name: "Своя точка", status: "ok", predicted_demand: 12, recommended_production: 10, available_inventory: 4, buffered_demand: 14, expected_surplus: 2, potential_writeoff_cost_kzt: 200, risks: ["shortage"], priority: "high", history_days: 21, history_period: { start_date: "2026-10-01", end_date: "2026-10-21" }, data_source: "imported", warnings: ["Будущая точность не гарантирована"], explanation_components: null, daily: [], mae: null, evaluation_points: 0 };
const run: AssortmentRun = { run_id: "run-1", generated_at: "2026-10-24T12:00:00Z", demo_data: true, scope: { bakery_id: 1, location_id: null }, summary: { product_count: 2, location_count: 1, eligible_count: 1, insufficient_count: 1, unknown_inventory_count: 1, predicted_demand: 12, recommended_production: null }, items: [item, { ...item, product_id: 2, product_name: "Хлеб", status: "insufficient_history", predicted_demand: null, available_inventory: null, recommended_production: null, expected_surplus: null, risks: ["insufficient_history", "missing_inventory"], history_days: 2 }] };
function mockApi({ demo = true, active = false, failRun = false }: { demo?: boolean; active?: boolean; failRun?: boolean } = {}) {
  const writes: { path: string; payload: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    if (path === "/api/health") return new Response(JSON.stringify({ status: "ok", workspace_mode: demo ? "demo" : "real", demo_data: demo }));
    if (path === "/api/subscription") return new Response(JSON.stringify({ plan: demo ? "demo" : "starter", status: demo ? "demo" : active ? "active" : "expired", active, access_mode: demo ? "demo" : active ? "paid" : "unavailable", expires_at: null, limits: { products: 20, forecast_runs_per_month: 300, locations: 1 }, usage: { period: "2026-10", forecast_runs: 2, remaining: 298 }, manual_activation: true }));
    if (path === "/api/settings") return new Response(JSON.stringify({ workspace_mode: demo ? "demo" : "real", demo_data: demo }));
    if (path === "/api/products") return new Response(JSON.stringify([{ id: 1, name: "Круассан" }, { id: 2, name: "Хлеб" }]));
    if (path === "/api/locations") return new Response(JSON.stringify([{ id: 7, name: "Своя точка", bakery_id: 1, address: "Адрес организации", city: "Астана" }]));
    if (path === "/api/forecast-runs") { writes.push({ path, payload: JSON.parse(String(init?.body)) }); return new Response(JSON.stringify(failRun ? { detail: "Месячный лимит исчерпан" } : run), { status: failRun ? 429 : 201 }); }
    throw new Error(`Unexpected endpoint ${path}`);
  }));
  return writes;
}
describe("automatic assortment planning", () => {
  it("automatically analyzes the assortment after a confirmed import", async () => {
    const writes = mockApi(); const user = userEvent.setup(); render(<ForecastAccessProvider><AssortmentPanel/></ForecastAccessProvider>);
    await user.click(await screen.findByRole("button", { name: "CONFIRM_SYNTHETIC_IMPORT" }));
    await screen.findByRole("heading", { name: "План по ассортименту" });
    expect(writes).toHaveLength(1); expect(writes[0].payload).not.toHaveProperty("product_id");
  });
  it("shows every product before a secondary risk filter and keeps unknown stock distinct from zero", async () => {
    const user = userEvent.setup(); render(<AssortmentResults run={run}/>);
    expect(screen.getByRole("cell", { name: /^Круассан/ })).toBeInTheDocument(); expect(screen.getByRole("cell", { name: /^Хлеб/ })).toBeInTheDocument();
    const bread = screen.getByRole("cell", { name: /^Хлеб/ }).closest("tr")!;
    expect(within(bread).getAllByText("Неизвестно")).toHaveLength(4);
    await user.selectOptions(screen.getByRole("combobox", { name: "Показать риск" }), "shortage");
    expect(screen.getByRole("cell", { name: /^Круассан/ })).toBeInTheDocument(); expect(screen.queryByRole("cell", { name: /^Хлеб/ })).not.toBeInTheDocument();
  });
  it("starts one whole-assortment request without product selection and hides a single-location selector", async () => {
    const writes = mockApi(); const user = userEvent.setup(); render(<ForecastAccessProvider><AssortmentPanel/></ForecastAccessProvider>);
    const button = screen.getByRole("button", { name: "Рассчитать весь ассортимент" }); await waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByRole("combobox", { name: "Область анализа" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Продукт" })).not.toBeInTheDocument();
    await user.click(button); await screen.findByRole("heading", { name: "План по ассортименту" });
    expect(writes).toHaveLength(1); expect(writes[0].payload.location_id).toBe(7); expect(writes[0].payload).not.toHaveProperty("product_id"); expect(writes[0].payload.idempotency_key).toEqual(expect.any(String));
  });
  it("does not start paid analysis or allow an upload when the real subscription expired", async () => {
    const writes = mockApi({ demo: false }); render(<ForecastAccessProvider><AssortmentPanel/></ForecastAccessProvider>);
    expect(await screen.findByText(/Срок подписки истёк/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Рассчитать весь ассортимент" })).toBeDisabled();
    expect(screen.queryByLabelText("Файл CSV или XLSX")).not.toBeInTheDocument(); expect(writes).toHaveLength(0);
  });
  it("shows an authoritative server quota error without fabricated result rows", async () => {
    mockApi({ demo: false, active: true, failRun: true }); const user = userEvent.setup(); render(<ForecastAccessProvider><AssortmentPanel/></ForecastAccessProvider>);
    const button = screen.getByRole("button", { name: "Рассчитать весь ассортимент" }); await waitFor(() => expect(button).toBeEnabled()); await user.click(button);
    expect(await screen.findByText(/Месячный лимит исчерпан/)).toBeInTheDocument(); expect(screen.queryByRole("heading", { name: "План по ассортименту" })).not.toBeInTheDocument();
  });
});
