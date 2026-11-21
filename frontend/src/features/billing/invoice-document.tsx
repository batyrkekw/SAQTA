"use client";

import { useI18n } from "@/components/language-provider";
import { Loading, Notice } from "@/components/ui";
import { useApi } from "@/lib/api";
import { type Invoice, kztDate, statusLabel } from "@/lib/billing";
import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

const tenge = (value: number) => `${value.toLocaleString("ru-RU")},00`;

function Row({ label, value }: { label: string; value: string }) {
  return <tr><th className="w-48 py-1 pr-4 text-left align-top font-normal text-[#5D6B62]">{label}</th><td className="py-1 font-medium text-[#123C2F]">{value || "—"}</td></tr>;
}

export function InvoiceDocument() {
  const { t } = useI18n();
  const { number } = useParams<{ number: string }>();
  const invoice = useApi<Invoice>(number ? `/billing/invoices/${encodeURIComponent(number)}` : null);
  if (invoice.loading && !invoice.data) return <Loading label={t("Загружаем счёт…")} />;
  if (!invoice.data) return <Notice kind="error">{t(invoice.status === 401 ? "Войдите в организацию, чтобы открыть счёт." : invoice.error || "Счёт не найден.")}</Notice>;
  const row = invoice.data, seller = row.seller!;
  const service = `Подписка ${row.title}`;
  return <div className="mx-auto max-w-3xl">
    <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
      <Link href="/billing" className="inline-flex items-center gap-2 text-xs font-semibold text-[#237A57]"><ArrowLeft size={14} />{t("К тарифу и счетам")}</Link>
      <button className="btn-primary" onClick={() => window.print()}><Printer size={15} />{t("Распечатать или сохранить PDF")}</button>
    </div>
    {row.status !== "pending" && <div className="no-print mb-4"><Notice kind={row.status === "paid" ? "success" : "info"}>{t(`Статус счёта: ${statusLabel[row.status]}${row.status === "paid" && row.period_end ? `. Тариф активен до ${kztDate(row.period_end)}.` : "."}`)}</Notice></div>}
    {row.status === "pending" && <div className="no-print mb-4"><Notice>{t("Оплатите по реквизитам ниже или через Kaspi на счёт продавца. В назначении платежа укажите номер счёта. Тариф включится после поступления денег, мы пришлём письмо.")}</Notice></div>}
    <article className="print-area rounded-2xl border border-[#E2E8DB] bg-white p-8 text-xs leading-relaxed text-[#123C2F]" aria-label={`Счёт ${row.number}`}>
      <table className="w-full"><tbody>
        <Row label="Бенефициар" value={seller.name} />
        <Row label="БИН / ИИН" value={seller.bin} />
        <Row label="ИИК (IBAN)" value={seller.iban} />
        <Row label="Банк бенефициара" value={seller.bank} />
        <Row label="БИК" value={seller.bik} />
        <Row label="Кбе" value={seller.kbe} />
      </tbody></table>
      <h1 className="mt-8 border-b-2 border-[#123C2F] pb-2 text-xl font-semibold">Счёт на оплату № {row.number} от {kztDate(row.created_at)}</h1>
      <table className="mt-4 w-full"><tbody>
        <Row label="Поставщик" value={[seller.name, seller.bin && `БИН/ИИН ${seller.bin}`, seller.address].filter(Boolean).join(", ")} />
        <Row label="Покупатель" value={[row.payer_name, row.payer_bin && `БИН/ИИН ${row.payer_bin}`].filter(Boolean).join(", ")} />
        <Row label="Основание" value="Публичная оферта SaqtaFood, опубликованная на сайте сервиса" />
      </tbody></table>
      <table className="mt-6 w-full border-collapse text-left">
        <thead><tr className="border-y border-[#123C2F]"><th className="py-2">№</th><th className="py-2">Наименование</th><th className="py-2 text-right">Кол-во</th><th className="py-2">Ед.</th><th className="py-2 text-right">Цена, ₸</th><th className="py-2 text-right">Сумма, ₸</th></tr></thead>
        <tbody><tr className="border-b border-[#E2E8DB]"><td className="py-2">1</td><td className="py-2">{service}</td><td className="py-2 text-right">1</td><td className="py-2">усл.</td><td className="py-2 text-right">{tenge(row.amount_kzt)}</td><td className="py-2 text-right">{tenge(row.amount_kzt)}</td></tr></tbody>
      </table>
      <div className="mt-4 ml-auto w-64 space-y-1 text-right"><p className="text-base font-semibold">Итого: {tenge(row.amount_kzt)} ₸</p><p>{seller.vat_payer ? "Сумма включает НДС по ставке, установленной Налоговым кодексом РК" : "Без НДС"}</p></div>
      <p className="mt-6">Всего наименований 1, на сумму {tenge(row.amount_kzt)} KZT.</p>
      <p className="mt-2">Назначение платежа: оплата по счёту № {row.number}, {service}</p>
      <p className="mt-2">Оплатить до {kztDate(row.due_at)}. Доступ к сервису предоставляется после поступления оплаты на счёт поставщика.</p>
      <div className="mt-10 flex justify-between gap-6 border-t border-[#E2E8DB] pt-6"><span>Исполнитель ____________________ / {seller.name || "—"}</span><span>{seller.email}{seller.phone ? `, ${seller.phone}` : ""}</span></div>
    </article>
  </div>;
}
