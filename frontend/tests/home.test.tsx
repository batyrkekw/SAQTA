import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import Home from "../src/app/page";
import { LANGUAGE_STORAGE_KEY, LanguageProvider } from "../src/components/language-provider";

function resetLanguage() {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent("storage", { key: LANGUAGE_STORAGE_KEY }));
}
function mockMotion(reduce = false) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reduce, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
}
beforeEach(() => { resetLanguage(); mockMotion(); });
afterEach(() => { act(resetLanguage); vi.unstubAllGlobals(); });
const showHome = () => render(<LanguageProvider><Home /></LanguageProvider>);

describe("public home overview", () => {
  it("lets visitors choose a workflow with a mouse or keyboard", () => {
    showHome();
    expect(within(screen.getByRole("tabpanel")).getByRole("link", { name: "Найти продукты" })).toHaveAttribute("href", "/save");
    const business = screen.getByRole("tab", { name: "У меня бизнес" });
    fireEvent.click(business);
    expect(business).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByRole("heading", { name: "Завтра понятнее уже сегодня." })).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Планировать спрос" })).toHaveAttribute("href", "/forecast");
    fireEvent.keyDown(business, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Хочу купить" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Хочу купить" })).toHaveAttribute("aria-selected", "true");
    expect(within(panel).getByRole("link", { name: "Найти продукты" })).toBeInTheDocument();
  });
  it("translates both paths and FAQ content without resetting the visitor's choice", () => {
    showHome();
    fireEvent.click(screen.getByRole("tab", { name: "У меня бизнес" }));
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("tab", { name: "I run a business" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("main").textContent).not.toMatch(/[А-Яа-яЁё]/);
    expect(screen.getByText("Can I start without sales history?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "I want to buy" }));
    expect(screen.getByRole("main").textContent).not.toMatch(/[А-Яа-яЁё]/);
    fireEvent.click(screen.getByRole("button", { name: "Қазақша" }));
    expect(screen.getByRole("tab", { name: "Өнім алғым келеді" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Жақсы тағам.");
    fireEvent.click(screen.getByRole("tab", { name: "Менде бизнес бар" }));
    expect(within(screen.getByRole("tabpanel")).getByRole("link", { name: "Сұранысты жоспарлау" })).toHaveAttribute("href", "/forecast");
    fireEvent.click(screen.getByRole("button", { name: "Русский" }));
    expect(screen.getByRole("tab", { name: "У меня бизнес" })).toHaveAttribute("aria-selected", "true");
  });
  it("allows visitors to pause and resume decorative motion", () => {
    showHome();
    fireEvent.click(screen.getByRole("button", { name: "Остановить анимацию" }));
    expect(screen.getByRole("button", { name: "Включить анимацию" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Включить анимацию" }));
    expect(screen.getByRole("button", { name: "Остановить анимацию" })).toHaveAttribute("aria-pressed", "false");
  });
  it("honors the device's reduced-motion setting", () => {
    mockMotion(true);
    showHome();
    expect(screen.getByRole("button", { name: "Анимация отключена в настройках устройства" })).toBeDisabled();
  });
});
