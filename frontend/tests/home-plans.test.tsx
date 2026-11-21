import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import { HomePricing } from "../src/components/home-community";
import { LANGUAGE_STORAGE_KEY, LanguageProvider } from "../src/components/language-provider";
import { formatters, translateText } from "../src/lib/i18n/translate";

beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent("storage", { key: LANGUAGE_STORAGE_KEY }));
});
afterEach(() => {
  localStorage.clear();
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: LANGUAGE_STORAGE_KEY })));
});

describe.each(["ru", "kk", "en"] as const)("proposed plans in %s", language => {
  it("shows one per-location price, monthly and annual, and keeps buyers free", async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    const t = (text: string) => translateText(text, language);
    const money = (value: number) => formatters(language).money(value).replace(/\s+/g, " ");
    const user = userEvent.setup();
    render(<LanguageProvider><HomePricing /></LanguageProvider>);
    const business = screen.getByRole("article", { name: "Business" });
    const save = screen.getByRole("article", { name: "Save" });
    expect(within(business).getByText(money(15000))).toBeInTheDocument();
    expect(within(business).getByText(`${t("3 точки —")} ${money(45000)} ${t("в месяц")}`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: new RegExp(t("Год")) }));
    expect(within(business).getByText(money(12500))).toBeInTheDocument();
    expect(within(business).getByText(`${money(150000)} ${t("за точку на год, единым платежом")}`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: `${t("Подключить")} Business` })).toHaveAttribute("href", "/billing");
    expect(within(save).getByRole("link", { name: t("Найти продукты") })).toHaveAttribute("href", "/save");
  });
});
