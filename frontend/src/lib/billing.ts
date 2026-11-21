"use client";

export type BillingPlan = { id: "business"; title: string; per_location_kzt: number; max_locations: number; periods: { months: 1 | 3 | 12; multiplier: number }[] };
export type Seller = { name: string; bin: string; address: string; iban: string; bank: string; bik: string; kbe: string; email: string; phone: string; vat_payer: boolean };
export type BillingPlans = { currency: "KZT"; trial_days: number; plan: BillingPlan; methods: { card: boolean; transfer: boolean; test_mode: boolean; simulator: boolean }; seller: Seller };
export type Invoice = {
  number: string; title: string; plan: "business" | "starter" | "pro"; months: number; locations: number; amount_kzt: number; method: "card" | "transfer";
  status: "pending" | "paid" | "cancelled" | "failed"; auto_renew: boolean; payer_name: string; payer_bin: string; payer_email: string;
  payment_reference: string; failure_reason: string; created_at: string | null; due_at: string | null; paid_at: string | null;
  period_start: string | null; period_end: string | null; seller?: Seller;
};
export type WidgetLaunch = { intent: Record<string, unknown>; simulator: boolean; test_mode: boolean };
export type CheckoutResult = { invoice: Invoice; widget?: WidgetLaunch };
export type WidgetResult = { type: "payment" | "error" | "cancel"; status?: "success" | "fail" | "cancel"; message?: string };

type TipTopWidget = { start: (intent: Record<string, unknown>) => Promise<WidgetResult>; oncomplete?: (result: WidgetResult) => void };
declare global { interface Window { tiptop?: { Widget: new () => TipTopWidget } } }

export const WIDGET_SRC = "https://widget.tiptoppay.kz/bundles/widget.js";
let loading: Promise<void> | null = null;

export function loadTipTopWidget(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Оплата доступна только в браузере."));
  if (window.tiptop?.Widget) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = WIDGET_SRC;
    script.async = true;
    script.onload = () => window.tiptop?.Widget ? resolve() : reject(new Error("Платёжная форма не загрузилась."));
    script.onerror = () => { loading = null; reject(new Error("Не удалось загрузить платёжную форму TipTop Pay. Проверьте подключение и повторите.")); };
    document.head.appendChild(script);
  });
  return loading;
}

/** Opens the TipTop Pay widget. The server, not this result, activates the plan (Pay notification). */
export async function payByCard(intent: Record<string, unknown>): Promise<WidgetResult> {
  await loadTipTopWidget();
  const widget = new window.tiptop!.Widget();
  return widget.start(intent);
}

export const planName = (plan: string) => plan === "business" ? "Business" : plan === "pro" ? "Pro" : plan === "starter" ? "Starter" : "Free";
export function pointsWord(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return "точка";
  if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) return "точки";
  return "точек";
}
export const statusLabel: Record<Invoice["status"], string> = { pending: "Ожидает оплаты", paid: "Оплачен", cancelled: "Отменён", failed: "Ошибка оплаты" };
export const methodLabel: Record<Invoice["method"], string> = { card: "Карта", transfer: "Счёт на оплату" };
export const kztDate = (value: string | null) => value ? new Date(value).toLocaleDateString("ru-RU", { timeZone: "Asia/Qyzylorda" }) : "—";
