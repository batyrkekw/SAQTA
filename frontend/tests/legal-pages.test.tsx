import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider, LANGUAGE_STORAGE_KEY } from "../src/components/language-provider";
import { LegalPage } from "../src/components/legal-page";
import { translateText } from "../src/lib/i18n/translate";

const route = vi.hoisted(() => ({ pathname: "/privacy" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
beforeEach(() => localStorage.clear());
afterEach(() => act(() => window.dispatchEvent(new StorageEvent("storage", { key: LANGUAGE_STORAGE_KEY }))));

describe.each(["ru", "kk", "en"] as const)("legal pages in %s", (language) => {
  it.each(["privacy", "terms"] as const)("shows the %s draft, manual process and actual contact", (kind) => {
    route.pathname = `/${kind}`;
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    const t = (text: string) => translateText(text, language);
    const { container } = render(<LanguageProvider><LegalPage kind={kind} /></LanguageProvider>);
    const title = t(kind === "privacy" ? "Политика конфиденциальности" : "Пользовательское соглашение");
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(t("Черновик, требует проверки юристом перед публичным запуском"));
    expect(screen.getByRole("heading", { name: t("Данные и цели обработки") })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: t("Срок хранения") })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: t("Удаление данных и обращения") })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "sanateam31@gmail.com" })).toHaveAttribute("href", "mailto:sanateam31@gmail.com");
    expect(screen.getByRole("link", { name: t(kind === "privacy" ? "Пользовательское соглашение" : "Политика конфиденциальности") })).toHaveAttribute("href", kind === "privacy" ? "/terms" : "/privacy");
    expect(document.title).toBe(`${title} · SaqtaFood`);
    expect(document.querySelector('meta[property="og:title"]')).toHaveAttribute("content", `${title} · SaqtaFood`);
    if (language === "kk") expect(screen.getByText(t("Казахский текст требует проверки носителем языка."))).toBeInTheDocument();
    if (language === "en") expect(container.textContent).not.toMatch(/[А-Яа-яЁё]/);
  });
});
