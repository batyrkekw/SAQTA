import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SaveSettlement, tiynMoney } from "@/features/save/settlement";
import type { Order } from "@/types/api";

const order: Order = { id: 42, customer_name: "Демо", status: "collected", total_kzt: 2000, created_at: "2026-10-24T10:00:00Z", items: [], settlement: { currency: "KZT", minor_units_per_kzt: 100, rate_percent: 5, status: "recorded", discounted_order_total_tiyn: 200000, completed_sale_tiyn: 200000, commission_tiyn: 10000, seller_proceeds_tiyn: 190000, estimated_commission_tiyn: 0, publication_fee_tiyn: 0, payments_processed: false, recorded_at: "2026-10-24T10:00:00Z", methodology: "5%" } };

describe("Save commission display", () => {
  it("separates completed discounted sale, 5% commission and seller proceeds", () => {
    render(<SaveSettlement order={order}/>);
    expect(screen.getByText(/Завершённая продажа по скидке/)).toBeInTheDocument();
    expect(screen.getByText(/^2\s000 ₸$/)).toBeInTheDocument();
    expect(screen.getByText("100 ₸")).toBeInTheDocument();
    expect(screen.getByText(/^1\s900 ₸$/)).toBeInTheDocument();
    expect(screen.getByText(/деньги не списаны и не перечислены/)).toBeInTheDocument();
  });
  it("keeps tiyn rather than rounding away a small sale", () => {
    expect(tiynMoney(5)).toContain("0,05");
    expect(tiynMoney(95)).toContain("0,95");
  });
  it("does not call a reservation a completed sale or accrued fee", () => {
    render(<SaveSettlement order={{...order, status: "reserved", settlement: {...order.settlement!, status: "not_due", completed_sale_tiyn: 0, commission_tiyn: 0, seller_proceeds_tiyn: 0, estimated_commission_tiyn: 10000, recorded_at: null}}}/>);
    expect(screen.getByText(/Сейчас комиссия не начислена/)).toHaveTextContent("100 ₸");
    expect(screen.queryByText("Завершённая продажа по скидке")).not.toBeInTheDocument();
  });
  it("shows cancellation and zero due", () => {
    render(<SaveSettlement order={{...order, status: "cancelled", settlement: {...order.settlement!, status: "not_due", completed_sale_tiyn: 0, commission_tiyn: 0, seller_proceeds_tiyn: 0, recorded_at: null}}}/>);
    expect(screen.getByText("Заказ отменён. Комиссия не начисляется.")).toBeInTheDocument();
    expect(screen.getAllByText("0 ₸")).toHaveLength(3);
  });
  it("labels an old estimate without inventing a historical accrual", () => {
    render(<SaveSettlement order={{...order, settlement: {...order.settlement!, status: "historical_estimate", recorded_at: null}}}/>);
    expect(screen.getByText(/без создания исторического начисления/)).toBeInTheDocument();
  });
  it("does not fabricate a settlement on an old API response", () => {
    render(<SaveSettlement order={{...order, settlement: undefined}}/>);
    expect(screen.getByText(/Расчёт комиссии пока недоступен/)).toBeInTheDocument();
    expect(screen.queryByText("Комиссия SAQTA · 5%")).not.toBeInTheDocument();
  });
});
