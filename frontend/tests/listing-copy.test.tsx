import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { generateListingCopy, type ListingCopyInput } from "../src/lib/listing-copy";
import { ListingCopyGenerator } from "../src/features/save/listing-copy-generator";

const input: ListingCopyInput = { productName: "Круассан", unit: "шт.", quantity: 2, originalPriceKzt: 750, discountedPriceKzt: 375, pickupStart: "2026-10-24T08:00:00Z", pickupDeadline: "2026-10-24T10:00:00Z", availableQuantity: 3 };

describe("deterministic Save listing copy", () => {
  it("uses entered quantities, actual prices and Astana time without fabricated product claims", () => {
    const text = generateListingCopy(input);
    expect(text).toBe(generateListingCopy(input));
    expect(text).toContain("Круассан · SAQTA Save");
    expect(text).toContain("Количество: 2 шт.");
    expect(text).toContain("750 ₸"); expect(text).toContain("375 ₸"); expect(text).toContain("−50%");
    expect(text).toContain("13:00"); expect(text).toContain("15:00");
    expect(text).not.toMatch(/свеж|сертифик|аллерген|состав|срок годности|качество/i);
  });
  it("includes supplied details verbatim only when provided", () => {
    expect(generateListingCopy({ ...input, details: "Состав указан пекарней: мука и вода.", location: "Демо-точка" })).toContain("Состав указан пекарней: мука и вода.");
    expect(generateListingCopy(input)).not.toContain("Место получения:");
  });
  it.each([
    { quantity: 0 }, { quantity: 1.5 }, { quantity: 4 }, { discountedPriceKzt: 750 },
    { discountedPriceKzt: -1 }, { pickupDeadline: "invalid" }, { pickupDeadline: input.pickupStart },
  ])("rejects invalid or unsupported advertising inputs %j", change => {
    expect(() => generateListingCopy({ ...input, ...change })).toThrow();
  });
  it("does not silently truncate user details", () => {
    expect(() => generateListingCopy({ ...input, details: "А".repeat(1000) })).toThrow(/1 000/);
  });
  it("allows review, edit, copy and explicit insertion without publishing", async () => {
    const onUse = vi.fn(), writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ListingCopyGenerator input={input} onUse={onUse}/>);
    fireEvent.click(screen.getByRole("button", { name: "Сгенерировать текст" }));
    expect(onUse).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Черновик объявления/), { target: { value: "Отредактированный черновик" } });
    fireEvent.click(screen.getByRole("button", { name: "Скопировать" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Отредактированный черновик"));
    fireEvent.click(screen.getByRole("button", { name: "Использовать в описании" }));
    expect(onUse).toHaveBeenCalledWith("Отредактированный черновик");
    expect(screen.getByText(/публикация выполняется отдельно|Черновик вставлен в описание/)).toBeInTheDocument();
  });
  it("surfaces copy failures without claiming success", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) }, configurable: true });
    render(<ListingCopyGenerator input={input} onUse={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button", { name: "Сгенерировать текст" }));
    fireEvent.click(screen.getByRole("button", { name: "Скопировать" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("скопируйте вручную");
  });
});
