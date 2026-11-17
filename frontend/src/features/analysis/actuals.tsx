"use client";

import { useState } from "react";
import { useI18n } from "@/components/language-provider";
import { ErrorState, Field, Notice } from "@/components/ui";
import { useApi } from "@/lib/api";

type ActualRow = { product: string; date: string; predicted: number; actual: number; error: number };
type Comparison = "all" | "above" | "below" | "equal";

export function Actuals({ run }: { run: number }) {
  const { t, number, dateLabel } = useI18n();
  const [open, setOpen] = useState(false);
  const [comparison, setComparison] = useState<Comparison>("all");
  const actuals = useApi<ActualRow[]>(open ? `/analysis/runs/${run}/actuals` : null);
  const rows = (actuals.data ?? []).filter((row) => comparison === "all"
    || (comparison === "above" && row.actual > row.predicted)
    || (comparison === "below" && row.actual < row.predicted)
    || (comparison === "equal" && row.actual === row.predicted));
  return (
    <details className="mt-4 text-sm" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer font-medium text-[#237a57]">{t("Сравнить с фактическими продажами")}</summary>
      {open && (
        <div className="mt-4 space-y-3">
          {actuals.error ? <ErrorState error={actuals.error} retry={actuals.reload} />
            : actuals.loading ? <p role="status" className="muted">{t("Загружаем фактические продажи…")}</p>
              : actuals.data?.length ? <>
                <div className="max-w-sm">
                  <Field label={t("Показать сравнение")}>
                    <select className="field" value={comparison} onChange={(e) => setComparison(e.target.value as Comparison)}>
                      <option value="all">{t("Все записанные дни")}</option>
                      <option value="above">{t("Факт выше прогноза")}</option>
                      <option value="below">{t("Факт ниже прогноза")}</option>
                      <option value="equal">{t("Факт совпал с прогнозом")}</option>
                    </select>
                  </Field>
                </div>
                <p className="text-xs muted">{t("Показаны только дни с записанными продажами. Разница = факт − прогноз.")}</p>
                {rows.length ? <div className="overflow-x-auto">
                  <table aria-label={t("Сравнение прогноза и факта")}>
                    <thead><tr>{["Товар", "Дата", "Прогноз", "Факт", "Разница"].map((label) => <th scope="col" key={label}>{t(label)}</th>)}</tr></thead>
                    <tbody>{rows.map((row, index) => {
                      const difference = row.actual - row.predicted;
                      return <tr key={`${row.product}:${row.date}:${index}`}>
                        <th scope="row" className="text-left font-medium">{row.product}</th>
                        <td>{dateLabel(row.date)}</td><td>{number(row.predicted, 2)}</td><td>{number(row.actual, 2)}</td>
                        <td>{difference > 0 ? "+" : ""}{number(difference, 2)}</td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div> : <Notice>{t("Для этого условия совпадений нет.")}</Notice>}
              </> : <p className="muted">{t("Фактические продажи за прогнозный период ещё не записаны.")}</p>}
        </div>
      )}
    </details>
  );
}
