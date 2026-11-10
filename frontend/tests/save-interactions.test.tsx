import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider, LANGUAGE_STORAGE_KEY } from "../src/components/language-provider";
import Marketplace from "../src/features/save/marketplace";
import { translateText } from "../src/lib/i18n/translate";

const session = vi.hoisted(() => ({ role: "consumer" }));
vi.mock("next/navigation", () => ({ usePathname: () => "/save" }));
vi.mock("../src/features/account/account", () => ({
  useAccount: () => ({
    account: { user: { id: 1, role: session.role }, organization: { name: "Recipient" } },
    open: vi.fn(),
  }),
}));

const consent = "Я согласен на обработку персональных данных и принимаю Пользовательское соглашение.";
const baseOffer = {
  id: 1, product_name: "Bread", category: "Bread", business_name: "Bakery", unit: "pcs",
  available_quantity: 3, quantity: 3, original_price_kzt: 1000, discounted_price_kzt: 500,
  status: "active", description: "", city: "Almaty", address: "Test address",
  pickup_start: new Date(Date.now() - 3600000).toISOString(),
  pickup_deadline: new Date(Date.now() + 3600000).toISOString(),
  expires_at: null, bulk_available: true, terms: "discounted", photo_url: null,
};
const listings = [
  { ...baseOffer, id: 1, product_name: "Regular bread", discounted_price_kzt: 800, pickup_deadline: new Date(Date.now() + 1800000).toISOString() },
  { ...baseOffer, id: 2, product_name: "Negotiated bread", terms: "negotiated", discounted_price_kzt: 0 },
  { ...baseOffer, id: 3, product_name: "Discount bread", pickup_deadline: new Date(Date.now() + 7200000).toISOString() },
  { ...baseOffer, id: 4, product_name: "Free bread", terms: "free", discounted_price_kzt: 0, pickup_start: new Date(Date.now() + 900000).toISOString(), pickup_deadline: new Date(Date.now() + 10800000).toISOString() },
];
const makeOrder = (id: number, status: string) => ({
  id, status, seller: false, kind: "individual", customer_name: `Recipient ${id}`,
  customer_phone: null, consent_given_at: null, pickup_code: null, total_kzt: 500,
  beneficiaries: null, logistics: "", items: [], events: [],
});

beforeEach(() => {
  session.role = "consumer";
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: LANGUAGE_STORAGE_KEY })));
});

function offerNames() {
  return screen.queryAllByRole("article").map((card) => within(card).getByRole("heading", { level: 2 }).textContent);
}
function stubOffers(data = listings) {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(data)));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
function showMarketplace() {
  render(<LanguageProvider><Marketplace /></LanguageProvider>);
}

describe("Save browsing tools", () => {
  it("sorts actual prices, discounts and pickup deadlines without treating negotiated prices as free", async () => {
    stubOffers();
    const user = userEvent.setup();
    showMarketplace();
    await screen.findByRole("heading", { name: "Regular bread" });
    const sort = screen.getByRole("combobox", { name: "Сортировка предложений" });
    await user.selectOptions(sort, "price");
    expect(offerNames()).toEqual(["Free bread", "Discount bread", "Regular bread", "Negotiated bread"]);
    await user.selectOptions(sort, "discount");
    expect(offerNames()).toEqual(["Free bread", "Discount bread", "Regular bread", "Negotiated bread"]);
    await user.selectOptions(sort, "pickup");
    expect(offerNames()).toEqual(["Regular bread", "Negotiated bread", "Discount bread", "Free bread"]);
    await user.selectOptions(sort, "default");
    expect(offerNames()).toEqual(listings.map((offer) => offer.product_name));
  });

  it("combines free and pickup-now filters, shows the filtered count, and resets them", async () => {
    stubOffers();
    const user = userEvent.setup();
    showMarketplace();
    await screen.findByRole("heading", { name: "Regular bread" });
    const filters = within(screen.getByRole("group", { name: "Быстрые фильтры предложений" }));
    await user.click(filters.getByRole("button", { name: "Бесплатно" }));
    expect(offerNames()).toEqual(["Free bread"]);
    expect(screen.getByText("Найдено предложений: 1")).toBeInTheDocument();
    await user.click(filters.getByRole("button", { name: "Можно забрать сейчас" }));
    expect(offerNames()).toEqual([]);
    expect(screen.getByText("Найдено предложений: 0")).toBeInTheDocument();
    expect(screen.getByText("Пока нет подходящих предложений")).toBeInTheDocument();
    await user.click(filters.getByRole("button", { name: "Бесплатно" }));
    expect(offerNames()).toEqual(["Regular bread", "Negotiated bread", "Discount bread"]);
    await user.click(screen.getByRole("button", { name: "Сбросить фильтры" }));
    expect(offerNames()).toHaveLength(4);
    expect(filters.getByRole("button", { name: "Можно забрать сейчас" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the 50% shortcut synchronized with the existing server filter and refreshes listings", async () => {
    const fetch = stubOffers();
    const user = userEvent.setup();
    showMarketplace();
    await screen.findByRole("heading", { name: "Regular bread" });
    const chip = screen.getByRole("button", { name: "Скидка от 50%" });
    await user.click(chip);
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes("min_discount=50"))).toBe(true));
    expect(screen.getByRole("combobox", { name: "Скидка от" })).toHaveValue("50");
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await user.click(chip);
    expect(screen.getByRole("combobox", { name: "Скидка от" })).toHaveValue("");
    await waitFor(() => expect(screen.getByRole("button", { name: "Обновить предложения" })).toBeEnabled());
    const calls = fetch.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Обновить предложения" }));
    await waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThan(calls));
  });

  it("filters private orders by status with accurate counts, including after refresh", async () => {
    let orders = [makeOrder(1, "pending"), makeOrder(2, "reserved"), makeOrder(3, "collected"), makeOrder(4, "cancelled")];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("/market/orders") ? orders : listings))));
    const user = userEvent.setup();
    showMarketplace();
    await user.click(screen.getByRole("button", { name: "Мои заявки" }));
    const filters = within(await screen.findByRole("group", { name: "Фильтр статуса заявок" }));
    expect(filters.getByRole("button", { name: "Все заявки" })).toHaveTextContent("Все заявки 4");
    expect(filters.getByRole("button", { name: "В работе" })).toHaveTextContent("В работе 2");
    await user.click(filters.getByRole("button", { name: "В работе" }));
    expect(screen.getByRole("heading", { name: /Recipient 1/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Recipient 2/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Recipient 3/ })).not.toBeInTheDocument();
    await user.click(filters.getByRole("button", { name: "Выданные" }));
    expect(screen.getByRole("heading", { name: /Recipient 3/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Recipient 1/ })).not.toBeInTheDocument();
    orders = [makeOrder(1, "cancelled"), makeOrder(2, "cancelled"), makeOrder(3, "collected"), makeOrder(4, "cancelled")];
    await user.click(screen.getByRole("button", { name: "Обновить заявки" }));
    const refreshed = within(await screen.findByRole("group", { name: "Фильтр статуса заявок" }));
    expect(refreshed.getByRole("button", { name: "Отменённые" })).toHaveTextContent("Отменённые 3");
    expect(refreshed.getByRole("button", { name: "Выданные" })).toHaveAttribute("aria-pressed", "true");
    await user.click(refreshed.getByRole("button", { name: "В работе" }));
    expect(screen.getByText("В этом статусе заявок нет")).toBeInTheDocument();
  });
});

