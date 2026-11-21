import { act, render, screen, within } from "@testing-library/react";
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
  it("shows the same prices as billing, monthly and annual, and links paid plans to billing", async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    const t = (text: string) => translateText(text, language);
    const money = (value: number) => formatters(language).money(value).replace(/\s+/g, " ");
    const user = userEvent.setup();
    render(<LanguageProvider><HomePricing /></LanguageProvider>);
    const starter = screen.getByRole("article", { name: "Starter" });
    const pro = screen.getByRole("article", { name: "Pro" });
    expect(within(starter).getByText(money(15000))).toBeInTheDocument();
    expect(within(pro).getByText(money(30000))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: new RegExp(t("Год")) }));
    expect(within(starter).getByText(money(12500))).toBeInTheDocument();
    expect(within(pro).getByText(money(25000))).toBeInTheDocument();
    expect(within(starter).getByText(`${money(150000)} ${t("за год · единым платежом")}`)).toBeInTheDocument();
    expect(within(pro).getByText(`${money(300000)} ${t("за год · единым платежом")}`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: `${t("Подключить")} Starter` })).toHaveAttribute("href", "/billing");
    expect(screen.getByRole("link", { name: `${t("Подключить")} Pro` })).toHaveAttribute("href", "/billing");
    expect(screen.getByRole("link", { name: t("Начать бесплатно") })).toHaveAttribute("href", "/save");
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
