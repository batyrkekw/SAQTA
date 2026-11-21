import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), useParams: () => ({ number: "SF-2026-00007" }), useSearchParams: () => new URLSearchParams("token=reset-token-from-email-1234"), usePathname: () => "/forecast" }));

import PricingPanel from "../src/features/forecast/pricing-panel";
import { PRICING } from "../src/features/forecast/pricing.config";
import { ForecastAccessProvider } from "../src/features/forecast/access-panel";
import { AccountProvider } from "../src/features/account/account";
import { InvoiceDocument } from "../src/features/billing/invoice-document";
import { ResetPassword } from "../src/features/account/reset-password";

const seller = { name: "ИП Тестовая", bin: "990101300123", address: "Астана", iban: "KZ00TEST", bank: "АО Банк", bik: "TESTKZKA", kbe: "19", email: "pay@saqta.test", phone: "", vat_payer: false };
const plans = (methods = { card: true, transfer: true, test_mode: true, simulator: false }) => ({
  currency: "KZT", trial_days: 14, methods, seller,
  plan: { id: "business", title: "SaqtaFood Business", per_location_kzt: 15000, max_locations: 50, periods: [{ months: 1, multiplier: 1 }, { months: 3, multiplier: 3 }, { months: 12, multiplier: 10 }] },
});
const trial = { plan: "business", status: "active", active: true, is_trial: true, auto_renew: false, access_mode: "paid", expires_at: "2026-12-05T10:00:00Z", limits: { products: 300, forecast_runs_per_month: 1500, locations: 3 }, usage: { period: "2026-11", forecast_runs: 0, remaining: 1500 }, manual_activation: false, message: "Пробный период до 05.12.2026." };
let places = [{ id: 1, name: "Центр", address: "Абая 1", city: "Астана" }];
const invoice = (over = {}) => ({ number: "SF-2026-00007", title: "SaqtaFood Business, 2 точки, 12 мес.", plan: "business", months: 12, locations: 2, amount_kzt: 300000, method: "transfer", status: "pending", auto_renew: false, payer_name: "ТОО Хлеб", payer_bin: "123456789012", payer_email: "owner@example.test", payment_reference: "", failure_reason: "", created_at: "2026-11-21T10:00:00Z", due_at: "2026-11-26T10:00:00Z", paid_at: null, period_start: null, period_end: null, seller, ...over });

type Handler = (path: string, init?: RequestInit) => Response | undefined;
function stub(signedIn: boolean, extra: Handler = () => undefined, methods?: Parameters<typeof plans>[0]) {
  const calls: { path: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null });
    const custom = extra(path, init); if (custom) return custom;
    if (path === "/api/billing/plans") return new Response(JSON.stringify(plans(methods)));
    if (path === "/api/health") return new Response(JSON.stringify({ status: "ok", workspace_mode: "real", demo_data: false }));
    if (path === "/api/subscription") return signedIn ? new Response(JSON.stringify(trial)) : new Response(JSON.stringify({ detail: "Войдите" }), { status: 401 });
    if (path === "/api/locations") return new Response(JSON.stringify(places));
    if (path === "/api/billing/invoices") return new Response(JSON.stringify({ invoices: [] }));
    if (path === "/api/auth/me") return new Response(JSON.stringify({ user: { id: 1, email: "owner@example.test", role: "business", requested_role: "business" }, organization: { id: 1, name: "Пекарня Тест" } }));
    throw new Error(`Unexpected endpoint ${path}`);
  }));
  return calls;
}
const panel = () => render(<AccountProvider><ForecastAccessProvider><PricingPanel /></ForecastAccessProvider></AccountProvider>);

beforeEach(() => { places = [{ id: 1, name: "Центр", address: "Абая 1", city: "Астана" }]; window.sessionStorage.setItem(`saqta.session.v1:http://127.0.0.1:8000/api`, "session-token"); push.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); window.sessionStorage.clear(); delete (window as { tiptop?: unknown }).tiptop; });

