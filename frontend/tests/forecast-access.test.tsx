import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForecastAccessProvider, useForecastAccess } from "../src/features/forecast/access-panel";

afterEach(() => { vi.unstubAllGlobals(); window.sessionStorage.clear(); });
function AccessProbe() { const access = useForecastAccess(); return <p>{access?.canAnalyze ? "ANALYSIS_ALLOWED" : "ANALYSIS_BLOCKED"}</p>; }
describe("organization access", () => {
  it("onboards a real organization without pretending a paid subscription was activated", async () => {
    let registration: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === "/api/health") return new Response(JSON.stringify({ status: "ok", workspace_mode: "real", demo_data: false }));
      if (path === "/api/subscription") {
        if (!(init?.headers as Headers).get("Authorization")) return new Response(JSON.stringify({ detail: "Войдите в организацию" }), { status: 401 });
        return new Response(JSON.stringify({ plan: "free", status: "inactive", active: false, access_mode: "unavailable", expires_at: null, limits: { products: 3, forecast_runs_per_month: 0, locations: 1 }, usage: { period: "2026-10", forecast_runs: 0, remaining: 0 }, manual_activation: true }));
      }
      if (path === "/api/auth/register") { registration = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ token: "isolated-test-session", expires_at: "2026-10-31T12:00:00Z" }), { status: 201 }); }
      throw new Error(`Unexpected endpoint ${path}`);
    }));
    const user = userEvent.setup(); render(<ForecastAccessProvider><AccessProbe/></ForecastAccessProvider>);
    await user.click(await screen.findByRole("button", { name: "Новая организация" }));
    await user.type(screen.getByRole("textbox", { name: "Email" }), "baker@example.test");
    await user.type(screen.getByLabelText(/^Пароль/), "a-safe-test-password");
    await user.type(screen.getByRole("textbox", { name: "Название организации" }), "Моя пекарня");
    await user.type(screen.getByRole("textbox", { name: "Название первой точки" }), "Центр");
    await user.type(screen.getByRole("textbox", { name: "Адрес точки" }), "Собственный адрес");
    await user.click(screen.getByRole("button", { name: "Создать организацию" }));
    expect(await screen.findByText(/Подписка не активирована/)).toBeInTheDocument();
    expect(registration).toMatchObject({ email: "baker@example.test", bakery_name: "Моя пекарня", location_name: "Центр", address: "Собственный адрес", city: "Астана" });
    expect(screen.getByText("ANALYSIS_BLOCKED")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Выйти из организации" })).toBeEnabled());
  });
});
