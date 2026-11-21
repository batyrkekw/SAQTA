import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import Home from "../src/app/page";
import { LANGUAGE_STORAGE_KEY, LanguageProvider } from "../src/components/language-provider";

function resetLanguage() {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent("storage", { key: LANGUAGE_STORAGE_KEY }));
}
beforeEach(resetLanguage);
afterEach(() => { act(resetLanguage); vi.unstubAllGlobals(); });
const showHome = () => render(<LanguageProvider><Home /></LanguageProvider>);

describe("public home", () => {
  it("leads with the bakery promise, an example plan and both entry points", () => {
    showHome();
    expect(screen.getByRole("heading", { level: 1, name: "Пеките столько, сколько купят." })).toBeInTheDocument();
    const hero = screen.getByRole("heading", { level: 1 }).closest("section")!;
    expect(within(hero).getByRole("link", { name: /Попробовать 14 дней бесплатно/ })).toHaveAttribute("href", "/forecast");
    expect(within(hero).getByRole("link", { name: "Купить выпечку со скидкой" })).toHaveAttribute("href", "/save");
    const ticket = screen.getByRole("article", { name: "Пример плана выпечки на завтра" });
    expect(within(ticket).getByText("Пример расчёта")).toBeInTheDocument();
    expect(within(ticket).getAllByRole("row")).toHaveLength(6);
  });

  it("explains the real sequence and answers pricing and data questions", () => {
    showHome();
    const steps = within(screen.getByRole("region", { name: "Как это работает" })).getAllByRole("listitem");
    expect(steps.map(step => within(step).getByRole("heading").textContent)).toEqual(["Загрузите продажи", "Получите план на завтра", "Продайте остаток"]);
    fireEvent.click(screen.getByText("Сколько стоит SaqtaFood?"));
    expect(screen.getByText(/15 000 ₸ в месяц за каждую точку/)).toBeVisible();
    expect(screen.getByText("Кто видит данные моей пекарни?")).toBeInTheDocument();
  });

  it("links the legal documents a payment provider checks", () => {
    showHome();
    const footer = screen.getByRole("navigation", { name: "Навигация в подвале" });
    for (const [name, href] of [["Публичная оферта", "/offer"], ["Политика конфиденциальности", "/privacy"], ["Пользовательское соглашение", "/terms"], ["Тарифы", "/billing"]]) {
      expect(within(footer).getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it.each([["English", "Bake just what sells."], ["Қазақша", "Сатылатынын ғана пісіріңіз."]])("is fully translated: %s", (language, heading) => {
    showHome();
    fireEvent.click(screen.getByRole("button", { name: language }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(heading);
    if (language === "English") expect(screen.getByRole("main").textContent).not.toMatch(/[А-Яа-яЁё]/);
  });
});
