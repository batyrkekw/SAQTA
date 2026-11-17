import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LanguageProvider,
  LANGUAGE_STORAGE_KEY,
} from "../src/components/language-provider";
import { translateText } from "../src/lib/i18n/translate";
import Marketplace from "../src/features/save/marketplace";
const session = vi.hoisted(() => ({ role: "consumer" }));
const consentLabel = "Я согласен на обработку персональных данных и принимаю Пользовательское соглашение.";
vi.mock("next/navigation", () => ({ usePathname: () => "/save" }));
vi.mock("../src/features/account/account", () => ({
  useAccount: () => ({
    account: {
      user: { id: 1, role: session.role },
      organization: { name: "Test recipient" },
    },
    open: vi.fn(),
  }),
}));
const offer = {
  id: 4,
  product_name: "Test bread",
  category: "Bread",
  business_name: "Test seller",
  unit: "pcs",
  available_quantity: 5,
  quantity: 5,
  original_price_kzt: 1000,
  discounted_price_kzt: 500,
  status: "active",
  description: "Test description",
  city: "Test city",
  address: "Test address",
  pickup_start: new Date().toISOString(),
  pickup_deadline: new Date(Date.now() + 3600000).toISOString(),
  expires_at: new Date(Date.now() + 7200000).toISOString(),
  bulk_available: true,
  terms: "discounted",
  photo_url: null,
};
beforeEach(() => {
  session.role = "consumer";
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: LANGUAGE_STORAGE_KEY }),
    ),
  );
});
describe.each(["ru", "kk", "en"] as const)("SAVE in %s", (language) => {
  it.each(["consumer", "business"])("shows the customer contact in private orders for %s", async (role) => {
    session.role = role;
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    const t = (text: string) => translateText(text, language), user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(
      url.includes("/market/orders") ? [{
        id: 1, status: "reserved", seller: role === "business", kind: "individual",
        customer_name: "Test recipient", customer_phone: "+77011234567", consent_given_at: new Date().toISOString(),
        total_kzt: 500, beneficiaries: null, logistics: "", items: [], events: [], pickup_code: "001234",
      }] : [offer],
    ))));
    render(<LanguageProvider><Marketplace /></LanguageProvider>);
    await screen.findByRole("button", { name: t("Открыть предложение") });
    expect(screen.queryByText(/\+77011234567/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("Мои заявки") }));
    expect(await screen.findByText(`${t("Телефон покупателя")}: +77011234567`)).toBeInTheDocument();
    if (role === "consumer") {
      expect(screen.getByText("001234")).toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: new RegExp(t("Код получения покупателя")) })).not.toBeInTheDocument();
    } else {
      expect(screen.queryByText("001234")).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: new RegExp(t("Код получения покупателя")) })).toHaveValue("");
    }
  });
  it("requires six digits, keeps leading zeros, and allows retry after an incorrect pickup code", async () => {
    session.role = "business";
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    const t = (text: string) => translateText(text, language), user = userEvent.setup();
    const writes: unknown[] = [];
    let status = "reserved";
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        expect(url).toContain("/market/orders/1/collect");
        writes.push(JSON.parse(String(init.body)));
        if (writes.length === 1) return new Response(JSON.stringify({ detail: "Неверный код получения" }), { status: 422 });
        status = "collected";
        return new Response("{}");
      }
      return new Response(JSON.stringify(url.includes("/market/orders") ? [{
        id: 1, status, seller: true, kind: "individual", customer_name: "Test recipient",
        total_kzt: 500, beneficiaries: null, logistics: "", items: [], events: [],
      }] : [offer]));
    }));
    render(<LanguageProvider><Marketplace /></LanguageProvider>);
    await user.click(screen.getByRole("button", { name: t("Мои заявки") }));
    const input = await screen.findByRole("textbox", { name: new RegExp(t("Код получения покупателя")) });
    const collect = screen.getByRole("button", { name: t("Подтвердить выдачу") });
    await user.click(collect);
    expect(screen.getByText(t("Укажите шестизначный код получения"))).toBeInTheDocument();
    for (const invalid of ["12345", "12a456"]) {
      await user.clear(input);
      await user.type(input, invalid);
      await user.click(collect);
      expect(writes).toHaveLength(0);
    }
    await user.clear(input);
    await user.type(input, "000001");
    await user.click(collect);
    expect(await screen.findByText(t("Неверный код получения"))).toBeInTheDocument();
    expect(input).toHaveValue("000001");
    expect(input).toBeEnabled();
    expect(screen.getByText(t("Зарезервирован"))).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "001234");
    await user.click(collect);
    expect(await screen.findByText(t("Выдан"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("Подтвердить выдачу") })).not.toBeInTheDocument();
    expect(writes).toEqual([{ pickup_code: "000001" }, { pickup_code: "001234" }]);
  });
  it("cancels without submitting or validating a pickup code", async () => {
    session.role = "business";
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    const t = (text: string) => translateText(text, language), user = userEvent.setup();
    const writes: unknown[] = [];
    let status = "reserved";
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        expect(url).toContain("/market/orders/1/cancel");
        writes.push(JSON.parse(String(init.body)));
        status = "cancelled";
        return new Response("{}");
      }
      return new Response(JSON.stringify(url.includes("/market/orders") ? [{
        id: 1, status, seller: true, kind: "individual", customer_name: "Test recipient",
        total_kzt: 500, beneficiaries: null, logistics: "", items: [], events: [],
      }] : [offer]));
    }));
    render(<LanguageProvider><Marketplace /></LanguageProvider>);
    await user.click(screen.getByRole("button", { name: t("Мои заявки") }));
    const input = await screen.findByRole("textbox", { name: new RegExp(t("Код получения покупателя")) });
    await user.type(input, "bad");
    await user.click(screen.getByRole("button", { name: t("Отменить") }));
    expect(await screen.findByText(t("Отменён"))).toBeInTheDocument();
    expect(writes).toEqual([{}]);
  });
  it("retries a reservation with the same key and translates backend errors and confirmation", async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    const t = (s: string) => translateText(s, language),
      user = userEvent.setup();
    const writes: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          writes.push(JSON.parse(String(init.body)));
          return writes.length === 1
            ? new Response(
                JSON.stringify({
                  detail: "Нельзя бронировать собственное предложение",
                }),
                { status: 409 },
              )
            : new Response("{}");
        }
        expect(url).toContain("/market/listings");
        return new Response(JSON.stringify([offer]));
      }),
    );
    render(
      <LanguageProvider>
        <Marketplace />
      </LanguageProvider>,
    );
    await user.click(
      await screen.findByRole("button", { name: t("Открыть предложение") }),
    );
    const submit = screen.getByRole("button", {
      name: new RegExp(t("Забронировать")),
    });
    const consent = screen.getByRole("checkbox", { name: t(consentLabel) });
    expect(consent).not.toBeChecked();
    expect(screen.getByRole("link", { name: t("Политика конфиденциальности") })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: t("Пользовательское соглашение") })).toHaveAttribute("href", "/terms");
    await user.click(submit);
    expect(screen.getByText(t("Укажите телефон Казахстана в формате +7XXXXXXXXXX"))).toBeInTheDocument();
    expect(writes).toHaveLength(0);
    await user.type(screen.getByRole("textbox", { name: new RegExp(t("Телефон покупателя")) }), "8 (701) 123-45-67");
    await user.click(submit);
    expect(screen.getByText(t("Подтвердите согласие на обработку персональных данных"))).toBeInTheDocument();
    expect(writes).toHaveLength(0);
    await user.click(consent);
    await user.click(submit);
    expect(
      await screen.findByText(t("Нельзя бронировать собственное предложение")),
    ).toBeInTheDocument();
    await user.click(submit);
    await screen.findByText(
      t("Заявка сохранена. Статус доступен в разделе «Мои заявки»."),
    );
    expect(writes).toHaveLength(2);
    expect(writes[0].idempotency_key).toBe(writes[1].idempotency_key);
    expect(writes[0]).toMatchObject({
      listing_id: 4,
      kind: "individual",
      quantity: 1,
      customer_phone: "8 (701) 123-45-67",
      consent: true,
    });
  });
  it("requires beneficiary information for charity requests", async () => {
    session.role = "charity";
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    const t = (s: string) => translateText(s, language),
      user = userEvent.setup();
    const writes: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          writes.push(JSON.parse(String(init.body)));
          return new Response("{}");
        }
        return new Response(
          JSON.stringify([
            {
              ...offer,
              terms: "negotiated",
              discounted_price_kzt: 0,
              original_price_kzt: 1000,
            },
          ]),
        );
      }),
    );
    render(
      <LanguageProvider>
        <Marketplace />
      </LanguageProvider>,
    );
    await user.click(
      await screen.findByRole("button", { name: t("Открыть предложение") }),
    );
    expect(screen.queryByText("−100%")).not.toBeInTheDocument();
    const submit = screen.getByRole("button", { name: new RegExp(t("Отправить заявку")) });
    await user.click(submit);
    expect(screen.getByText(t("Укажите телефон Казахстана в формате +7XXXXXXXXXX"))).toBeInTheDocument();
    expect(writes).toHaveLength(0);
    await user.type(screen.getByRole("textbox", { name: new RegExp(t("Телефон покупателя")) }), "+77011234567");
    await user.click(submit);
    expect(screen.getByText(t("Подтвердите согласие на обработку персональных данных"))).toBeInTheDocument();
    expect(writes).toHaveLength(0);
    await user.click(screen.getByRole("checkbox", { name: t(consentLabel) }));
    await user.click(
      screen.getByRole("button", { name: new RegExp(t("Отправить заявку")) }),
    );
    expect(
      screen.getByText(t("Заполните все обязательные поля")),
    ).toBeInTheDocument();
    expect(writes).toHaveLength(0);
    await user.type(
      screen.getByLabelText(t("Примерное число получателей")),
      "20",
    );
    await user.type(
      screen.getByLabelText(t("Потребности в доставке и условия передачи")),
      "Pickup required",
    );
    await user.click(
      screen.getByRole("button", { name: new RegExp(t("Отправить заявку")) }),
    );
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      kind: "bulk",
      beneficiaries: 20,
      logistics: "Pickup required",
      customer_phone: "+77011234567",
      consent: true,
    });
  });
});
