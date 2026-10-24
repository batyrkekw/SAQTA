import type { Order } from "@/types/api";

export const tiynMoney = (value: number) => new Intl.NumberFormat("ru-KZ", { minimumFractionDigits: value % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(value / 100) + " ₸";

export function SaveSettlement({ order }: { order: Order }) {
  const settlement = order.settlement;
  if (!settlement) return <p className="mt-4 text-xs text-[#60715F]">Расчёт комиссии пока недоступен. Обновите заказ.</p>;
  const completed = order.status === "collected";
  return <section aria-label={`Расчёт продажи заказа ${order.id}`} className="mt-4 rounded-xl border border-[#E1E7DC] bg-[#F7F9F2] p-4">
    <dl className="grid gap-3 text-xs sm:grid-cols-3">
      <div><dt className="text-[#60715F]">{completed ? "Завершённая продажа по скидке" : "Завершённые продажи"}</dt><dd className="mt-1 font-semibold text-[#123C2F]">{tiynMoney(settlement.completed_sale_tiyn)}</dd></div>
      <div><dt className="text-[#60715F]">Комиссия SAQTA · 5%</dt><dd className="mt-1 font-semibold text-[#123C2F]">{tiynMoney(settlement.commission_tiyn)}</dd></div>
      <div><dt className="text-[#60715F]">Расчётная сумма продавцу</dt><dd className="mt-1 font-semibold text-[#123C2F]">{tiynMoney(settlement.seller_proceeds_tiyn)}</dd></div>
    </dl>
    {order.status === "reserved" && <p className="mt-3 text-xs leading-6 text-[#60715F]">Сейчас комиссия не начислена. При подтверждении выдачи она составит {tiynMoney(settlement.estimated_commission_tiyn)} от скидочной суммы заказа.</p>}
    {order.status === "cancelled" && <p className="mt-3 text-xs text-[#60715F]">Заказ отменён. Комиссия не начисляется.</p>}
    {settlement.status === "historical_estimate" && <p className="mt-3 text-xs leading-6 text-[#60715F]">Архивный заказ: оценка по новой модели 5%, без создания исторического начисления.</p>}
    <p className="mt-3 text-xs leading-6 text-[#60715F]">Размещение бесплатно. Это расчёт по бизнес-модели: платёжная система не подключена, деньги не списаны и не перечислены.</p>
  </section>;
}
