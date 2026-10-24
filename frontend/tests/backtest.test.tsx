import React, { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BacktestPanel, { BacktestResults } from "../src/features/forecast/backtest-panel";
import type { BacktestResult } from "../src/features/forecast/types";

vi.mock("recharts", () => ({ ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>, LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>, CartesianGrid: () => null, Legend: () => null, Line: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null }));
afterEach(() => vi.unstubAllGlobals());

const report: BacktestResult = {
  product_id: 1, product_name: "Круассан", location_id: 1, demo_data: true, data_source: "synthetic", status: "ok", method: "recent_weekday_baseline_v1", naive_method: "last_observed_sales", history_days: 42, min_train_days: 14, requested_test_days: 7, evaluation_points: 7,
  period: { start_date: "2026-10-18", end_date: "2026-10-24" }, metrics: { mae: 7.5, wape_percent: 10 }, naive_metrics: { mae: 10, wape_percent: 13.33 }, mae_improvement_percent: 25,
  points: [{ date: "2026-10-24", actual: 80, predicted: 72.5, naive_predicted: 70, absolute_error: 7.5, naive_absolute_error: 10, training_observations: 35, training_end_date: "2026-10-23" }], warnings: ["Малая тестовая выборка ограничивает надёжность."], requirements: ["Нужны date, product_id, location_id и quantity ежедневных продаж."], generated_at: "2026-10-24T08:00:00Z",
};

function mockApi(result: BacktestResult) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    const path = new URL(url).pathname;
    return new Response(JSON.stringify(path === "/api/products" ? [{ id: 1, name: "Круассан" }] : path === "/api/locations" ? [{ id: 1, name: "Есиль" }] : result));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("historical backtest UI", () => {
  it("requests selected history settings and labels synthetic metrics as unverified for a real bakery", async () => {
    const fetchMock = mockApi(report);
    const user = userEvent.setup();
    render(<BacktestPanel />);
    const run = screen.getByRole("button", { name: /Запустить проверку/ });
    await waitFor(() => expect(run).toBeEnabled());
    expect(screen.queryByText("MAE · SAQTA")).not.toBeInTheDocument();
    await user.click(run);
    expect(await screen.findByText("MAE · SAQTA")).toBeInTheDocument();
    expect(screen.getByText("SYNTHETIC / DEMO")).toBeInTheDocument();
    expect(screen.getByText(/не подтверждает качество прогноза на реальной пекарне/)).toBeInTheDocument();
    const url = new URL(fetchMock.mock.calls.find(([input]) => String(input).includes("/backtest"))![0]);
    expect(Object.fromEntries(url.searchParams)).toEqual({ product_id: "1", location_id: "1", min_train_days: "14", test_days: "7" });
    expect(screen.getByText(/Малая тестовая выборка/)).toBeInTheDocument();
    expect(screen.getByText(/только более ранние наблюдения/)).toBeInTheDocument();
  });
  it("renders requirements instead of invented accuracy when history is insufficient", () => {
    render(<BacktestResults result={{ ...report, status: "insufficient_history", history_days: 5, evaluation_points: 0, metrics: { mae: null, wape_percent: null }, naive_metrics: { mae: null, wape_percent: null }, points: [] }} />);
    expect(screen.getByText("Недостаточно данных для исторической проверки")).toBeInTheDocument();
    expect(screen.queryByText("MAE · SAQTA")).not.toBeInTheDocument();
    expect(screen.getByText(/Нужны date, product_id/)).toBeInTheDocument();
  });
  it("does not invent WAPE when actual sales sum to zero", () => {
    render(<BacktestResults result={{ ...report, demo_data: false, data_source: "real", metrics: { mae: 0, wape_percent: null }, naive_metrics: { mae: 0, wape_percent: null }, mae_improvement_percent: null }} />);
    expect(screen.getByText("РЕАЛЬНЫЕ ДАННЫЕ")).toBeInTheDocument();
    expect(screen.getAllByText("Не определён")).toHaveLength(2);
  });
});
