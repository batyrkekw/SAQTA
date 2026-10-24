import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportWorkflow } from "../src/features/data/import-workflow";
import { CsvTools } from "../src/components/csv-tools";
import type { ImportInspection, ImportOptions, ImportPreview, SourceOrigin } from "../src/types/imports";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const columns = ["date", "quantity", "kind", "product_id", "location_id"];
const record = { kind: "production" as const, product_id: 1, location_id: 1, date: "2026-10-24", quantity: 5, reason: "", unit_price_kzt: null, unit: "шт.", product_name: "Круассан", location_name: "Есиль" };
const inspection: ImportInspection = {
  file_sha256: "checked-file", workspace_mode: "demo", source_origin: "demo",
  sheets: [{ name: "CSV", columns, row_count: 1 }], selected_sheet: "CSV", columns,
  sample_rows: [{ row: 2, values: { date: "2026-10-24", quantity: "5", kind: "production", product_id: "1", location_id: "1" } }],
  suggested_mapping: { date: "date", quantity: "quantity", kind: "kind", product: "product_id", location: "location_id" },
  classification: "daily_records_candidate", limits: { max_bytes: 2097152, max_rows: 5000, max_columns: 80, formats: ["csv", "xlsx"] },
};
const preview: ImportPreview = {
  preview_token: "checked-preview", file_sha256: "checked-file", classification: "daily_records_candidate",
  workspace_mode: "demo", source_origin: "demo", selected_sheet: "CSV", total_rows: 1, valid_rows: 1, duplicate_rows: 0,
  rejected_rows: 0, can_commit: true, errors: [], warnings: ["Повторы проверены без изменения остатков."],
  preview_rows: [{ row: 2, status: "ready", record }],
};

function mockImportApi(options: { mode?: SourceOrigin; inspected?: Partial<ImportInspection>; checked?: Partial<ImportPreview> } = {}) {
  const requests: { path: string; body: FormData }[] = [];
  const mode = options.mode || "demo";
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    if (init?.method === "POST") {
      requests.push({ path, body: init.body as FormData });
      if (path === "/api/imports/inspect") return new Response(JSON.stringify({ ...inspection, workspace_mode: mode, source_origin: mode, ...options.inspected }));
      if (path === "/api/imports/preview") {
        const sent = JSON.parse(String((init.body as FormData).get("options"))) as ImportOptions;
        return new Response(JSON.stringify({ ...preview, workspace_mode: mode, source_origin: mode, selected_sheet: sent.sheet || "CSV", ...options.checked }));
      }
      if (path === "/api/imports/commit") return new Response(JSON.stringify({ batch_id: 8, imported_count: 1, duplicate_count: 0, rejected_count: 0, message: "Импорт сохранён; дубликаты пропущены", source_origin: mode }));
      throw new Error(`Unexpected write endpoint ${path}`);
    }
    if (path === "/api/settings") return new Response(JSON.stringify({ bakery_name: "SAQTA", city: "Астана", currency: "KZT", safety_buffer_percent: 10, workspace_mode: mode, demo_data: mode === "demo", data_source: mode, auth_enabled: false }));
    if (path === "/api/products") return new Response(JSON.stringify([{ id: 1, name: "Круассан", category: "Выпечка", unit: "шт.", price_kzt: 750, cost_kzt: 290, weight_grams: 80, is_active: true }]));
    if (path === "/api/locations") return new Response(JSON.stringify([{ id: 1, bakery_id: 1, name: "Есиль", address: "Демо-адрес", city: "Астана" }]));
    if (path === "/api/export") return new Response("kind,product_id,location_id,date,quantity\n");
    throw new Error(`Unexpected endpoint ${path}`);
  });
  vi.stubGlobal("fetch", fetch);
  return { requests, fetch };
}

async function acknowledge(user: ReturnType<typeof userEvent.setup>, origin: SourceOrigin = "demo") {
  await user.selectOptions(screen.getByRole("combobox", { name: "Происхождение файла" }), origin);
  const checkbox = screen.getByRole("checkbox", { name: origin === "demo" ? /^Подтверждаю, что файл/ : /^Подтверждаю, что использую/ });
  await waitFor(() => expect(checkbox).toBeEnabled());
  await user.click(checkbox);
  await waitFor(() => expect(screen.getByRole("button", { name: "Выбрать файл" })).toBeEnabled());
}

