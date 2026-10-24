export type ListingCopyInput = {
  productName: string;
  unit: string;
  quantity: number;
  originalPriceKzt: number;
  discountedPriceKzt: number;
  pickupStart: string;
  pickupDeadline: string;
  location?: string;
  details?: string;
  availableQuantity?: number;
};

const money = (value: number) => `${new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: 0 }).format(value)} ₸`;
const time = (value: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Qyzylorda", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(value);

/** Template only: never infers composition, allergens, freshness or safety. */
export function generateListingCopy(input: ListingCopyInput): string {
  if (!input.productName.trim() || !input.unit.trim()) throw new Error("Выберите продукт с названием и единицей измерения.");
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error("Укажите целое количество больше нуля.");
  if (input.availableQuantity !== undefined && input.quantity > input.availableQuantity) throw new Error("Количество превышает свободный запас. Уменьшите его перед генерацией.");
  if (![input.originalPriceKzt, input.discountedPriceKzt].every(Number.isSafeInteger) || input.discountedPriceKzt <= 0 || input.discountedPriceKzt >= input.originalPriceKzt) throw new Error("Цена со скидкой должна быть больше нуля и ниже обычной цены.");
  const start = new Date(input.pickupStart), end = new Date(input.pickupDeadline);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new Error("Укажите корректное окно получения: окончание позже начала.");
  const discount = Math.round((1 - input.discountedPriceKzt / input.originalPriceKzt) * 100);
  const lines = [
    `${input.productName.trim()} · SAQTA Save`,
    `Количество: ${input.quantity} ${input.unit.trim()}`,
    `Обычная цена: ${money(input.originalPriceKzt)} за ${input.unit.trim()}`,
    `Цена со скидкой: ${money(input.discountedPriceKzt)} за ${input.unit.trim()} (−${discount}%)`,
    `Самовывоз: ${time(start)} — ${time(end)}. Время Астаны (UTC+5).`,
    ...(input.location?.trim() ? [`Место получения: ${input.location.trim()}`] : []),
    ...(input.details?.trim() ? [input.details.trim()] : []),
    "Оформите демо-заказ в SAQTA Save. Реальная оплата не проводится.",
  ];
  const copy = lines.join("\n");
  if (copy.length > 1000) throw new Error("Текст длиннее 1 000 символов. Сократите исходное описание.");
  return copy;
}
