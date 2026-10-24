"use client";

import { Clock3, Info } from "lucide-react";
import { Card, Notice, dateLabel, number } from "@/components/ui";
import type { DetailedForecast, ExplanationDay } from "./types";

function DayExplanation({ day }: { day: ExplanationDay }) {
  return <details className="group rounded-xl border border-[#E3E9DC] bg-[#FAFBF7] p-4">
    <summary className="cursor-pointer text-sm font-semibold text-[#123C2F]">{dateLabel(day.date)} · произвести {number(day.recommended_production)} шт.</summary>
    <div className="mt-4 space-y-4 text-xs leading-relaxed text-[#5D6B62]">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><p className="font-semibold text-[#237A57]">Недавнее среднее: {number(day.recent_mean, 2)} шт.</p><p className="mt-1">{day.recent_sales.length ? day.recent_sales.map(point => `${dateLabel(point.date)}: ${point.sales}`).join(" · ") : "Наблюдений нет"}</p></div>
        <div><p className="font-semibold text-[#237A57]">Тот же день недели: {day.same_weekday_mean === null ? "нет наблюдений" : `${number(day.same_weekday_mean, 2)} шт.`}</p><p className="mt-1">{day.same_weekday_sales.length ? day.same_weekday_sales.map(point => `${dateLabel(point.date)}: ${point.sales}`).join(" · ") : "Используется только недавнее среднее."}</p></div>
      </div>
      <p>{day.weekday_difference === null ? "Сравнение дня недели недоступно." : `Среднее аналогичных дней ${day.weekday_difference >= 0 ? "выше" : "ниже"} недавнего среднего на ${number(Math.abs(day.weekday_difference), 2)} шт.`} Вес недавних продаж — {number(day.recent_weight * 100)}%, аналогичных дней — {number(day.same_weekday_weight * 100)}%.</p>
      <div className="rounded-lg border border-[#DDE7D3] bg-white p-3"><p className="font-medium text-[#123C2F]">Расчёт спроса</p><p className="mt-1 break-words font-mono text-xs">{day.demand_formula}</p><p className="mt-3 font-medium text-[#123C2F]">Расчёт производства</p><p className="mt-1 break-words font-mono text-xs">{day.production_formula}</p><p className="mt-2">Спрос: {number(day.predicted_demand)} шт. · с буфером: {number(day.buffered_demand)} шт. · доступный запас: {number(day.available_inventory)} шт.</p></div>
    </div>
  </details>;
}

export function ForecastExplanation({ forecast }: { forecast: DetailedForecast }) {
  const components = forecast.explanation_components;
  return <Card title="Почему именно такой объём" subtitle="Объяснение рассчитано из фактических входных записей" action={<Info size={16} className="text-[#5D6B62]" />}>
    <p className="text-sm leading-relaxed text-[#53664F]">{forecast.explanation}</p>
    {components && <><div className="my-5 grid grid-cols-3 gap-3 rounded-xl bg-[#EEF3E5] p-4 text-xs"><div><p className="text-[#5D6B62]">История</p><p className="mt-1 font-semibold text-[#123C2F]">{components.history_days} дней</p></div><div><p className="text-[#5D6B62]">Буфер</p><p className="mt-1 font-semibold text-[#123C2F]">{number(components.safety_buffer_percent)}%</p></div><div><p className="text-[#5D6B62]">Учтено остатков</p><p className="mt-1 font-semibold text-[#123C2F]">{components.existing_inventory} шт.</p></div></div><div className="space-y-2">{components.days.map(day => <DayExplanation key={day.date} day={day} />)}</div><div className="mt-4"><Notice><ul className="list-disc space-y-1 pl-4">{components.limitations.map(text => <li key={text}>{text}</li>)}</ul></Notice></div></>}
    <div className="mt-5 grid gap-4 border-t border-[#EDF0E7] pt-4 text-xs sm:grid-cols-2"><div><span className="text-[#5D6B62]">Метод</span><p className="mt-1 font-medium text-[#237A57]">{forecast.method === "recent_weekday_baseline_v1" ? "Недавние продажи + день недели" : forecast.method}</p></div><div><span className="text-[#5D6B62]">Риск дефицита</span><p className="mt-1 font-medium text-[#237A57]">{forecast.stockout_risk}</p></div><div><span className="text-[#5D6B62]">Оценка на отложенных днях</span><p className="mt-1 font-medium text-[#237A57]">{forecast.mae !== null ? `MAE: ${number(forecast.mae, 1)} шт. · ${forecast.evaluation_points} наблюдений` : "Недостаточно данных для оценки точности"}</p></div><div><span className="flex items-center gap-1 text-[#5D6B62]"><Clock3 size={12} />Сформировано</span><p className="mt-1 font-medium text-[#237A57]">{new Date(forecast.generated_at).toLocaleString("ru-RU", { timeZone: "Asia/Qyzylorda" })} · Астана</p></div></div>
  </Card>;
}
