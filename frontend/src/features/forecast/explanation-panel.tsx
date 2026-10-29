"use client";

import { useI18n } from "@/components/language-provider";

import { Card,Notice } from "@/components/ui";
import { Clock3,Info } from "lucide-react";
import type { DetailedForecast,ExplanationDay } from "./types";

function DayExplanation({ day }: { day: ExplanationDay }) {
  const { t, number, dateLabel } = useI18n();

  return <details className="group rounded-xl border border-[#E3E9DC] bg-[#FAFBF7] p-4">
    <summary className="cursor-pointer text-sm font-semibold text-[#123C2F]">{t(dateLabel(day.date))} · {t(day.recommended_production === null ? "выпуск требует данных об остатках" : `произвести ${number(day.recommended_production)} шт.`)}</summary>
    <div className="mt-4 space-y-4 text-xs leading-relaxed text-[#5D6B62]">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><p className="font-semibold text-[#237A57]">{t("Недавнее среднее: ")}{t(number(day.recent_mean, 2))} {t(" шт.")}</p><p className="mt-1">{t(day.recent_sales.length ? day.recent_sales.map(point => `${dateLabel(point.date)}: ${point.sales}`).join(" · ") : "Наблюдений нет")}</p></div>
        <div><p className="font-semibold text-[#237A57]">{t("Тот же день недели: ")}{t(day.same_weekday_mean === null ? "нет наблюдений" : `${number(day.same_weekday_mean, 2)} шт.`)}</p><p className="mt-1">{t(day.same_weekday_sales.length ? day.same_weekday_sales.map(point => `${dateLabel(point.date)}: ${point.sales}`).join(" · ") : "Используется только недавнее среднее.")}</p></div>
      </div>
      <p>{t(day.weekday_difference === null ? "Сравнение дня недели недоступно." : `Среднее аналогичных дней ${day.weekday_difference >= 0 ? "выше" : "ниже"} недавнего среднего на ${number(Math.abs(day.weekday_difference), 2)} шт.`)} {t(" Вес недавних продаж — ")}{t(number(day.recent_weight * 100))}{t("%, аналогичных дней — ")}{t(number(day.same_weekday_weight * 100))}%.</p>
      <div className="rounded-lg border border-[#DDE7D3] bg-white p-3"><p className="font-medium text-[#123C2F]">{t("Расчёт спроса")}</p><p className="mt-1 break-words font-mono text-xs">{t(day.demand_formula)}</p><p className="mt-3 font-medium text-[#123C2F]">{t("Расчёт производства")}</p><p className="mt-1 break-words font-mono text-xs">{t(day.production_formula)}</p><p className="mt-2">{t("Спрос: ")}{t(number(day.predicted_demand))} {t(" шт. · с буфером: ")}{t(number(day.buffered_demand))} {t(" шт. · доступный запас: ")}{t(day.available_inventory === null ? "неизвестен" : `${number(day.available_inventory)} шт.`)}</p></div>
    </div>
  </details>;
}

export function ForecastExplanation({ forecast }: { forecast: DetailedForecast }) {
  const { t, number, pickupTime } = useI18n();

  const components = forecast.explanation_components;
  return <Card title={t("Почему именно такой объём")} subtitle={t("Объяснение рассчитано из фактических входных записей")} action={<Info size={16} className="text-[#5D6B62]" />}>
    <p className="text-sm leading-relaxed text-[#53664F]">{t(forecast.explanation)}</p>
    {components && <><div className="my-5 grid grid-cols-3 gap-3 rounded-xl bg-[#EEF3E5] p-4 text-xs"><div><p className="text-[#5D6B62]">{t("История")}</p><p className="mt-1 font-semibold text-[#123C2F]">{t(components.history_days)} {t(" дней")}</p></div><div><p className="text-[#5D6B62]">{t("Буфер")}</p><p className="mt-1 font-semibold text-[#123C2F]">{t(number(components.safety_buffer_percent))}%</p></div><div><p className="text-[#5D6B62]">{t("Учтено остатков")}</p><p className="mt-1 font-semibold text-[#123C2F]">{t(components.existing_inventory === null ? "Неизвестен" : `${components.existing_inventory} шт.`)}</p></div></div><div className="space-y-2">{components.days.map(day => <DayExplanation key={day.date} day={day} />)}</div><div className="mt-4"><Notice><ul className="list-disc space-y-1 pl-4">{components.limitations.map(text => <li key={text}>{t(text)}</li>)}</ul></Notice></div></>}
    <div className="mt-5 grid gap-4 border-t border-[#EDF0E7] pt-4 text-xs sm:grid-cols-2"><div><span className="text-[#5D6B62]">{t("Метод")}</span><p className="mt-1 font-medium text-[#237A57]">{t(forecast.method === "recent_weekday_baseline_v1" ? "Недавние продажи + день недели" : forecast.method)}</p></div><div><span className="text-[#5D6B62]">{t("Риск дефицита")}</span><p className="mt-1 font-medium text-[#237A57]">{t(forecast.stockout_risk)}</p></div><div><span className="text-[#5D6B62]">{t("Оценка на отложенных днях")}</span><p className="mt-1 font-medium text-[#237A57]">{t(forecast.mae !== null ? `MAE: ${number(forecast.mae, 1)} шт. · ${forecast.evaluation_points} наблюдений` : "Недостаточно данных для оценки точности")}</p></div><div><span className="flex items-center gap-1 text-[#5D6B62]"><Clock3 size={12} />{t("Сформировано")}</span><p className="mt-1 font-medium text-[#237A57]">{t(pickupTime(forecast.generated_at))} {t(" · Астана")}</p></div></div>
  </Card>;
}