describe.each(["ru", "kk", "en"] as const)("Save quantity controls in %s", (language) => {
  it("bounds quantity to stock, previews total and savings, and submits only the confirmed amount", async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    const t = (text: string) => translateText(text, language);
    const writes: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") { writes.push(JSON.parse(String(init.body))); return new Response("{}"); }
      return new Response(JSON.stringify([baseOffer]));
    }));
    const user = userEvent.setup();
    showMarketplace();
    await user.click(await screen.findByRole("button", { name: t("Открыть предложение") }));
    const quantity = screen.getByRole("spinbutton", { name: t("Количество") });
    const plus = screen.getByRole("button", { name: t("Увеличить количество") });
    const minus = screen.getByRole("button", { name: t("Уменьшить количество") });
    const preview = screen.getByRole("status", { name: t("Расчёт бронирования") });
    expect(minus).toBeDisabled();
    expect(preview).toHaveTextContent(t("Экономия относительно обычной цены"));
    await user.click(plus);
    await user.click(plus);
    expect(quantity).toHaveValue(3);
    expect(plus).toBeDisabled();
    expect(preview.textContent?.replace(/\D/g, "")).toContain("1500");
    await user.click(minus);
    expect(quantity).toHaveValue(2);
    expect(preview.textContent?.replace(/\D/g, "")).toContain("1000");
    expect(writes).toHaveLength(0);
    await user.type(screen.getByRole("textbox", { name: new RegExp(t("Телефон покупателя")) }), "+77011234567");
    await user.click(screen.getByRole("checkbox", { name: t(consent) }));
    await user.click(screen.getByRole("button", { name: new RegExp(`^${t("Забронировать")}`) }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ quantity: 2, customer_phone: "+77011234567", consent: true, kind: "individual" });
    expect(writes[0].idempotency_key).toEqual(expect.any(String));
  });
});

describe("Save quantity edge cases", () => {
  it.each(["", "0", "4", "1.5"])("prevents booking an invalid quantity %s and allows correction", async (value) => {
    const fetch = stubOffers([baseOffer]);
    const user = userEvent.setup();
    showMarketplace();
    await user.click(await screen.findByRole("button", { name: "Открыть предложение" }));
    const quantity = screen.getByRole("spinbutton", { name: "Количество" });
    fireEvent.change(quantity, { target: { value } });
    expect(screen.getByRole("button", { name: /^Забронировать/ })).toBeDisabled();
    expect(screen.getByRole("status", { name: "Расчёт бронирования" })).toHaveTextContent("Укажите корректное количество");
    await user.click(screen.getByRole("button", { name: "Увеличить количество" }));
    expect(Number((quantity as HTMLInputElement).value)).toBeGreaterThanOrEqual(1);
    expect(Number((quantity as HTMLInputElement).value)).toBeLessThanOrEqual(3);
    expect(screen.getByRole("button", { name: /^Забронировать/ })).toBeEnabled();
    expect(fetch.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });

  it("keeps negotiated totals unknown and does not invent savings", async () => {
    session.role = "charity";
    stubOffers([{ ...baseOffer, terms: "negotiated", discounted_price_kzt: 0 }]);
    const user = userEvent.setup();
    showMarketplace();
    await user.click(await screen.findByRole("button", { name: "Открыть предложение" }));
    await user.click(screen.getByRole("button", { name: "Увеличить количество" }));
    const preview = screen.getByRole("status", { name: "Расчёт бронирования" });
    expect(preview).toHaveTextContent("По согласованию");
    expect(preview).not.toHaveTextContent("Экономия");
    expect(preview).not.toHaveTextContent("₸");
  });
});
