"use client";
import { useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Download,
  Plus,
  Trash2,
} from "lucide-react";
import { useI18n } from "@/components/language-provider";
import { Card, Field, Notice } from "@/components/ui";
import { api, downloadFile, errorMessage } from "@/lib/api";
import { formValidationMessage } from "@/lib/validation";
import type { Profile, EstimateProduct } from "./types";
const emptyProduct = (): EstimateProduct => ({
  name: "",
  category: "",
  unit: "",
  price: null,
  typical_produced: null,
  typical_sold: null,
  typical_remaining: null,
  frequency: "",
  shelf_life_days: null,
});
const initial: Profile = {
  schema_version: 1,
  business_type: "",
  locations_count: 1,
  categories: "",
  working_days: [0, 1, 2, 3, 4, 5, 6],
  hours: "",
  weekday_variation: "",
  products: [emptyProduct()],
  demand: "",
  weekend: "",
  peak_hours: "",
  seasonality: "",
  promotions: "",
  leftover_causes: "",
  holidays: "",
  weather: "",
  supply: "",
  price_changes: "",
  confidence: "estimate",
};
const steps = [
  "Ваш бизнес",
  "Продукты",
  "Спрос",
  "Внешние факторы",
  "Проверка",
];
export function Questionnaire({
  saved,
  locations,
  onSaved,
}: {
  saved: Profile | null;
  locations: { id: number; name: string }[];
  onSaved: () => void;
}) {
  const { t, number } = useI18n();
  const [profile, setProfile] = useState<Profile>(() =>
      saved
        ? {
            ...saved,
            estimate_location_id:
              saved.estimate_location_id ??
              (locations.length === 1 ? locations[0].id : null),
          }
        : {
            ...initial,
            estimate_location_id:
              locations.length === 1 ? locations[0].id : null,
          },
    ),
    [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [complete, setComplete] = useState(false),
    [bulk, setBulk] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const update = <K extends keyof Profile>(field: K, value: Profile[K]) => {
    setProfile((p) => ({ ...p, [field]: value }));
    setComplete(false);
  };
  function product(
    index: number,
    field: keyof EstimateProduct,
    value: string | number | null,
  ) {
    update(
      "products",
      profile.products.map((p, i) =>
        i === index ? { ...p, [field]: value } : p,
      ),
    );
  }
  function next() {
    const problem = form.current && formValidationMessage(form.current);
    if (problem) {
      setError(problem);
      return;
    }
    if (!profile.working_days.length) {
      setError("Выберите хотя бы один рабочий день");
      return;
    }
    setError("");
    setStep((s) => Math.min(4, s + 1));
  }
  function paste() {
    try {
      const rows = bulk
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((row) => {
          const [name, unit, price, produced, sold, remaining, category] =
            row.split("\t");
          const numeric = (v: string) => {
            if (!v?.trim()) return null;
            const n = Number(v.replace(",", "."));
            if (!Number.isInteger(n) || n < 0)
              throw new Error("Проверьте числа в списке товаров");
            return n;
          };
          return {
            ...emptyProduct(),
            name,
            unit: unit || "шт.",
            category: category || "Другое",
            price: numeric(price),
            typical_produced: numeric(produced),
            typical_sold: numeric(sold),
            typical_remaining: numeric(remaining),
          };
        });
      if (
        !rows.length ||
        rows.length + profile.products.filter((p) => p.name).length > 100
      )
        throw new Error("Можно добавить до 100 товаров");
      update("products", [...profile.products.filter((p) => p.name), ...rows]);
      setBulk("");
      setError("");
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (step !== 4) {
      next();
      return;
    }
    setPending(true);
    setError("");
    try {
      const { updated_at: unused, ...payload } = profile;
      void unused;
      await api("/analysis/profile", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setComplete(true);
      onSaved();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }
  async function exportBook() {
    try {
      await downloadFile("/analysis/profile.xlsx", "saqta-business.xlsx");
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }
  const textField = (field: keyof Profile, label: string, required = false) => (
    <Field key={field} label={t(label)}>
      <input
        className="field"
        value={String(profile[field] ?? "")}
        required={required}
        maxLength={field === "business_type" || field === "hours" ? 120 : 500}
        onChange={(e) => update(field, e.target.value as never)}
        placeholder={required ? undefined : t("Можно оставить пустым")}
      />
    </Field>
  );
  return (
    <Card>
      <div className="mb-7 flex flex-wrap gap-2">
        {steps.map((label, i) => (
          <span
            key={label}
            aria-current={step === i ? "step" : undefined}
            className={`rounded-full px-3 py-2 text-xs ${step === i ? "bg-[#123c2f] text-white" : "bg-[#f1f4eb] text-[#637369]"}`}
          >
            {i + 1}. {t(label)}
          </span>
        ))}
      </div>
      <form
        ref={form}
        noValidate
        onSubmit={(e) => void save(e)}
        className="space-y-5"
      >
        <h2 className="text-xl font-semibold">{t(steps[step])}</h2>
        {step === 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {textField("business_type", "Тип бизнеса", true)}
              <Field label={t("Количество точек")}>
                <input
                  className="field"
                  type="number"
                  min={1}
                  max={1000}
                  required
                  value={profile.locations_count}
                  onChange={(e) =>
                    update("locations_count", Number(e.target.value))
                  }
                />
              </Field>
              <Field label={t("Точка для оценок анкеты")}>
                <select
                  className="field"
                  required
                  value={profile.estimate_location_id ?? ""}
                  onChange={(e) =>
                    update(
                      "estimate_location_id",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                >
                  <option value="">{t("Выберите точку")}</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
              {textField("categories", "Основные категории")}
              {textField("hours", "Часы работы")}
              {textField(
                "weekday_variation",
                "Как меняется работа по дням недели?",
              )}
            </div>
            <fieldset>
              <legend className="label">{t("Рабочие дни")}</legend>
              <div className="flex flex-wrap gap-2">
                {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((label, i) => (
                  <label
                    key={label}
                    className="flex items-center gap-2 rounded-lg border border-[#dfe6db] p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={profile.working_days.includes(i)}
                      onChange={(e) =>
                        update(
                          "working_days",
                          e.target.checked
                            ? [...profile.working_days, i]
                            : profile.working_days.filter((day) => day !== i),
                        )
                      }
                    />
                    {t(label)}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}
        {step === 1 && (
          <>
            <Notice>
              {t(
                "Укажите типичный день. Пустое поле означает «не знаю», а ноль — отсутствие продаж или остатков. Эти ответы сохранятся как оценки.",
              )}
            </Notice>
            {profile.products.map((p, i) => (
              <fieldset
                key={i}
                className="rounded-2xl border border-[#dfe6db] p-4"
              >
                <legend className="px-2 text-sm font-semibold">
                  {t("Товар")} {i + 1}
                </legend>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      ["name", "Название продукта"],
                      ["category", "Категория"],
                      ["unit", "Единица измерения"],
                      ["frequency", "Как часто пополняете запас?"],
                    ] as const
                  ).map(([field, label]) => (
                    <Field key={field} label={t(label)}>
                      <input
                        className="field"
                        value={p[field]}
                        maxLength={
                          field === "unit"
                            ? 20
                            : field === "category"
                              ? 60
                              : 120
                        }
                        required={field !== "frequency"}
                        onChange={(e) => product(i, field, e.target.value)}
                      />
                    </Field>
                  ))}
                  {(
                    [
                      ["price", "Цена, ₸"],
                      ["typical_produced", "Обычно произведено или закуплено"],
                      ["typical_sold", "Обычно продано"],
                      ["typical_remaining", "Обычно остаётся"],
                      ["shelf_life_days", "Срок хранения, дней"],
                    ] as const
                  ).map(([field, label]) => (
                    <Field key={field} label={t(label)}>
                      <input
                        className="field"
                        type="number"
                        min={field === "shelf_life_days" ? 1 : 0}
                        max={field === "shelf_life_days" ? 3650 : 1000000}
                        value={p[field] ?? ""}
                        placeholder={t("Не знаю")}
                        onChange={(e) =>
                          product(
                            i,
                            field,
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                          )
                        }
                      />
                    </Field>
                  ))}
                </div>
                <div className="mt-4 flex gap-4">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs"
                    disabled={profile.products.length >= 100}
                    onClick={() =>
                      update("products", [
                        ...profile.products,
                        { ...p, name: "" },
                      ])
                    }
                  >
                    <Copy size={14} />
                    {t("Копировать")}
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs"
                    disabled={profile.products.length === 1}
                    onClick={() =>
                      update(
                        "products",
                        profile.products.filter((_, j) => i !== j),
                      )
                    }
                  >
                    <Trash2 size={14} />
                    {t("Удалить")}
                  </button>
                </div>
              </fieldset>
            ))}
            <button
              type="button"
              className="btn-secondary"
              disabled={profile.products.length >= 100}
              onClick={() =>
                update("products", [...profile.products, emptyProduct()])
              }
            >
              <Plus size={16} />
              {t("Добавить товар")}
            </button>
            <details className="rounded-xl bg-[#f4f6ef] p-4 text-sm">
              <summary>{t("Добавить несколько товаров из таблицы")}</summary>
              <p className="my-3 text-xs muted">
                {t(
                  "Вставьте строки с разделителем табуляция: название, единица, цена, произведено, продано, остаток, категория.",
                )}
              </p>
              <textarea
                className="field"
                rows={4}
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                aria-label={t("Список товаров")}
              />
              <button
                type="button"
                className="btn-secondary mt-3"
                onClick={paste}
                disabled={!bulk.trim()}
              >
                {t("Добавить строки")}
              </button>
            </details>
          </>
        )}
        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {textField("demand", "Как меняется спрос?")}
            {textField("weekend", "Спрос в выходные")}
            {textField("peak_hours", "Часы наибольшего спроса")}
            {textField("seasonality", "Сезонные изменения")}
            {textField("promotions", "Скидки и акции")}
            {textField("leftover_causes", "Почему остаются продукты?")}
          </div>
        )}
        {step === 3 && (
          <>
            <p className="text-sm muted">
              {t("Необязательно. Укажите только известные вам факторы.")}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {textField("holidays", "Влияние праздников")}
              {textField("weather", "Влияние погоды")}
              {textField("supply", "Перебои поставок")}
              {textField("price_changes", "Изменения цен")}
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <dl className="grid gap-4 rounded-xl bg-[#f3f6ec] p-5 sm:grid-cols-3">
              <div>
                <dt className="text-xs muted">{t("Тип бизнеса")}</dt>
                <dd>{profile.business_type}</dd>
              </div>
              <div>
                <dt className="text-xs muted">{t("Количество точек")}</dt>
                <dd>{number(profile.locations_count)}</dd>
              </div>
              <div>
                <dt className="text-xs muted">{t("Товаров")}</dt>
                <dd>{profile.products.length}</dd>
              </div>
            </dl>
            <div className="overflow-auto">
              <table>
                <thead>
                  <tr>
                    {[
                      "Товар",
                      "Единица",
                      "Обычно продано",
                      "Обычно остаётся",
                    ].map((label) => (
                      <th key={label}>{t(label)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {profile.products.map((p, i) => (
                    <tr key={i}>
                      <td>{p.name}</td>
                      <td>{t(p.unit)}</td>
                      <td>{p.typical_sold ?? t("Не знаю")}</td>
                      <td>{p.typical_remaining ?? t("Не знаю")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Field label={t("Насколько уверены в ответах?")}>
              <select
                className="field"
                value={profile.confidence}
                onChange={(e) =>
                  update("confidence", e.target.value as Profile["confidence"])
                }
              >
                <option value="estimate">
                  {t("Это приблизительные оценки")}
                </option>
                <option value="unknown">{t("Пока не могу оценить")}</option>
              </select>
            </Field>
            <Notice>
              {t(
                "Анкета не заменяет историю продаж. Первые рекомендации будут предварительными, без оценки точности.",
              )}
            </Notice>
          </>
        )}
        {error && <Notice kind="error">{t(error)}</Notice>}
        {complete && (
          <Notice kind="success">
            {t("Анкета сохранена. Можно скачать Excel или перейти к анализу.")}
          </Notice>
        )}
        <div className="flex flex-wrap justify-between gap-3 border-t border-[#e5e9e0] pt-5">
          <button
            type="button"
            className="btn-secondary"
            disabled={step === 0 || pending}
            onClick={() => {
              setStep((s) => s - 1);
              setError("");
            }}
          >
            <ArrowLeft size={15} />
            {t("Назад")}
          </button>
          <div className="flex flex-wrap gap-3">
            {complete && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void exportBook()}
              >
                <Download size={15} />
                {t("Скачать Excel")}
              </button>
            )}
            <button
              key={step === 4 ? "save" : "next"}
              type={step === 4 ? "submit" : "button"}
              className="btn-primary"
              disabled={pending}
              onClick={
                step < 4
                  ? (event) => {
                      event.preventDefault();
                      next();
                    }
                  : undefined
              }
            >
              {t(
                pending
                  ? "Сохраняем…"
                  : step === 4
                    ? "Подтвердить и сохранить"
                    : "Далее",
              )}
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </form>
    </Card>
  );
}
