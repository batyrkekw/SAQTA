"use client";

import { useI18n } from "@/components/language-provider";

import { useApi } from "@/lib/api";
import type { Dashboard } from "@/types/api";
import { RefreshCw } from "lucide-react";

/** Public preview uses exactly the same persisted records as the working dashboard. */
export default function LandingAnalytics() {
  const { t, dateLabel, number } = useI18n();

  const { data, loading, error, reload } = useApi<Dashboard>("/dashboard");
  if (loading) return <div role="status" aria-label={t("Загрузка данных аналитики")} className="border-b border-[#E2E8E1] p-6"><div className="grid grid-cols-3 gap-4">{[1, 2, 3].map((item) => <div key={item} className="animate-pulse"><div className="h-3 w-16 rounded bg-[#E0E6D8]" /><div className="mt-3 h-7 w-20 rounded bg-[#E0E6D8]" /></div>)}</div><p className="mt-4 text-xs text-[#6A786E]">{t("Загружаем записи из базы данных…")}</p></div>;
  if (error || !data) return <div className="flex items-start justify-between gap-4 border-b border-[#E2E8E1] px-6 py-4"><p className="max-w-[330px] text-xs leading-6 text-[#5D6B62]">{t("Сейчас API недоступен. После подключения сервера здесь появятся показатели из базы данных.")}</p><button type="button" aria-label={t("Повторить загрузку аналитики")} onClick={reload} className="rounded-lg border border-[#D8E2D0] p-2 text-[#237A57] transition hover:bg-white"><RefreshCw size={15} /></button></div>;
  const period = `${dateLabel(data.period.start_date)} — ${dateLabel(data.period.end_date)}`;
  return <div className="border-b border-[#E2E8E1] p-6"><div className="mb-5 flex items-center justify-between gap-2"><p className="text-xs text-[#5D6B62]">{t("Записи за ")}{t(period)}</p><span className="rounded-full border border-[#DDE5D1] bg-white px-2 py-1 text-xs font-semibold uppercase tracking-wider text-[#607348]">{t(data.demo_data ? "DEMO DATA" : "Данные рабочей области")}</span></div><div className="grid grid-cols-3 gap-4">{[{ label: "Произведено", value: data.metrics.produced }, { label: "Продано", value: data.metrics.sold }, { label: "Списано", value: data.metrics.written_off }].map((metric) => <div key={metric.label}><p className="text-xs text-[#5D6B62]">{t(metric.label)}</p><p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-[#123C2F]">{number(metric.value)}<span className="ml-1 text-xs font-normal text-[#6A786E]">{t("шт.")}</span></p></div>)}</div></div>;
}
