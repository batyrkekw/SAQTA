import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LanguageProvider,
  LANGUAGE_STORAGE_KEY,
} from "../src/components/language-provider";
import { LanguageSwitcher } from "../src/components/language-switcher";
import { Questionnaire } from "../src/features/analysis/questionnaire";
import { ImportData } from "../src/features/analysis/import-data";
import type { AnalysisState } from "../src/features/analysis/types";
import { translateText, type Language } from "../src/lib/i18n/translate";
vi.mock("next/navigation", () => ({ usePathname: () => "/forecast" }));
const state: AnalysisState = {
  profile: null,
  latest: null,
  products: [],
  locations: [{ id: 4, name: "Test location", address: "Test address" }],
  imports: [],
};
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: LANGUAGE_STORAGE_KEY }),
    ),
  );
});
function locale(language: Language) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  return (text: string) => translateText(text, language);
}

describe.each(["ru", "kk", "en"] as const)(
  "new workflows in %s",
  (language) => {
    it("validates the questionnaire, preserves drafts through a language switch and saves estimates without fake history", async () => {
      const t = locale(language),
        user = userEvent.setup(),
        saved = vi.fn();
      let sent: Record<string, unknown> | null = null;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          expect(url).toContain("/analysis/profile");
          expect(init?.method).toBe("PUT");
          sent = JSON.parse(String(init?.body));
          return new Response("{}");
        }),
      );
      render(
        <LanguageProvider>
          <LanguageSwitcher />
          <Questionnaire
            saved={null}
            locations={state.locations}
            onSaved={saved}
          />
        </LanguageProvider>,
      );
      await user.click(screen.getByRole("button", { name: t("Далее") }));
      expect(
        screen.getByText(t("Заполните все обязательные поля")),
      ).toBeInTheDocument();
      await user.type(screen.getByLabelText(t("Тип бизнеса")), "QA bakery");
      await user.click(screen.getByRole("button", { name: t("Далее") }));
      await user.type(
        screen.getByLabelText(t("Название продукта")),
        "QA Bread",
      );
      await user.type(screen.getByLabelText(t("Категория")), "Bread");
      await user.type(screen.getByLabelText(t("Единица измерения")), "pcs");
      await user.type(screen.getByLabelText(t("Обычно продано")), "0");
      await user.click(screen.getByRole("button", { name: "English" }));
      expect(screen.getByLabelText("Product name")).toHaveValue("QA Bread");
      await user.click(
        screen.getByRole("button", {
          name:
            language === "ru"
              ? "Русский"
              : language === "kk"
                ? "Қазақша"
                : "English",
        }),
      );
      for (let i = 0; i < 3; i++)
        await user.click(screen.getByRole("button", { name: t("Далее") }));
      expect(sent).toBeNull();
      await user.click(
        screen.getByRole("button", { name: t("Подтвердить и сохранить") }),
      );
      await waitFor(() => expect(saved).toHaveBeenCalledOnce());
      expect(sent).toMatchObject({
        estimate_location_id: 4,
        confidence: "estimate",
        products: [
          {
            name: "QA Bread",
            typical_sold: 0,
            typical_remaining: null,
            price: null,
          },
        ],
      });
      expect(sent).not.toHaveProperty("history");
      expect(
        screen.getByText(
          t("Анкета сохранена. Можно скачать Excel или перейти к анализу."),
        ),
      ).toBeInTheDocument();
    });
    it("requires a preview and explicit confirmation, then invalidates it when mapping changes", async () => {
      const t = locale(language),
        user = userEvent.setup(),
        saved = vi.fn();
      const writes: { path: string; body: FormData }[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          const path = new URL(url).pathname,
            body = init?.body as FormData;
          writes.push({ path, body });
          if (path.endsWith("/inspect"))
            return new Response(
              JSON.stringify({
                encoding: "utf-8",
                selected_sheet: "CSV",
                sheets: [
                  {
                    name: "CSV",
                    row_count: 1,
                    columns: ["date", "product", "sold"],
                    mapping: { date: "date", product: "product", sold: "sold" },
                  },
                ],
              }),
            );
          if (path.endsWith("/preview"))
            return new Response(
              JSON.stringify({
                preview_token: "reviewed-token",
                total_rows: 1,
                valid_rows: 1,
                duplicate_rows: 0,
                rejected_rows: 0,
                can_commit: true,
                errors: [],
                warnings: [
                  "Незаписанные дни не считаются нулевыми продажами. Явное значение 0 сохраняется как наблюдение.",
                ],
                preview_rows: [
                  {
                    row: 2,
                    status: "ready",
                    record: {
                      date: "2026-10-20",
                      product_name: "QA Bread",
                      sold: 0,
                      remaining: null,
                    },
                  },
                ],
              }),
            );
          if (path.endsWith("/commit"))
            return new Response(
              JSON.stringify({ imported_count: 1, duplicate_count: 0 }),
            );
          throw new Error(path);
        }),
      );
      render(
        <LanguageProvider>
          <ImportData state={state} onImported={saved} onProfile={vi.fn()} />
        </LanguageProvider>,
      );
      await user.upload(
        screen.getByLabelText(t("Файл с продажами")),
        new File(["date,product,sold\n2026-10-20,QA Bread,0"], "history.csv", {
          type: "text/csv",
        }),
      );
      await screen.findByText(t("Сопоставьте столбцы"));
      await user.type(
        screen.getByLabelText(t("Единица новых товаров без колонки единиц")),
        "pcs",
      );
      await user.click(
        screen.getByRole("button", { name: t("Проверить строки") }),
      );
      expect(
        await screen.findByRole("button", { name: t("Подтвердить импорт") }),
      ).toBeDisabled();
      await user.click(
        screen.getByRole("checkbox", {
          name: t(
            "Я проверил данные и подтверждаю сохранение. Исходный файл не изменится.",
          ),
        }),
      );
      fireEvent.change(
        screen.getByLabelText(t("Единица новых товаров без колонки единиц")),
        { target: { value: "g" } },
      );
      expect(
        screen.queryByRole("button", { name: t("Подтвердить импорт") }),
      ).not.toBeInTheDocument();
      expect(writes.some((w) => w.path.endsWith("/commit"))).toBe(false);
      await user.click(
        screen.getByRole("button", { name: t("Проверить строки") }),
      );
      await screen.findByRole("button", { name: t("Подтвердить импорт") });
      await user.click(
        screen.getByRole("checkbox", {
          name: t(
            "Я проверил данные и подтверждаю сохранение. Исходный файл не изменится.",
          ),
        }),
      );
      await user.click(
        screen.getByRole("button", { name: t("Подтвердить импорт") }),
      );
      await waitFor(() => expect(saved).toHaveBeenCalledOnce());
      const body = writes.at(-1)!.body;
      expect(body.get("preview_token")).toBe("reviewed-token");
      expect(body.get("confirm")).toBe("IMPORT SAQTA");
      expect(JSON.parse(String(body.get("options")))).toMatchObject({
        source_origin: "real",
        default_unit: "g",
        create_products: true,
        default_location_id: 4,
      });
    });
  },
);
