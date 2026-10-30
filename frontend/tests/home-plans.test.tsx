import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import { HomeCommunity, HomePricing } from "../src/components/home-community";
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
  it("shows monthly and annual totals and explains that a paid plan cannot be purchased yet", async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    const t = (text: string) => translateText(text, language);
    const money = (value: number) => formatters(language).money(value).replace(/\s+/g, " ");
    const user = userEvent.setup();
    render(<LanguageProvider><HomePricing /></LanguageProvider>);
    const growth = screen.getByRole("article", { name: "Growth" });
    const scale = screen.getByRole("article", { name: "Scale" });
    expect(within(growth).getByText(money(14900))).toBeInTheDocument();
    expect(within(scale).getByText(money(39900))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: new RegExp(t("Год")) }));
    expect(within(growth).getByText(money(11920))).toBeInTheDocument();
    expect(within(scale).getByText(money(31920))).toBeInTheDocument();
    expect(within(growth).getByText(`${money(143040)} ${t("за год · единым платежом")}`)).toBeInTheDocument();
    expect(within(scale).getByText(`${money(383040)} ${t("за год · единым платежом")}`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: `${t("Посмотреть тариф")} Growth` }));
    const dialog = screen.getByRole("dialog", { name: t("Тариф Growth") });
    expect(within(dialog).getByText(t("Это состав будущей подписки, а не доступный к оплате продукт. Пока можно бесплатно попробовать текущие возможности FORECAST."))).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: t("Попробовать FORECAST") })).toHaveAttribute("href", "/forecast");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${t("Посмотреть тариф")} Growth` })).toHaveFocus();
    expect(screen.getByRole("link", { name: t("Начать бесплатно") })).toHaveAttribute("href", "/forecast");
  });
  it("keeps fictional testimonials visibly labeled as examples", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    const t = (text: string) => translateText(text, language);
    render(<LanguageProvider><HomeCommunity /></LanguageProvider>);
    expect(screen.getByText(t("Вымышленные истории для макета. Заменим их реальными отзывами после интервью."))).toBeInTheDocument();
    const stories = screen.getAllByRole("figure");
    expect(stories).toHaveLength(3);
    for (const story of stories) expect(within(story).getByText(t("Пример"))).toBeInTheDocument();
  });
});