describe("Forecast pricing and payment", () => {
  it("keeps one price configuration, Save free and payments connected", async () => {
    expect([PRICING.planName, PRICING.perLocationKzt, PRICING.trialDays, PRICING.trialLocations, PRICING.perLocation]).toEqual(["Business", 15000, 14, 3, { products: 100, forecastRuns: 500 }]);
    expect(PRICING.saveSalesCommissionPercent).toBe(5);
    expect(PRICING.paymentsConnected).toBe(true);
    stub(true);
    panel();
    expect(await screen.findByRole("heading", { name: "Тариф и оплата" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Открыть SaqtaFood Save/ })).toHaveAttribute("href", "/save");
    expect(await screen.findByText(/^Пробный период до \d/, { selector: "p.text-base" })).toBeInTheDocument();
    expect(screen.getAllByText("ПРОБНЫЙ").length).toBeGreaterThan(0);
  });

  it("prices per location and period and asks guests to sign in", async () => {
    stub(false);
    const user = userEvent.setup();
    panel();
    await screen.findByRole("heading", { name: "Тариф и оплата" });
    expect(screen.getByText(/Войдите в организацию или создайте её выше/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Оплатить/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Убрать точку" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Добавить точку" }));
    await user.click(screen.getByRole("button", { name: "Добавить точку" }));
    await user.click(screen.getByRole("radio", { name: /12 месяцев/ }));
    expect(screen.getByText("Business, 3 точки, 12 мес.")).toBeInTheDocument();
    expect(screen.getByText(/выгода 90\s000/)).toBeInTheDocument();
  });

  it("never lets a business pay for fewer locations than it has", async () => {
    places = [1, 2, 3, 4].map(id => ({ id, name: `Точка ${id}`, address: "Абая 1", city: "Астана" }));
    stub(true);
    panel();
    expect(await screen.findByText(/Сейчас у вас 4 точки/)).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(4);
    expect(screen.getByRole("button", { name: "Убрать точку" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Оплатить 60/ })).toBeInTheDocument();
  });

  it("issues a transfer invoice with payer details and opens it", async () => {
    const calls = stub(true, path => path === "/api/billing/checkout" ? new Response(JSON.stringify({ invoice: invoice() }), { status: 201 }) : undefined);
    const user = userEvent.setup();
    panel();
    await user.click(await screen.findByRole("radio", { name: /Счёт на оплату/ }));
    await user.click(screen.getByRole("button", { name: "Добавить точку" }));
    await user.click(screen.getByRole("radio", { name: /12 месяцев/ }));
    const name = screen.getByRole("textbox", { name: /Плательщик/ });
    await waitFor(() => expect(name).toHaveValue("Пекарня Тест"));
    await user.clear(name); await user.type(name, "ТОО Хлеб");
    await user.type(screen.getByRole("textbox", { name: /БИН/ }), "123456789012");
    await user.click(screen.getByRole("button", { name: "Выставить счёт" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/billing/invoice/SF-2026-00007"));
    expect(calls.find(call => call.path === "/api/billing/checkout")?.body).toEqual({ months: 12, locations: 2, method: "transfer", auto_renew: false, payer_name: "ТОО Хлеб", payer_bin: "123456789012", payer_email: "owner@example.test" });
  });

  it("opens the TipTop widget with the server intent and reports a closed form", async () => {
    const start = vi.fn(async () => ({ type: "cancel" as const }));
    (window as { tiptop?: unknown }).tiptop = { Widget: class { start = start; } };
    const intent = { publicTerminalId: "test_api_x", amount: 15000, currency: "KZT", externalId: "SF-2026-00008" };
    const calls = stub(true, path => path === "/api/billing/checkout" ? new Response(JSON.stringify({ invoice: invoice({ number: "SF-2026-00008", method: "card", months: 1, plan: "business", locations: 1, amount_kzt: 15000 }), widget: { intent, simulator: false, test_mode: true } }), { status: 201 }) : undefined);
    const user = userEvent.setup();
    panel();
    await user.click(await screen.findByRole("button", { name: /Оплатить 15/ }));
    await waitFor(() => expect(start).toHaveBeenCalledWith(intent));
    expect(await screen.findByText(/форма закрыта/)).toBeInTheDocument();
    expect(calls.find(call => call.path === "/api/billing/checkout")?.body).toMatchObject({ method: "card", months: 1, locations: 1, auto_renew: true });
  });

  it("pays through the local simulator when no acquiring is configured", async () => {
    stub(true, path => {
      if (path === "/api/billing/checkout") return new Response(JSON.stringify({ invoice: invoice({ method: "card", months: 1, plan: "business", locations: 1, amount_kzt: 15000 }), widget: { intent: {}, simulator: true, test_mode: true } }), { status: 201 });
      if (path === "/api/billing/simulate/SF-2026-00007") return new Response(JSON.stringify(invoice({ status: "paid", plan: "business", locations: 1, period_end: "2026-12-21T10:00:00Z" })));
      return undefined;
    }, { card: true, transfer: false, test_mode: true, simulator: true });
    const user = userEvent.setup();
    panel();
    await user.click(await screen.findByRole("button", { name: /Оплатить 15/ }));
    const dialog = await screen.findByRole("dialog", { name: "Тестовая оплата" });
    await user.click(within(dialog).getByRole("button", { name: "Оплатить (тест)" }));
    expect(await screen.findByText(/Тестовая оплата проведена. Тариф Business на 1 точка активен до 21.12.2026/)).toBeInTheDocument();
  });

  it("disables unavailable methods with an explanation", async () => {
    stub(true, undefined, { card: false, transfer: false, test_mode: true, simulator: false });
    panel();
    expect(await screen.findByText(/Появится после подключения эквайринга/)).toBeInTheDocument();
    expect(screen.getByText(/Приём оплаты ещё настраивается/)).toBeInTheDocument();
  });

  it("renders a printable invoice with seller requisites", async () => {
    stub(true, path => path === "/api/billing/invoices/SF-2026-00007" ? new Response(JSON.stringify(invoice())) : undefined);
    render(<InvoiceDocument />);
    const doc = await screen.findByRole("article", { name: "Счёт SF-2026-00007" });
    expect(within(doc).getByText(/Счёт на оплату № SF-2026-00007/)).toBeInTheDocument();
    expect(within(doc).getByText("KZ00TEST")).toBeInTheDocument();
    expect(within(doc).getByText(/Итого: 300\s000,00 ₸/)).toBeInTheDocument();
    expect(within(doc).getByText("Без НДС")).toBeInTheDocument();
  });

  it("sets a new password from the emailed link", async () => {
    const calls = stub(false, path => path === "/api/auth/reset" ? new Response(JSON.stringify({ message: "Пароль обновлён. Войдите с новым паролем." })) : undefined);
    const user = userEvent.setup();
    render(<ResetPassword />);
    await user.type(screen.getByLabelText(/^Новый пароль/), "brand-new-password");
    await user.type(screen.getByLabelText(/^Повторите пароль/), "brand-new-password");
    await user.click(screen.getByRole("button", { name: "Сохранить пароль" }));
    expect(await screen.findByText("Пароль обновлён. Войдите с новым паролем.")).toBeInTheDocument();
    expect(calls.find(call => call.path === "/api/auth/reset")?.body).toEqual({ token: "reset-token-from-email-1234", password: "brand-new-password" });
  });
});
