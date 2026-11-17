import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import { HomeDay } from "../src/components/home-day";
import { LANGUAGE_STORAGE_KEY, LanguageProvider } from "../src/components/language-provider";
import { LanguageSwitcher } from "../src/components/language-switcher";
import { translateText } from "../src/lib/i18n/translate";

function resetLanguage() {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent("storage", { key: LANGUAGE_STORAGE_KEY }));
}
beforeEach(resetLanguage);
afterEach(() => act(resetLanguage));

function showDay(withLanguages = false) {
  return render(<LanguageProvider>{withLanguages ? <LanguageSwitcher /> : null}<HomeDay /></LanguageProvider>);
}

describe("interactive bakery day", () => {
  it("connects each illustrative stage to the relevant real tool", async () => {
    const user = userEvent.setup();
    showDay();
    expect(screen.getByText("Пример рабочего дня")).toBeInTheDocument();
    expect(screen.getByText("Учебный пример. Отметки не сохраняются и не меняют данные пекарни.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Утро/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Перейти в Forecast" })).toHaveAttribute("href", "/forecast");
    await user.click(screen.getByRole("button", { name: /День/ }));
    expect(screen.getByRole("heading", { name: "Проверьте, как идёт день." })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Записать фактические продажи" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Вечер/ }));
    expect(screen.getByRole("heading", { name: "Дайте остаткам новый шанс." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти в Save" })).toHaveAttribute("href", "/save");
    expect(screen.queryByRole("link", { name: "Перейти в Forecast" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("keeps independent stage checklists and clears all of them on reset", async () => {
    const user = userEvent.setup();
    showDay();
    expect(screen.getByRole("button", { name: "Сбросить весь пример" })).toBeDisabled();
    await user.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "1");
    expect(screen.getByRole("status")).toHaveTextContent("Отмечено: 1 из 3");
    await user.click(screen.getByRole("button", { name: /Вечер/ }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "0");
    await user.click(screen.getAllByRole("checkbox")[1]);
    await user.click(screen.getByRole("button", { name: /Утро/ }));
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
    expect(screen.getAllByRole("checkbox")[1]).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Сбросить весь пример" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "0");
    await user.click(screen.getByRole("button", { name: /Вечер/ }));
    expect(screen.getAllByRole("checkbox")[1]).not.toBeChecked();
    expect(screen.getByRole("button", { name: /Вечер/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Сбросить весь пример" })).toBeDisabled();
  });

  it("supports the whole interaction with native keyboard controls", async () => {
    const user = userEvent.setup();
    showDay();
    await user.tab();
    expect(screen.getByRole("button", { name: /Утро/ })).toHaveFocus();
    await user.tab();
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: /День/ })).toHaveAttribute("aria-pressed", "true");
    await user.tab();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: /Вечер/ })).toHaveAttribute("aria-pressed", "true");
    await user.tab();
    expect(screen.getByRole("link", { name: "Перейти в Save" })).toHaveFocus();
    await user.tab();
    await user.keyboard(" ");
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "1");
  });

  it("updates completion feedback when tasks are checked or unchecked", async () => {
    const user = userEvent.setup();
    showDay();
    for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "3");
    expect(screen.getByText("Все шаги отмечены. Перейдите к инструменту или изучите другой этап дня.")).toBeInTheDocument();
    await user.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "2");
    expect(screen.getByText("У каждого этапа свой список. Переключайте время — отметки останутся до обновления страницы.")).toBeInTheDocument();
  });

  it("translates every stage and keeps selections across language changes", async () => {
    const user = userEvent.setup();
    showDay(true);
    await user.click(screen.getByRole("button", { name: /Вечер/ }));
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: "English" }));
    const section = screen.getByRole("region", { name: /From the first plan/ });
    expect(section.textContent).not.toMatch(/[А-Яа-яЁё]/);
    expect(within(section).getByRole("button", { name: /Evening/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(section).getAllByRole("checkbox")[0]).toBeChecked();
    await user.click(within(section).getByRole("button", { name: /07:00/ }));
    expect(section.textContent).not.toMatch(/[А-Яа-яЁё]/);
    await user.click(within(section).getByRole("button", { name: /14:00/ }));
    expect(section.textContent).not.toMatch(/[А-Яа-яЁё]/);
    await user.click(screen.getByRole("button", { name: "Қазақша" }));
    expect(within(section).getByRole("heading", { name: translateText("Проверьте, как идёт день.", "kk") })).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: /14:00/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Русский" }));
    await user.click(screen.getByRole("button", { name: /Вечер/ }));
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
  });

  it("does not persist practice marks after the component is reopened", async () => {
    const user = userEvent.setup();
    const view = showDay();
    await user.click(screen.getAllByRole("checkbox")[0]);
    view.unmount();
    showDay();
    expect(screen.getAllByRole("checkbox")[0]).not.toBeChecked();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "0");
  });
});
