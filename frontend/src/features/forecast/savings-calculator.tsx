"use client";

import { validationMessage } from "@/lib/validation";

import { useI18n } from "@/components/language-provider";

import { Card,Field,Metric,Notice } from "@/components/ui";
import { Calculator,CircleDollarSign,Package,TrendingDown } from "lucide-react";
import { useForm,useWatch } from "react-hook-form";
import { PRICING } from "./pricing.config";
import { calculateSavings,defaultSavings,savingsSchema,type SavingsInput } from "./savings";

export default function SavingsCalculator() {
  const { t, money, number } = useI18n();

  const { register, control, setValue } = useForm<SavingsInput>({ defaultValues: defaultSavings });
  const values = useWatch({ control });
  const parsed = savingsSchema.safeParse(values, { error: validationMessage });
  const result = parsed.success ? calculateSavings(parsed.data) : null;
  const errorFor = (field: keyof SavingsInput) => parsed.success ? undefined : parsed.error.issues.find(issue => issue.path[0] === field)?.message;
  return <div className="space-y-5"><div><h2 className="text-2xl font-semibold tracking-tight text-[#123C2F]">{t("Что может измениться в вашей пекарне")}</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#5D6B62]">{t("Сравните себестоимость списаний со стоимостью подписки. Процент сокращения задаёте вы; расчёт не доказывает будущую экономию SAQTA.")}</p></div>
    <Notice>{t("Ручной сценарий, все исходные значения — примерные предположения. Для сопоставимости используйте один месяц, один продукт и одну партию без начального запаса. Ответы анкеты и синтетические данные не подставляются как реальные результаты.")}</Notice>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(280px,1fr)_minmax(0,1.4fr)]"><Card title={t("Ваши исходные значения")} subtitle={t("За один расчётный месяц · количества в единицах")} action={<Calculator size={18} className="text-[#237A57]" />}><form onSubmit={event => event.preventDefault()}><div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("Произведено, ед.")} error={t(errorFor("produced"))}><input className="field" type="number" min="0" {...register("produced", { valueAsNumber: true })} /></Field>
      <Field label={t("Продано, ед.")} error={t(errorFor("sold"))}><input className="field" type="number" min="0" {...register("sold", { valueAsNumber: true })} /></Field>
      <Field label={t("Списано, ед.")} error={t(errorFor("writtenOff"))}><input className="field" type="number" min="0" {...register("writtenOff", { valueAsNumber: true })} /></Field>
      <Field label={t("Себестоимость единицы, ₸")} error={t(errorFor("unitCostKzt"))}><input className="field" type="number" min="0" {...register("unitCostKzt", { valueAsNumber: true })} /></Field>
      <Field label={t("Цена продажи единицы, ₸")} error={t(errorFor("salePriceKzt"))}><input className="field" type="number" min="0" {...register("salePriceKzt", { valueAsNumber: true })} /></Field>
      <Field label={t("Подписка за месяц, ₸")} error={t(errorFor("subscriptionKzt"))}><input className="field" type="number" min="0" {...register("subscriptionKzt", { valueAsNumber: true })} /></Field>
      <div className="sm:col-span-2"><Field label={t("Подставить предварительную цену тарифа")}><select className="field" defaultValue="" onChange={event => { if (event.target.value !== "") setValue("subscriptionKzt", Number(event.target.value)); }}><option value="">{t("Ввести стоимость вручную")}</option>{PRICING.plans.map(plan => <option key={plan.id} value={plan.monthlyKzt}>{t(plan.name)} · {t(money(plan.monthlyKzt))} {t(" / месяц")}</option>)}</select></Field></div>
      <div className="sm:col-span-2"><Field label={t("Сценарий сокращения списаний, %")} error={t(errorFor("reductionPercent"))} hint={t("По умолчанию 0%. Выберите собственное предположение от 0 до 100%; измеренного эффекта SAQTA пока нет.")}><input className="field" type="number" min="0" max="100" step="0.1" {...register("reductionPercent", { valueAsNumber: true })} /></Field></div>
    </div></form></Card><div className="space-y-5" aria-live="polite">{result && parsed.success ? <><div className="grid grid-cols-2 gap-3"><Metric label={t("Себестоимость списаний")} value={money(result.writeOffLossKzt)} note={t("Списано × себестоимость")} icon={<Package size={16} />} /><Metric label={t("Сценарная экономия затрат")} value={money(result.avoidedCostKzt)} note={t(`При снижении на ${number(parsed.data.reductionPercent, 1)}%`)} icon={<TrendingDown size={16} />} /><div className="col-span-2"><Metric label={t("Эффект после стоимости подписки")} value={money(result.effectAfterSubscriptionKzt)} note={t("Сэкономленные затраты − подписка; не чистая прибыль")} icon={<CircleDollarSign size={16} />} accent /></div></div>
    <Card title={t("Прозрачное сравнение")}><div className="overflow-x-auto"><table className="text-xs"><thead><tr><th>{t("Показатель")}</th><th>{t("Исходно")}</th><th>{t("По сценарию")}</th></tr></thead><tbody><tr><td>{t("Объём списаний, ед.")}</td><td>{t(number(parsed.data.writtenOff))}</td><td>{t(number(parsed.data.writtenOff - result.scenarioAvoidedUnits, 1))}</td></tr><tr><td>{t("Потери по себестоимости")}</td><td>{t(money(result.writeOffLossKzt))}</td><td>{t(money(result.scenarioWriteOffLossKzt))}</td></tr><tr><td>{t("Подписка")}</td><td>—</td><td>{t(money(parsed.data.subscriptionKzt))}</td></tr></tbody></table></div><p className="mt-4 text-xs leading-relaxed text-[#5D6B62]">{t("Формула: ")}{t(money(result.writeOffLossKzt))} × {t(number(parsed.data.reductionPercent, 1))}% − {t(money(parsed.data.subscriptionKzt))} = {t(money(result.effectAfterSubscriptionKzt))}{t(". Уменьшение списаний предполагает предотвращение лишнего производства; если продукт уже произведён, его себестоимость уже понесена.")}</p></Card>
    <Card title={t("Выручка и валовая прибыль — отдельно")}><dl className="space-y-3 text-xs"><div className="flex justify-between gap-3"><dt className="text-[#5D6B62]">{t("Выручка от указанных продаж")}</dt><dd className="font-semibold text-[#123C2F]">{t(money(result.salesRevenueKzt))}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#5D6B62]">{t("Себестоимость проданных единиц")}</dt><dd>{t(money(result.soldGoodsCostKzt))}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#5D6B62]">{t("Валовая прибыль проданных единиц")}</dt><dd className="font-semibold">{t(money(result.salesGrossProfitKzt))}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#5D6B62]">{t("Остаток партии")}</dt><dd>{t(number(result.remainingUnits))} {t(" ед.")}</dd></div></dl><p className="mt-4 text-xs leading-relaxed text-[#5D6B62]">{t("Валовая прибыль здесь = выручка − себестоимость проданного; списания учтены выше отдельно. Эти суммы не прибавляются к сценарию экономии. Постоянные расходы, налоги и внедрение в модель не включены.")}</p></Card></> : <Card><Notice kind="error">{t("Проверьте исходные значения: ")}{t(parsed.success ? "" : parsed.error.issues.map(issue => issue.message).join(" "))}</Notice></Card>}</div></div>
  </div>;
}
