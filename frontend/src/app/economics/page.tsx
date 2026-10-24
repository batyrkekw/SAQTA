"use client";

import { useMemo, useState } from "react";
import { Calculator, CircleHelp, Info, RotateCcw, SlidersHorizontal, Target, Wallet } from "lucide-react";
import AppShell from "@/components/app-shell";
import { calculateEconomics, DEFAULT_ECONOMICS, type EconomicsAssumptions } from "@/lib/economics";

const money = (value: number) => `${new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: 0 }).format(value)} ₸`;
const decimal = (value: number) => new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: 1 }).format(value);

type InputProps = {
  label: string;
  name: keyof EconomicsAssumptions;
  unit?: string;
  step?: number;
  value: number;
  onChange: (key: keyof EconomicsAssumptions, value: number) => void;
};

function AssumptionInput({ label, name, unit = "₸", step = 1000, value, onChange }: InputProps) {
  return <div><label className="mb-2 block text-xs font-medium text-[#5D6B62]" htmlFor={`economics-${name}`}>{label}</label><div className="relative"><input id={`economics-${name}`} type="number" inputMode="numeric" min={0} step={step} value={value} onChange={(event) => onChange(name, Math.max(0, Number(event.currentTarget.value) || 0))} className="w-full rounded-xl border border-[#DDE5DA] bg-white py-3 pl-3.5 pr-14 text-sm font-semibold tabular-nums text-[#123C2F] outline-none transition focus:border-[#237A57] focus:ring-2 focus:ring-[#237A57]/15" /><span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-3 text-xs leading-5 text-[#5D6B62]">{unit}</span></div></div>;
}

function ResultCard({ label, value, explanation, accent = false }: { label: string; value: string; explanation: string; accent?: boolean }) {
  return <div className={`rounded-2xl border p-5 ${accent ? "border-[#123C2F] bg-[#123C2F] text-white" : "border-[#E2E8E1] bg-white text-[#123C2F]"}`}><p className={`text-xs font-medium ${accent ? "text-[#D2E0D5]" : "text-[#5D6B62]"}`}>{label}</p><p className={`mt-3 text-[28px] font-semibold tracking-tight tabular-nums ${accent ? "text-[#C7F36B]" : "text-[#123C2F]"}`}>{value}</p><p className={`mt-2 text-xs leading-5 ${accent ? "text-[#B9CCBF]" : "text-[#6A786E]"}`}>{explanation}</p></div>;
}

export default function EconomicsPage() {
  const [assumptions, setAssumptions] = useState<EconomicsAssumptions>({ ...DEFAULT_ECONOMICS });
  const result = useMemo(() => calculateEconomics(assumptions), [assumptions]);
  const update = (key: keyof EconomicsAssumptions, value: number) => setAssumptions((current) => ({ ...current, [key]: value }));
  const input = (label: string, name: keyof EconomicsAssumptions, unit = "₸", step = 1000) => <AssumptionInput key={name} label={label} name={name} value={assumptions[name]} unit={unit} step={step} onChange={update} />;
  const funnel = [{ label: "Контакты", value: assumptions.contacted, key: "contacted" as const }, { label: "Ответы", value: assumptions.responses, key: "responses" as const }, { label: "Демонстрации", value: assumptions.demonstrations, key: "demonstrations" as const }, { label: "Пилоты", value: assumptions.pilots, key: "pilots" as const }, { label: "Платящие точки", value: assumptions.annualTargetLocations, key: "annualTargetLocations" as const }];
  const maxFunnel = Math.max(...funnel.map((stage) => stage.value), 1);
  const costs = [{ label: "Инфраструктура", value: assumptions.hosting, color: "#123C2F" }, { label: "Прогнозирование", value: assumptions.computation, color: "#237A57" }, { label: "Поддержка", value: assumptions.support, color: "#79AA74" }, { label: "Прочее", value: assumptions.miscellaneous, color: "#C7F36B" }];
  const funnelWarning = funnel.some((stage, index) => index > 0 && stage.value > funnel[index - 1].value);

  return (
    <AppShell title="Юнит-экономика" description="Проверьте гипотезу бизнеса. Измените допущения — расчёты обновятся сразу.">
      <div className="mb-6 flex flex-col justify-between gap-3 rounded-2xl border border-[#DDE7CE] bg-[#EDF2E4] px-5 py-4 md:flex-row md:items-center"><div className="flex items-start gap-3"><Info size={18} className="mt-0.5 shrink-0 text-[#237A57]" /><div><p className="text-sm font-semibold text-[#123C2F]">Иллюстративная модель, а не результаты SAQTA</p><p className="mt-1 text-xs leading-5 text-[#5D6B62]">Все значения — редактируемые предположения для проверки на пилотах. Расчёт на одну точку в месяц.</p></div></div><button type="button" onClick={() => setAssumptions({ ...DEFAULT_ECONOMICS })} className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-[#D5DFCA] bg-white px-3 py-2 text-xs font-medium text-[#123C2F] transition hover:bg-[#F7F7F2]"><RotateCcw size={13} /> Сбросить допущения</button></div>

      <div aria-live="polite" aria-atomic="false" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ResultCard label="Выручка / точка / месяц" value={money(result.monthlyRevenue)} explanation="Стоимость месячной подписки" />
        <ResultCard label="Переменные расходы / месяц" value={money(result.variableCosts)} explanation="Сумма четырёх статей расходов" />
        <ResultCard label="Маржинальный доход / месяц" value={money(result.contributionMargin)} explanation="Выручка минус переменные расходы" accent />
        <ResultCard label="Маржинальность" value={result.contributionMarginPercent === null ? "—" : `${decimal(result.contributionMarginPercent)}%`} explanation="Маржинальный доход / выручка" />
      </div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[1.1fr_1fr]">
        <section className="rounded-2xl border border-[#E2E8E1] bg-white p-5 md:p-6">
          <div className="mb-6 flex items-center gap-2 text-[#123C2F]"><SlidersHorizontal size={18} /><h2 className="text-base font-semibold">Допущения модели</h2></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {input("Месячная подписка", "subscription")}
            {input("Стоимость привлечения · CAC", "cac")}
            {input("Средний срок жизни клиента", "lifetimeMonths", "мес.", 1)}
            {input("Целевая месячная выручка", "monthlyRevenueTarget")}
          </div>
          <div className="mt-6 border-t border-[#E7EBE3] pt-6"><h3 className="mb-4 text-sm font-semibold text-[#123C2F]">Переменные расходы на точку в месяц</h3><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{input("Хостинг и база данных", "hosting")}{input("Расчёты прогнозов", "computation")}{input("Поддержка клиента", "support")}{input("Резервные копии и прочее", "miscellaneous")}</div></div>
          <div className="mt-6 rounded-xl bg-[#F7F7F2] p-4"><div className="flex items-center justify-between text-xs"><span className="font-medium text-[#5D6B62]">Структура переменных расходов</span><span className="font-semibold text-[#123C2F]">{money(result.variableCosts)}</span></div><div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-[#E3E9DD]" role="img" aria-label={`Переменные расходы: ${money(result.variableCosts)}`}>{costs.map((cost) => <div key={cost.label} style={{ width: `${result.variableCosts > 0 ? cost.value / result.variableCosts * 100 : 0}%`, backgroundColor: cost.color }} />)}</div><div className="mt-3 grid grid-cols-2 gap-2">{costs.map((cost) => <div key={cost.label} className="flex items-center gap-1.5 text-xs text-[#5D6B62]"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cost.color }} />{cost.label}</div>)}</div></div>
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-[#E2E8E1] bg-white p-5 md:p-6">
            <div className="mb-5 flex items-center gap-2 text-[#123C2F]"><Calculator size={18} /><h2 className="text-base font-semibold">Экономика отношений с клиентом</h2></div>
            <dl className="divide-y divide-[#E8ECE5]">
              {[{ label: "CAC", value: money(assumptions.cac), note: "Затраты на привлечение одной точки" }, { label: "LTV", value: money(result.ltv), note: `Маржинальный доход × ${decimal(assumptions.lifetimeMonths)} мес.` }, { label: "LTV / CAC", value: result.ltvCac === null ? "Не определено" : `${decimal(result.ltvCac)}×`, note: "При CAC = 0 отношение не определено" }, { label: "Окупаемость CAC", value: result.paybackMonths === null ? "Не достигается" : `${decimal(result.paybackMonths)} мес.`, note: "CAC / месячный маржинальный доход" }].map((row) => <div key={row.label} className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"><dt><p className="text-sm font-medium text-[#123C2F]">{row.label}</p><p className="mt-1 text-xs leading-4 text-[#6A786E]">{row.note}</p></dt><dd className="shrink-0 text-lg font-semibold tabular-nums tracking-tight text-[#123C2F]">{row.value}</dd></div>)}
            </dl>
          </section>
          <section className="rounded-2xl border border-[#DDE7CE] bg-[#EDF2E4] p-5 md:p-6">
            <div className="flex items-center gap-2 text-[#237A57]"><Target size={18} /><h2 className="text-sm font-semibold">Точки для цели по выручке</h2></div><div className="mt-4 flex items-end gap-3"><p className="text-4xl font-semibold leading-none tabular-nums tracking-tight text-[#123C2F]">{result.customersForTarget === null ? "—" : decimal(result.customersForTarget)}</p><p className="pb-1 text-sm text-[#53664D]">платящих точек</p></div><p className="mt-3 text-xs leading-6 text-[#5D6B62]">Для {money(assumptions.monthlyRevenueTarget)} в месяц при подписке {money(assumptions.subscription)}. Округление вверх.</p>
          </section>
        </div>
      </div>

      {result.contributionMargin <= 0 && <p role="status" className="mt-5 rounded-xl border border-[#E9D8B8] bg-[#FCF4E6] p-4 text-sm leading-6 text-[#815C24]">Переменные расходы равны выручке или превышают её. В текущем сценарии CAC не окупается из маржинального дохода.</p>}

      <section className="mt-6 rounded-2xl border border-[#E2E8E1] bg-white p-5 md:p-6">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start"><div><h2 className="text-base font-semibold text-[#123C2F]">Иллюстративная воронка первого года</h2><p className="mt-2 text-xs leading-6 text-[#5D6B62]">Цели для проверки каналов привлечения. Это не фактические контакты, пилоты или клиенты.</p></div><span className="self-start rounded-full bg-[#EFF3E9] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#5A734A]">Гипотеза</span></div>
        <div className="mt-7 grid gap-4 sm:grid-cols-5">{funnel.map((stage, index) => <div key={stage.key} className="relative"><label htmlFor={`funnel-${stage.key}`} className="mb-2 block text-xs font-medium text-[#5D6B62]">{stage.label}</label><input id={`funnel-${stage.key}`} min={0} step={1} type="number" inputMode="numeric" value={stage.value} onChange={(event) => update(stage.key, Math.max(0, Math.round(Number(event.currentTarget.value) || 0)))} className="w-full rounded-xl border border-[#DDE5DA] bg-[#F7F7F2] px-3 py-3 text-2xl font-semibold tabular-nums text-[#123C2F] outline-none focus:border-[#237A57] focus:ring-2 focus:ring-[#237A57]/15" /><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#EEF1E8]"><div className="h-full rounded-full" style={{ width: `${stage.value / maxFunnel * 100}%`, backgroundColor: index === funnel.length - 1 ? "#237A57" : "#A0BD8B" }} /></div><p className="mt-2 min-h-4 text-xs text-[#6A786E]">{index > 0 && funnel[index - 1].value > 0 ? `${decimal(stage.value / funnel[index - 1].value * 100)}% от предыдущего этапа` : index === 0 ? "Исходная целевая аудитория" : "Нет базы для конверсии"}</p></div>)}</div>
        {funnelWarning && <p role="status" className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#97651D]"><CircleHelp size={15} className="shrink-0" /> На одном из этапов значение больше предыдущего. Проверьте, соответствует ли это вашей гипотезе воронки.</p>}
        <div className="mt-7 grid gap-6 rounded-xl bg-[#F7F7F2] p-5 md:grid-cols-[1fr_1.3fr]"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7EDD9] text-[#237A57]"><Wallet size={20} /></span><div><p className="text-xs font-medium text-[#5D6B62]">ARR при достижении цели</p><p className="mt-1 text-2xl font-semibold tracking-tight text-[#123C2F]">{money(result.annualRecurringRevenue)}</p><p className="mt-1 text-xs text-[#6A786E]">{assumptions.annualTargetLocations} точек × {money(assumptions.subscription)} × 12</p></div></div><p className="self-center text-xs leading-6 text-[#5D6B62]">Это годовая регулярная выручка при непрерывной оплате всеми целевыми точками 12 месяцев. Фактическая выручка первого года может быть ниже, если клиенты подключаются постепенно.</p></div>
      </section>

      <section className="mt-6 rounded-2xl border border-[#E2E8E1] bg-white p-5 md:p-6"><h2 className="flex items-center gap-2 text-sm font-semibold text-[#123C2F]"><CircleHelp size={17} /> Как читать эту модель</h2><div className="mt-4 grid gap-4 text-xs leading-6 text-[#5D6B62] md:grid-cols-2"><p>Маржинальный доход — выручка за вычетом переменных расходов. Он покрывает постоянные расходы компании. Он не является чистой прибылью.</p><p>Модель исключает постоянные расходы компании, налоги и затраты на разработку. Для оценки итоговой прибыли их нужно учитывать отдельно.</p><p>LTV = маржинальный доход за месяц × ожидаемый срок жизни клиента. Модель не учитывает дисконтирование, изменение тарифа и изменение себестоимости.</p><p>Окупаемость CAC рассчитывается только при положительном маржинальном доходе. При нулевом CAC показатель LTV/CAC математически не определён.</p></div></section>
    </AppShell>
  );
}
