"use client";
import { useI18n } from "@/components/language-provider";

/** Stable API codes → Russian labels (translated through the i18n catalog). */
export const ALLERGENS = [
  ["gluten", "Глютен"],
  ["milk", "Молоко"],
  ["eggs", "Яйца"],
  ["nuts", "Орехи"],
  ["peanuts", "Арахис"],
  ["sesame", "Кунжут"],
  ["soy", "Соя"],
  ["mustard", "Горчица"],
  ["fish", "Рыба"],
  ["crustaceans", "Ракообразные"],
  ["molluscs", "Моллюски"],
  ["celery", "Сельдерей"],
  ["lupin", "Люпин"],
  ["sulphites", "Сульфиты"],
] as const;
export type AllergenCode = (typeof ALLERGENS)[number][0];
const labels = Object.fromEntries(ALLERGENS) as Record<string, string>;

/** null = the seller has not declared yet; [] = declared free of the listed allergens. */
export function AllergenPicker({
  value,
  onChange,
}: {
  value: string[] | null;
  onChange: (next: string[] | null) => void;
}) {
  const { t } = useI18n();
  const selected = new Set(value ?? []);
  const none = value !== null && value.length === 0;
  function toggle(code: string) {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(next.size ? [...next] : null);
  }
  return (
    <fieldset className="space-y-3">
      <legend className="label">{t("Аллергены")}</legend>
      <div className="flex flex-wrap gap-2">
        {ALLERGENS.map(([code, label]) => (
          <button
            key={code}
            type="button"
            aria-pressed={selected.has(code)}
            onClick={() => toggle(code)}
            className="allergen-chip"
          >
            {t(label)}
          </button>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={none}
          onChange={(e) => onChange(e.target.checked ? [] : null)}
        />
        {t("Не содержит аллергенов из списка")}
      </label>
    </fieldset>
  );
}

export function AllergenSummary({ allergens, ingredients }: { allergens: string[] | null | undefined; ingredients?: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2 text-sm">
      {ingredients ? (
        <p>
          <span className="font-semibold">{t("Состав")}:</span> {ingredients}
        </p>
      ) : null}
      {allergens == null ? (
        <p className="muted">{t("Аллергены не указаны продавцом. Уточните при получении.")}</p>
      ) : allergens.length === 0 ? (
        <p>{t("Продавец указал: без аллергенов из основного списка.")}</p>
      ) : (
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">{t("Аллергены")}:</span>
          {allergens.map((code) => (
            <span key={code} className="allergen-tag">{t(labels[code] ?? code)}</span>
          ))}
        </p>
      )}
    </div>
  );
}
