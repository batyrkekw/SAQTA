import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider, LANGUAGE_STORAGE_KEY } from "../src/components/language-provider";
import { AccountButton, AccountProvider } from "../src/features/account/account";
import { ForecastAccessProvider } from "../src/features/forecast/access-panel";
import { translateText } from "../src/lib/i18n/translate";

vi.mock("next/navigation", () => ({ usePathname: () => "/forecast" }));
const consentLabel = "Я согласен на обработку персональных данных и принимаю Пользовательское соглашение.";
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => {
  vi.unstubAllGlobals();
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: LANGUAGE_STORAGE_KEY })));
});

function stubAccount() {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  let signedIn = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    if (path === "/api/auth/register" || path === "/api/auth/login") {
      writes.push({ path, body: JSON.parse(String(init?.body)) });
      signedIn = true;
      return new Response(JSON.stringify({ token: "test-consent-session" }), { status: path.endsWith("register") ? 201 : 200 });
    }
    if (path === "/api/health") return new Response(JSON.stringify({ workspace_mode: "real", demo_data: false }));
    if (!signedIn) return new Response(JSON.stringify({ detail: "Войдите в организацию" }), { status: 401 });
    if (path === "/api/auth/me") return new Response(JSON.stringify({ user: { id: 1, email: "buyer@example.test", role: "consumer", requested_role: "consumer" }, organization: { id: 1, name: "Test bakery" } }));
    if (path === "/api/subscription") return new Response(JSON.stringify({ plan: "free", status: "inactive", active: false, access_mode: "unavailable", limits: { products: 3, forecast_runs_per_month: 0, locations: 1 }, usage: { period: "2026-11", forecast_runs: 0, remaining: 0 } }));
    throw new Error(`Unexpected endpoint ${path}`);
  }));
  return writes;
}

describe.each(["ru", "kk", "en"] as const)("registration consent in %s", (language) => {
  describe.each(["account", "forecast"] as const)("%s form", (flow) => {
    it("requires an explicit unchecked consent and submits only a boolean", async () => {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
      const t = (text: string) => translateText(text, language), user = userEvent.setup(), writes = stubAccount();
      render(<LanguageProvider>{flow === "account" ? <AccountProvider><AccountButton /></AccountProvider> : <ForecastAccessProvider><span>Workspace</span></ForecastAccessProvider>}</LanguageProvider>);
      if (flow === "account") await user.click(screen.getByRole("button", { name: t("Войти") }));
      const form = flow === "account" ? within(screen.getByRole("dialog")) : screen;
      await user.click(await form.findByRole("button", { name: t(flow === "account" ? "Создать аккаунт" : "Новая организация") }));
      await user.type(form.getByRole("textbox", { name: "Email" }), "buyer@example.test");
      await user.type(form.getByLabelText(new RegExp(t("Пароль"))), "test-safe-password");
      await user.type(form.getByRole("textbox", { name: t(flow === "account" ? "Имя или название организации" : "Название организации") }), "Test bakery");
      if (flow === "forecast") {
        await user.type(form.getByRole("textbox", { name: t("Название первой точки") }), "Main bakery");
        await user.type(form.getByRole("textbox", { name: t("Адрес точки") }), "Test address");
      }
      const consent = form.getByRole("checkbox", { name: t(consentLabel) });
      expect(consent).not.toBeChecked();
      expect(form.getByRole("link", { name: t("Политика конфиденциальности") })).toHaveAttribute("href", "/privacy");
      expect(form.getByRole("link", { name: t("Пользовательское соглашение") })).toHaveAttribute("href", "/terms");
      const submit = form.getByRole("button", { name: t(flow === "account" ? "Создать аккаунт" : "Создать организацию") });
      await user.click(submit);
      expect(form.getByText(t("Подтвердите согласие на обработку персональных данных"))).toBeInTheDocument();
      expect(writes).toHaveLength(0);
      await user.click(consent);
      await user.click(submit);
      await waitFor(() => expect(writes).toHaveLength(1));
      expect(writes[0].path).toBe("/api/auth/register");
      expect(writes[0].body).toMatchObject({ email: "buyer@example.test", consent: true });
      expect(writes[0].body).not.toHaveProperty("consent_given_at");
    });
    it("keeps sign-in available without a new consent checkbox", async () => {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
      const t = (text: string) => translateText(text, language), user = userEvent.setup(), writes = stubAccount();
      render(<LanguageProvider>{flow === "account" ? <AccountProvider><AccountButton /></AccountProvider> : <ForecastAccessProvider><span>Workspace</span></ForecastAccessProvider>}</LanguageProvider>);
      if (flow === "account") await user.click(screen.getByRole("button", { name: t("Войти") }));
      const form = flow === "account" ? within(screen.getByRole("dialog")) : screen;
      await user.type(await form.findByRole("textbox", { name: "Email" }), "buyer@example.test");
      await user.type(form.getByLabelText(new RegExp(t("Пароль"))), "test-safe-password");
      expect(form.queryByRole("checkbox", { name: t(consentLabel) })).not.toBeInTheDocument();
      await user.click(form.getByRole("button", { name: t("Войти") }));
      await waitFor(() => expect(writes).toHaveLength(1));
      expect(writes[0].path).toBe("/api/auth/login");
      expect(writes[0].body).not.toHaveProperty("consent");
    });
  });
});
