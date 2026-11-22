import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../src/components/language-provider";
import { Results, accuracySummary } from "../src/features/analysis/results";
import { AiDocument } from "../src/features/ai/ai-document";
import type { AnalysisItem, AnalysisReport } from "../src/features/analysis/types";

vi.mock("next/navigation", () => ({ usePathname: () => "/forecast" }));

const item: AnalysisItem = {
  product_id: 1, product_name: "Батон", location_id: 1, location_name: "Центр", unit: "шт.",
  status: "ready", model: "ridge", observations: 120, demand: 700, production: 760, inventory: 0,
  inventory_source: { warning: "", as_of_date: "2026-11-10" },
  metrics: { mae: 8, rmse: 10, wape: 14.6, points: [] },
  comparison: [
    { model: "last", mae: 20, rmse: 24, wape: 21 },
    { model: "mean7", mae: 15, rmse: 18, wape: 17 },
    { model: "ridge", mae: 13, rmse: 16, wape: 15 },
  ],
  daily: [{ date: "2026-11-11", demand: 100, production: 110, surplus: 10 }],
  actual_history: [], quality: { observed_days: 120, missing_days: 0, zero_days: 0, first_date: null, last_date: null },
  explanation: { mode: "rules", facts: [] }, trend_units: null,
} as AnalysisItem;
const report = { run_id: 1, created_at: "2026-11-10T07:00:00Z", target_date: "2026-11-11", horizon_days: 1, task: "production", cached: false, data_source: "real", items: [item] } as AnalysisReport;

describe("AI transparency", () => {
  it("compares the chosen model with same-as-yesterday", () => {
    expect(accuracySummary(item)).toEqual({ wape: 14.6, gain: 35, tried: 3 });
    expect(accuracySummary({ ...item, metrics: null })).toBeNull();
  });

  it("tells the user the forecast is made by AI and that a person decides", () => {
    render(<LanguageProvider><Results report={report} /></LanguageProvider>);
    expect(screen.getByText(/Прогноз рассчитан ИИ/)).toBeInTheDocument();
    expect(screen.getByText(/решаете вы/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Как работает ИИ" })).toHaveAttribute("href", "/ai");
    expect(screen.getByText("Точнее, чем «как вчера», на 35%.")).toBeInTheDocument();
    expect(screen.getByText("Ошибка на проверке — 14,6%.")).toBeInTheDocument();
  });

  it("explains model, data, quality, risk and limits", () => {
    render(<LanguageProvider><AiDocument /></LanguageProvider>);
    for (const name of ["Что делает ИИ", "Какая модель", "Как мы измеряем качество", "Данные и приватность", "Уровень риска и контроль человека", "Ограничения"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.getByText(/ИИ точнее на 29%/)).toBeInTheDocument();
    expect(screen.getByText(/Франкфурте \(Германия\).*переносим их в Казахстан/)).toBeInTheDocument();
  });
});
