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
    <Notice>{t("Сервер проверяет организацию, оплаченные точки и месячные лимиты запусков. Публичное DEMO даёт доступ только к синтетическим данным. Тариф не гарантирует точность прогноза или экономию.")}</Notice>
    <Card title={t("Что входит")} subtitle={t("Один запуск — один анализ всего доступного ассортимента, горизонт 1–14 дней")}><div className="overflow-x-auto"><table className="min-w-[520px] text-xs"><thead><tr><th>{t("Возможности")}</th><th>{t("Покупатель")}</th><th>{t("Пекарня, Business")}</th></tr></thead><tbody>
      <tr><td>{t("Цена")}</td><td>{t("Бесплатно")}</td><td>{t(`${money(PRICING.perLocationKzt)} в месяц за точку`)}</td></tr>
      <tr><td>{t("Пробный период")}</td><td>—</td><td>{t(`${PRICING.trialDays} дней, до ${PRICING.trialLocations} точек, без карты`)}</td></tr>
      <tr><td>{t("Продукты")}</td><td>—</td><td>{t(`До ${PRICING.perLocation.products} на каждую точку`)}</td></tr>
      <tr><td>{t("Запуски анализа / месяц")}</td><td>—</td><td>{t(`До ${number(PRICING.perLocation.forecastRuns)} на каждую точку`)}</td></tr>
      <tr><td>{t("SaqtaFood Save")}</td><td>{t("Поиск и бронирование")}</td><td>{t("Размещение бесплатно, 5% с завершённой продажи")}</td></tr>
    </tbody></table></div></Card>
    <div className="flex items-start gap-4 rounded-2xl bg-[#EAF1DC] p-6"><HeartHandshake size={28} className="shrink-0 text-[#237A57]" /><div><h3 className="text-base font-semibold text-[#123C2F]">{t("Сохранять ценность еды можно бесплатно")}</h3><p className="mt-2 text-xs leading-relaxed text-[#5D6B62]">{t("Для размещения остатков в SaqtaFood Save не требуется платный тариф Forecast. Комиссии за публикацию нет. Комиссия бизнес-модели — 5% от фактической суммы завершённой продажи по скидочной цене. Резерв и отмена не создают комиссию. Оплата за выкупленные продукты происходит при получении в пекарне.")}</p><Link href="/save" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#237A57]">{t("Открыть SaqtaFood Save")}<ArrowRight size={14} /></Link></div></div>
  </div>;
}