async function upload(user: ReturnType<typeof userEvent.setup>, filename = "synthetic.csv") {
  await user.upload(screen.getByLabelText("Файл CSV или XLSX"), new File(["synthetic fixture only"], filename, { type: filename.endsWith("xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv" }));
  await screen.findByRole("heading", { name: "3. Сопоставьте столбцы" });
}

describe("verified import workflow", () => {
  it("requires an explicit source and synthetic acknowledgement, and blocks real files in DEMO before upload", async () => {
    const { requests } = mockImportApi();
    const user = userEvent.setup();
    render(<ImportWorkflow />);
    expect(screen.getByRole("combobox", { name: "Происхождение файла" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Выбрать файл" })).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Происхождение файла" }), "real");
    expect(await screen.findByText(/Реальный файл нельзя загружать в публичное DEMO/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Выбрать файл" })).toBeDisabled();
    expect(screen.getByLabelText("Файл CSV или XLSX")).toBeDisabled();
    await acknowledge(user);
    expect(requests).toHaveLength(0);
    await upload(user);
    expect(requests.map(request => request.path)).toEqual(["/api/imports/inspect"]);
    expect(requests[0].body.get("source_origin")).toBe("demo");
  });

  it("only commits after preview and separate confirmation, preserving the checked token and mapping", async () => {
    const { requests } = mockImportApi();
    const imported = vi.fn();
    const user = userEvent.setup();
    render(<ImportWorkflow onImported={imported} />);
    await acknowledge(user);
    await upload(user);
    expect(requests).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Проверить и показать строки" }));
    const commit = await screen.findByRole("button", { name: "Подтвердить импорт" });
    expect(commit).toBeDisabled();
    expect(requests.map(request => request.path)).toEqual(["/api/imports/inspect", "/api/imports/preview"]);
    expect(screen.getByRole("table", { name: /Нормализованные строки/ })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /^Я проверил сопоставление/ }));
    await user.click(commit);
    await screen.findByText("Импорт завершён");
    expect(imported).toHaveBeenCalledOnce();
    const submitted = requests.at(-1)!;
    expect(submitted.path).toBe("/api/imports/commit");
    expect(submitted.body.get("confirm")).toBe("IMPORT SAQTA");
    expect(submitted.body.get("preview_token")).toBe("checked-preview");
    expect(JSON.parse(String(submitted.body.get("options")))).toEqual({ source_origin: "demo", sheet: "CSV", column_mapping: inspection.suggested_mapping, date_format: "iso", number_format: "dot" });
  });

  it("invalidates the preview token and confirmation whenever the mapping or format changes", async () => {
    const { requests } = mockImportApi();
    const user = userEvent.setup();
    render(<ImportWorkflow />);
    await acknowledge(user);
    await upload(user);
    await user.click(screen.getByRole("button", { name: "Проверить и показать строки" }));
    await screen.findByRole("button", { name: "Подтвердить импорт" });
    await user.click(screen.getByRole("checkbox", { name: /^Я проверил сопоставление/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Формат текстовых дат" }), "dmy");
    expect(screen.queryByRole("button", { name: "Подтвердить импорт" })).not.toBeInTheDocument();
    expect(requests.filter(request => request.path.endsWith("/commit"))).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Проверить и показать строки" }));
    expect(await screen.findByRole("button", { name: "Подтвердить импорт" })).toBeDisabled();
    const options = JSON.parse(String(requests.at(-1)!.body.get("options"))) as ImportOptions;
    expect(options.date_format).toBe("dmy");
  });

  it("reports repeated records without creating a misleading import action", async () => {
    const { requests } = mockImportApi({ checked: { valid_rows: 0, duplicate_rows: 1, can_commit: false, preview_rows: [{ row: 2, status: "duplicate", record }] } });
    const user = userEvent.setup();
    render(<ImportWorkflow />);
    await acknowledge(user);
    await upload(user);
    await user.click(screen.getByRole("button", { name: "Проверить и показать строки" }));
    expect(await screen.findByText(/Все строки уже существуют/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Подтвердить импорт" })).not.toBeInTheDocument();
    expect(requests.filter(request => request.path.endsWith("/commit"))).toHaveLength(0);
  });

  it("shows row validation errors and blocks the whole batch instead of silently importing valid rows", async () => {
    const { requests } = mockImportApi({ checked: { valid_rows: 0, rejected_rows: 1, can_commit: false, errors: [{ row: 2, field: "quantity", message: "Количество должно быть целым" }], preview_rows: [{ row: 2, status: "error" }] } });
    const user = userEvent.setup();
    render(<ImportWorkflow />);
    await acknowledge(user);
    await upload(user);
    await user.click(screen.getByRole("button", { name: "Проверить и показать строки" }));
    expect(await screen.findByText(/Строка 2, quantity: Количество должно быть целым/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Подтвердить импорт" })).not.toBeInTheDocument();
    expect(requests.filter(request => request.path.endsWith("/commit"))).toHaveLength(0);
  });

  it("allows manual sheet mapping and explicit defaults in a real workspace without inferring file provenance", async () => {
    const { requests } = mockImportApi({ mode: "real", inspected: { sheets: [...inspection.sheets, { name: "Продажи", columns: ["День", "Объём"], row_count: 1 }] } });
    const user = userEvent.setup();
    render(<ImportWorkflow />);
    await screen.findByText("База реальных данных · требуется закрытое окружение");
    expect(screen.getByRole("combobox", { name: "Происхождение файла" })).toHaveValue("");
    await acknowledge(user, "real");
    await upload(user, "private-test-fixture.xlsx");
    await user.selectOptions(screen.getByRole("combobox", { name: "Лист таблицы" }), "Продажи");
    expect(screen.getByRole("combobox", { name: /^Дата \*/ })).toHaveValue("");
    await user.selectOptions(screen.getByRole("combobox", { name: /^Дата \*/ }), "День");
    await user.selectOptions(screen.getByRole("combobox", { name: /^Количество \*/ }), "Объём");
    await user.selectOptions(screen.getByRole("combobox", { name: "Тип для всего листа" }), "sales");
    await user.selectOptions(screen.getByRole("combobox", { name: "Товар для всего листа" }), "1");
    await user.selectOptions(screen.getByRole("combobox", { name: "Точка для всего листа" }), "1");
    await user.selectOptions(screen.getByRole("combobox", { name: "Формат текстовых дат" }), "dmy");
    await user.selectOptions(screen.getByRole("combobox", { name: "Десятичный разделитель" }), "comma");
    await user.click(screen.getByRole("button", { name: "Проверить и показать строки" }));
    await screen.findByRole("button", { name: "Подтвердить импорт" });
    const options = JSON.parse(String(requests.at(-1)!.body.get("options"))) as ImportOptions;
    expect(options).toEqual({ source_origin: "real", sheet: "Продажи", column_mapping: { date: "День", quantity: "Объём" }, default_kind: "sales", default_product_id: 1, default_location_id: 1, date_format: "dmy", number_format: "comma" });
  });

  it("keeps survey answers separate from a daily ledger", async () => {
    const { requests } = mockImportApi({ inspected: { classification: "survey" } });
    const user = userEvent.setup();
    render(<ImportWorkflow />);
    await acknowledge(user);
    await upload(user);
    expect(screen.getByText(/Этот лист похож на анкету/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Проверить и показать строки" })).toBeDisabled();
    expect(requests).toHaveLength(1);
  });

  it("rejects unsupported or oversized files before sending their contents", async () => {
    const { requests } = mockImportApi();
    const user = userEvent.setup({ applyAccept: false });
    render(<ImportWorkflow />);
    await acknowledge(user);
    await user.upload(screen.getByLabelText("Файл CSV или XLSX"), new File(["invalid"], "old.xls"));
    expect(await screen.findByText(/Выберите CSV или XLSX. Форматы XLS и XLSM/)).toBeInTheDocument();
    await user.upload(screen.getByLabelText("Файл CSV или XLSX"), new File([new Uint8Array(2097153)], "large.csv", { type: "text/csv" }));
    expect(await screen.findByText(/Максимальный размер файла — 2 МБ/)).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it("keeps the CsvTools export action compatible with existing filters", async () => {
    const { fetch } = mockImportApi();
    vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:fixture"); static revokeObjectURL = vi.fn(); });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<CsvTools filters={{ location_id: 2, start_date: "2026-10-01" }} />);
    expect(screen.queryByRole("combobox", { name: "Происхождение файла" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Экспорт CSV" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/export?location_id=2&start_date=2026-10-01")));
    await user.click(screen.getByRole("button", { name: "Импорт CSV / XLSX" }));
    expect(screen.getByRole("combobox", { name: "Происхождение файла" })).toHaveValue("");
  });
});
