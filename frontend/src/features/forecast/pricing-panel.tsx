"use client";

import { useI18n } from "@/components/language-provider";

import { Card,Notice } from "@/components/ui";
import BillingPanel from "@/features/billing/billing-panel";
import { ArrowRight,HeartHandshake } from "lucide-react";
import Link from "next/link";
import { PRICING } from "./pricing.config";

export default function PricingPanel() {
  const { t, money, number } = useI18n();

  return <div className="space-y-6"><BillingPanel />
    <Notice>{t("Сервер проверяет организацию, статус подписки и месячные лимиты запусков. Free не открывает прогнозирование. Публичное DEMO даёт доступ только к синтетическим данным. Тариф не гарантирует точность прогноза или экономию.")}</Notice>
    <Card title={t("Сравнение тарифов")} subtitle={t("Один запуск — один анализ всего доступного ассортимента, горизонт 1–14 дней")}><div className="overflow-x-auto"><table className="min-w-[520px] text-xs"><thead><tr><th>{t("Возможности")}</th>{PRICING.plans.map(plan => <th key={plan.id}>{t(plan.name)}</th>)}</tr></thead><tbody><tr><td>{t("Цена в месяц")}</td>{PRICING.plans.map(plan => <td key={plan.id}>{t(money(plan.monthlyKzt))}</td>)}</tr><tr><td>{t("Продукты")}</td>{PRICING.plans.map(plan => <td key={plan.id}>{t("До ")}{t(plan.productLimit)}</td>)}</tr><tr><td>{t("Запуски анализа / месяц")}</td>{PRICING.plans.map(plan => <td key={plan.id}>{t("До ")}{t(number(plan.forecastLimit))}</td>)}</tr><tr><td>{t("Точки")}</td>{PRICING.plans.map(plan => <td key={plan.id}>{t(plan.locationLimit === null ? "Несколько настроенных" : plan.locationLimit)}</td>)}</tr><tr><td>{t("SaqtaFood Save: размещение")}</td>{PRICING.plans.map(plan => <td key={plan.id}>{t("Бесплатно · 0 ₸")}</td>)}</tr><tr><td>{t("Комиссия за публикацию Save")}</td>{PRICING.plans.map(plan => <td key={plan.id}>0%</td>)}</tr><tr><td>{t("Комиссия с завершённой продажи Save")}</td>{PRICING.plans.map(plan => <td key={plan.id}>{t("5% от скидочной суммы")}</td>)}</tr></tbody></table></div></Card>
    <div className="flex items-start gap-4 rounded-2xl bg-[#EAF1DC] p-6"><HeartHandshake size={28} className="shrink-0 text-[#237A57]" /><div><h3 className="text-base font-semibold text-[#123C2F]">{t("Сохранять ценность еды можно бесплатно")}</h3><p className="mt-2 text-xs leading-relaxed text-[#5D6B62]">{t("Для размещения остатков в SaqtaFood Save не требуется платный тариф Forecast. Комиссии за публикацию нет. Комиссия бизнес-модели — 5% от фактической суммы завершённой продажи по скидочной цене. Резерв и отмена не создают комиссию. Оплата за выкупленные продукты происходит при получении в пекарне.")}</p><Link href="/save" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#237A57]">{t("Открыть SaqtaFood Save")}<ArrowRight size={14} /></Link></div></div>
  </div>;
}
