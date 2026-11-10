import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider, LANGUAGE_STORAGE_KEY } from "../src/components/language-provider";
import { DailyPlan } from "../src/features/analysis/daily-plan";
import { Actuals } from "../src/features/analysis/actuals";
import AnalysisWorkspace from "../src/features/analysis/workspace";
import type { AnalysisItem, AnalysisReport } from "../src/features/analysis/types";

vi.mock("next/navigation", () => ({ usePathname: () => "/forecast" }));
vi.mock("../src/features/account/account", () => ({
  useAccount: () => ({ account: { user: { id: 1 } }, open: vi.fn(), loading: false }),
}));
vi.mock("../src/features/analysis/results", () => ({ Results: () => <div>Saved result</div> }));

const firstDay = "2026-11-11", secondDay = "2026-11-12";
function item(overrides: Partial<AnalysisItem> = {}): AnalysisItem {
  return {
    product_id: 1, product_name: "Bread", location_id: 1, location_name: "North", unit: "шт.",
    status: "ready", model: "mean7", observations: 20, demand: 5, production: 6, inventory: 0,
    inventory_source: { warning: "", as_of_date: "2026-11-10" }, metrics: null, comparison: [],
    daily: [{ date: firstDay, demand: 0, production: 0, surplus: 0 }, { date: secondDay, demand: 5, production: 6, surplus: 1 }],
    actual_history: [], quality: { observed_days: 20, missing_days: 0, zero_days: 1, first_date: null, last_date: null },
    explanation: { mode: "rules", facts: [] }, trend_units: null,
    ...overrides,
  };
}
const report: AnalysisReport = {
  run_id: 42, created_at: "2026-11-10T07:00:00Z", target_date: firstDay, horizon_days: 2,
  task: "production", cached: false, data_source: "real",
  items: [
    item(),
    item({ product_id: 2, product_name: "Bun", location_id: 2, location_name: "South", status: "estimate", daily: [
      { date: firstDay, demand: 12.75, production: null, surplus: null },
      { date: secondDay, demand: 10.25, production: null, surplus: null },
    ] }),
    item({ product_id: 3, product_name: "Cake", daily: [{ date: firstDay, demand: 9, production: 10, surplus: 1 }] }),
    item({ product_id: 4, product_name: "No history", status: "insufficient", daily: [] }),
  ],
};

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function tableRows() { return within(screen.getByRole("table", { name: "План по дням" })).getAllByRole("row").slice(1); }

