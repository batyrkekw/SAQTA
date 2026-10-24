import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/app-shell", () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
import EconomicsPage from "../src/app/economics/page";

describe("interactive economics calculator", () => {
  it("updates financial results from editable inputs and restores defaults", () => {
    render(<EconomicsPage />);
    const contribution = screen.getByText("Маржинальный доход / месяц").parentElement!;
    expect(within(contribution).getByText(/21\s*000\s*₸/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Месячная подписка"), { target: { value: "60000" } });
    expect(within(contribution).getByText(/51\s*000\s*₸/)).toBeInTheDocument();
    expect(screen.getByText(/612\s*000\s*₸/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Сбросить допущения" }));
    expect(screen.getByLabelText("Месячная подписка")).toHaveValue(30_000);
    expect(within(contribution).getByText(/21\s*000\s*₸/)).toBeInTheDocument();
  });

  it("surfaces an unprofitable scenario and inconsistent acquisition assumptions", () => {
    render(<EconomicsPage />);
    fireEvent.change(screen.getByLabelText("Месячная подписка"), { target: { value: "0" } });
    expect(screen.getByText("Не достигается")).toBeInTheDocument();
    expect(screen.getByText(/Переменные расходы равны выручке/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ответы"), { target: { value: "201" } });
    expect(screen.getByText(/На одном из этапов значение больше предыдущего/)).toBeInTheDocument();
  });
});
