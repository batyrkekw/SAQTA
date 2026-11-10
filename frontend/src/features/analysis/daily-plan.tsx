"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useI18n } from "@/components/language-provider";
import { Badge, Card, Field, Notice } from "@/components/ui";
import type { AnalysisItem, AnalysisReport } from "./types";

type PlanRow = AnalysisItem["daily"][number] & {
  product_id: number;
  product_name: string;
  location_id: number;
  location_name: string;
  unit: string;
  status: AnalysisItem["status"];
};
type Sort = "product" | "demand" | "production" | "surplus";

function csvCell(value: string | number | null) {
  if (value === null) return "";
  const text = typeof value === "string" && /^\s*[=+@-]/.test(value)
    ? `'${value}`
    : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function planCsv(rows: PlanRow[], t: (value: string) => string) {
  const header = [
    "Дата", "Товар", "Точка", "Единица измерения", "Спрос", "Производство",
    "Расчётный избыток", "Основа расчёта",
  ];
  const data = rows.map((row) => [
    row.date, row.product_name, row.location_name, t(row.unit), row.demand,
    row.production, row.surplus,
    t(row.status === "estimate" ? "Предварительная оценка" : "По истории продаж"),
  ]);
  return "\uFEFF" + [header.map(t), ...data]
    .map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function DailyPlan({ report }: { report: AnalysisReport }) {
  const { t, dateLabel, number, language } = useI18n();
  const dates = [...new Set(report.items.flatMap((item) => item.daily.map((day) => day.date)))].sort();
  const [day, setDay] = useState(dates[0] ?? "");
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [sort, setSort] = useState<Sort>("product");
  const [error, setError] = useState("");
  const selectedDay = dates.includes(day) ? day : "";
  const locations = [...new Map(report.items.map((item) => [item.location_id, item.location_name])).entries()];
  const query = search.trim().toLocaleLowerCase();
  const rows: PlanRow[] = report.items
    .filter((item) => (!location || String(item.location_id) === location)
      && item.product_name.toLocaleLowerCase().includes(query))
    .flatMap((item) => item.daily
      .filter((point) => !selectedDay || point.date === selectedDay)
      .map((point) => ({ ...point, product_id: item.product_id, product_name: item.product_name,
        location_id: item.location_id, location_name: item.location_name, unit: item.unit, status: item.status })))
    .sort((a, b) => {
      if (sort !== "product") {
        const left = a[sort], right = b[sort];
        if (left === null && right !== null) return 1;
        if (right === null && left !== null) return -1;
        if (left !== null && right !== null && left !== right) return right - left;
      }
      return a.product_name.localeCompare(b.product_name, language)
        || a.location_name.localeCompare(b.location_name, language)
        || a.date.localeCompare(b.date);
    });
  const missing = report.items.filter((item) => !item.daily.length).length;

  function download() {
    setError("");
    let url: string | undefined;
    try {
      url = URL.createObjectURL(new Blob([planCsv(rows, t)], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `SaqtaFood-Forecast-${report.run_id}-${selectedDay || "period"}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      setError("Не удалось скачать план. Попробуйте ещё раз.");
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  if (!dates.length) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{t("План по дням")}</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 muted">
            {t("Выберите день и точку, чтобы подготовить план смены. CSV содержит только видимые строки этого расчёта.")}
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={download} disabled={!rows.length}>
          <Download size={16} aria-hidden="true" />{t("Скачать план CSV")}
        </button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label={t("День плана")}>
          <select className="field" value={selectedDay} onChange={(e) => setDay(e.target.value)}>
            <option value="">{t("Весь период")}</option>
            {dates.map((date) => <option key={date} value={date}>{dateLabel(date)}</option>)}
          </select>
        </Field>
        <Field label={t("Найти товар в плане")}>
          <input type="search" className="field" value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        <Field label={t("Точка в плане")}>
          <select className="field" value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">{t("Все точки")}</option>
            {locations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </Field>
        <Field label={t("Порядок строк")}>
          <select className="field" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="product">{t("По названию товара")}</option>
            <option value="demand">{t("Сначала выше спрос")}</option>
            <option value="production">{t("Сначала больше производство")}</option>
            <option value="surplus">{t("Сначала больше избыток")}</option>
          </select>
        </Field>
      </div>
      <div className="my-4 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary aria-pressed:border-[#237a57] aria-pressed:bg-[#eaf3e6]" aria-pressed={selectedDay === dates[0]} onClick={() => setDay(dates[0])}>
          {t("Первый день")}
        </button>
        <button type="button" className="btn-secondary aria-pressed:border-[#237a57] aria-pressed:bg-[#eaf3e6]" aria-pressed={!selectedDay} onClick={() => setDay("")}>
          {t("Весь период")}
        </button>
        {(search || location || sort !== "product") && (
          <button type="button" className="btn-secondary" onClick={() => { setSearch(""); setLocation(""); setSort("product"); }}>
            {t("Сбросить фильтры плана")}
          </button>
        )}
        <p className="text-xs muted" role="status">{t("Строк в плане")}: {rows.length}</p>
      </div>
      {error && <Notice kind="error">{t(error)}</Notice>}
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-[700px]" aria-label={t("План по дням")}>
            <thead><tr>{["Дата", "Товар", "Точка", "Спрос", "Производство", "Расчётный избыток", "Основа расчёта"].map((label) => <th scope="col" key={label}>{t(label)}</th>)}</tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={`${row.product_id}:${row.location_id}:${row.date}`}>
                <td className="whitespace-nowrap">{dateLabel(row.date)}</td>
                <th scope="row" className="text-left font-medium">{row.product_name}<span className="ml-1 text-xs font-normal muted">({t(row.unit)})</span></th>
                <td>{row.location_name}</td>
                <td>{number(row.demand, 2)}</td>
                <td>{row.production === null ? "—" : number(row.production, 2)}</td>
                <td>{row.surplus === null ? "—" : number(row.surplus, 2)}</td>
                <td><Badge tone={row.status === "estimate" ? "amber" : "green"}>{t(row.status === "estimate" ? "Предварительная оценка" : "По истории продаж")}</Badge></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Notice>{t("Нет строк по выбранным фильтрам. Измените день, товар или точку.")}</Notice>}
      <p className="mt-3 text-xs leading-5 muted">{t("Прочерк означает, что значение не рассчитано. Оценка по анкете не заменяет прогноз по истории продаж.")}</p>
      {missing > 0 && <p className="mt-2 text-xs muted">{t("Без дневного расчёта")}: {missing}. {t("Причины указаны в карточках товаров ниже.")}</p>}
    </Card>
  );
}