describe("daily forecast plan", () => {
  it.each([
    ["ru", "План по дням", "Найти товар в плане", "Скачать план CSV"],
    ["en", "Daily plan", "Find a product in the plan", "Download plan CSV"],
    ["kk", "Күндер бойынша жоспар", "Жоспардан тауарды табу", "Жоспарды CSV түрінде жүктеу"],
  ])("keeps filters and the export action usable in %s", async (language, title, search, download) => {
    const user = userEvent.setup();
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    render(<LanguageProvider><DailyPlan report={report} /></LanguageProvider>);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    await user.type(screen.getByLabelText(search), "Cake");
    expect(within(screen.getByRole("table", { name: title })).getAllByRole("row")).toHaveLength(2);
    expect(screen.getByRole("button", { name: download })).toBeEnabled();
  });

  it("shows only real daily rows and preserves zero, unknown values and estimate labels", () => {
    render(<DailyPlan report={report} />);
    expect(screen.getByLabelText("День плана")).toHaveValue(firstDay);
    expect(tableRows()).toHaveLength(3);
    expect(within(tableRows()[0]).getAllByRole("cell").map((cell) => cell.textContent)).toContain("0");
    expect(within(tableRows()[1]).getAllByText("—")).toHaveLength(2);
    expect(within(tableRows()[1]).getByText("Предварительная оценка")).toBeInTheDocument();
    expect(screen.queryByRole("rowheader", { name: /No history/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Без дневного расчёта/)).toHaveTextContent("1");
  });

  it("combines day, product and location filters, then resets filters without changing the day", async () => {
    const user = userEvent.setup();
    render(<DailyPlan report={report} />);
    await user.click(screen.getByRole("button", { name: "Весь период" }));
    expect(tableRows()).toHaveLength(5);
    await user.selectOptions(screen.getByLabelText("День плана"), secondDay);
    await user.type(screen.getByLabelText("Найти товар в плане"), "  BUN  ");
    expect(tableRows()).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText("Точка в плане"), "1");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Скачать план CSV" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Сбросить фильтры плана" }));
    expect(tableRows()).toHaveLength(2);
    expect(screen.getByLabelText("День плана")).toHaveValue(secondDay);
    await user.click(screen.getByRole("button", { name: "Первый день" }));
    expect(tableRows()).toHaveLength(3);
  });

  it("sorts descending by actual forecast numbers, placing unknown production last", async () => {
    const user = userEvent.setup();
    render(<DailyPlan report={report} />);
    await user.selectOptions(screen.getByLabelText("Порядок строк"), "demand");
    expect(tableRows().map((row) => within(row).getByRole("rowheader").textContent)).toEqual(["Bun(шт.)", "Cake(шт.)", "Bread(шт.)"]);
    await user.selectOptions(screen.getByLabelText("Порядок строк"), "production");
    expect(tableRows().map((row) => within(row).getByRole("rowheader").textContent)).toEqual(["Cake(шт.)", "Bread(шт.)", "Bun(шт.)"]);
  });

  it("exports exactly visible rows with decimals and blanks, and escapes spreadsheet formulas", async () => {
    const user = userEvent.setup();
    let exported: Blob | undefined;
    const create = vi.fn((blob: Blob) => { exported = blob; return "blob:plan"; });
    const revoke = vi.fn();
    vi.stubGlobal("URL", class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<DailyPlan report={{ ...report, items: report.items.map((entry) => entry.product_id === 2 ? { ...entry, product_name: '=HYPERLINK("test")' } : entry) }} />);
    await user.selectOptions(screen.getByLabelText("День плана"), secondDay);
    await user.selectOptions(screen.getByLabelText("Точка в плане"), "2");
    await user.click(screen.getByRole("button", { name: "Скачать план CSV" }));
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:plan");
    const content = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(exported!); });
    const lines = content.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"2026-11-12","\'=HYPERLINK(""test"")","South"');
    expect(lines[1]).toContain('"10.25",,,"Предварительная оценка"');
    expect(content).not.toContain("Bread");
  });

  it("does not invent a plan when every product lacks daily data", () => {
    const { container } = render(<DailyPlan report={{ ...report, items: [item({ daily: [], status: "insufficient" })] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("reports a failed download without losing the current plan", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("URL", class extends URL { static createObjectURL(): never { throw new Error("browser unavailable"); } });
    render(<DailyPlan report={report} />);
    await user.click(screen.getByRole("button", { name: "Скачать план CSV" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось скачать план. Попробуйте ещё раз.");
    expect(tableRows()).toHaveLength(3);
  });
});

describe("forecast actual sales comparison", () => {
  it("loads only on demand and filters signed differences without turning missing days into zero", async () => {
    const user = userEvent.setup();
    const fetch = vi.fn(async (url: string) => {
      expect(url).toContain("/analysis/runs/42/actuals");
      return new Response(JSON.stringify([
      { product: "Bread", date: firstDay, predicted: 10, actual: 12, error: 2 },
      { product: "Bun", date: firstDay, predicted: 5, actual: 0, error: 5 },
      { product: "Cake", date: firstDay, predicted: 0, actual: 0, error: 0 },
      ]));
    });
    vi.stubGlobal("fetch", fetch);
    render(<Actuals run={42} />);
    await act(async () => {});
    expect(fetch).not.toHaveBeenCalled();
    await user.click(screen.getByText("Сравнить с фактическими продажами"));
    await screen.findByRole("table", { name: "Сравнение прогноза и факта" });
    expect(fetch).toHaveBeenCalledOnce();
    await user.selectOptions(screen.getByLabelText("Показать сравнение"), "below");
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByRole("rowheader")).toHaveTextContent("Bun");
    expect(screen.getByRole("cell", { name: "-5" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Показать сравнение"), "above");
    expect(screen.getByRole("cell", { name: "+2" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Показать сравнение"), "equal");
    expect(screen.getByRole("rowheader")).toHaveTextContent("Cake");
  });

  it("distinguishes loading from an empty comparison", async () => {
    const user = userEvent.setup();
    let resolve!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    render(<Actuals run={42} />);
    await user.click(screen.getByText("Сравнить с фактическими продажами"));
    expect(await screen.findByRole("status")).toHaveTextContent("Загружаем фактические продажи…");
    expect(screen.queryByText("Фактические продажи за прогнозный период ещё не записаны.")).not.toBeInTheDocument();
    await act(async () => resolve(new Response("[]")));
    expect(await screen.findByText("Фактические продажи за прогнозный период ещё не записаны.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("allows retry after a failed comparison request", async () => {
    const user = userEvent.setup();
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"detail":"Ошибка сервера"}', { status: 503 })).mockResolvedValueOnce(new Response("[]"));
    vi.stubGlobal("fetch", fetch);
    render(<Actuals run={42} />);
    await user.click(screen.getByText("Сравнить с фактическими продажами"));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByText("Фактические продажи за прогнозный период ещё не записаны.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

it("applies the tomorrow shortcut to the existing analysis request without running it prematurely", async () => {
  const user = userEvent.setup();
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/analysis/state")) return new Response(JSON.stringify({
      profile: null, latest: null, products: [{ id: 1, name: "Bread", unit: "шт." }],
      locations: [{ id: 1, name: "North", address: "" }], imports: [],
    }));
    if (url.endsWith("/analysis/runs") && init?.method === "POST") {
      requests.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(report));
    }
    throw new Error(url);
  }));
  render(<AnalysisWorkspace />);
  await user.click(await screen.findByRole("button", { name: "На завтра" }));
  expect(requests).toHaveLength(0);
  expect(screen.getByLabelText("Период")).toHaveValue("1");
  fireEvent.change(screen.getByLabelText("Что рассчитать?"), { target: { value: "production" } });
  await user.click(screen.getByRole("button", { name: "Запустить анализ" }));
  await waitFor(() => expect(requests).toEqual([{ horizon_days: 1, task: "production" }]));
  await screen.findByText("Saved result");
});
