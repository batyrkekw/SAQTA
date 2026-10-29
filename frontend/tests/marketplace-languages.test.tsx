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
    });
  });
});
