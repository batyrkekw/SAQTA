import { formatters,locales,translateText,type Language } from "./i18n/translate";

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


/** Template only: never infers composition, allergens, freshness or safety. */
export function generateListingCopy(input: ListingCopyInput, language: Language = "ru"): string {
  const { money, pickupTime } = formatters(language);
  const time = (value: Date) => language === "kk" ? pickupTime(value.toISOString()).replace(", ", ` ${value.getUTCFullYear()}, `) : new Intl.DateTimeFormat(locales[language], { timeZone: "Asia/Almaty", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(value);
  const tr = (text: string) => translateText(text, language);
  if (!input.productName.trim() || !input.unit.trim()) throw new Error("Выберите продукт с названием и единицей измерения.");
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error("Укажите целое количество больше нуля.");
  if (input.availableQuantity !== undefined && input.quantity > input.availableQuantity) throw new Error("Количество превышает свободный запас. Уменьшите его перед генерацией.");
  if (![input.originalPriceKzt, input.discountedPriceKzt].every(Number.isSafeInteger) || input.discountedPriceKzt <= 0 || input.discountedPriceKzt >= input.originalPriceKzt) throw new Error("Цена со скидкой должна быть больше нуля и ниже обычной цены.");
  const start = new Date(input.pickupStart), end = new Date(input.pickupDeadline);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new Error("Укажите корректное окно получения: окончание позже начала.");
  const discount = Math.round((1 - input.discountedPriceKzt / input.originalPriceKzt) * 100);
  const unit = tr(input.unit.trim());
  const lines = [
    `${input.productName.trim()} · SAQTA Save`,
    tr(`Количество: ${input.quantity} ${unit}`),
    tr(`Обычная цена: ${money(input.originalPriceKzt)} за ${unit}`),
    tr(`Цена со скидкой: ${money(input.discountedPriceKzt)} за ${unit} (−${discount}%)`),
    tr(`Самовывоз: ${time(start)} — ${time(end)}. Время Астаны (UTC+5).`),
    ...(input.location?.trim() ? [tr(`Место получения: ${input.location.trim()}`)] : []),
    ...(input.details?.trim() ? [input.details.trim()] : []),
    tr("Оформите демо-заказ в SAQTA Save. Реальная оплата не проводится."),
  ];
  const copy = lines.join("\n");
  if (copy.length > 1000) throw new Error("Текст длиннее 1 000 символов. Сократите исходное описание.");
  return copy;
}
