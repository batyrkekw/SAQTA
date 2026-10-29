"use client";
import { useState, type ChangeEvent } from "react";
import { Check, FileSpreadsheet, Upload } from "lucide-react";
import { useI18n } from "@/components/language-provider";
import { Card, Field, Notice } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { ImportCommit, ImportPreview } from "@/types/imports";
import type { AnalysisState, Profile } from "./types";
type Sheet = {
  name: string;
  columns: string[];
  row_count: number;
  mapping: Record<string, string>;
};
type Inspection = {
  sheets: Sheet[];
  selected_sheet: string;
  encoding: string;
  sample_rows: { row: number; values: Record<string, string> }[];
};
const fields: Record<string, string> = {
  date: "Дата",
  product: "Товар",
  sold: "Продано",
  location: "Точка",
  remaining: "Конечный остаток",
  produced: "Произведено",
  unit: "Единица измерения",
  unit_price_kzt: "Цена, ₸",
  opening: "Начальный остаток",
  waste: "Списано",
  revenue: "Выручка",
  category: "Категория",
  discount: "Скидка",
  weather: "Погода",
  holiday: "Праздник",
  weekday: "День недели",
};
export function ImportData({
  state,
  onImported,
  onProfile,
}: {
  state: AnalysisState;
  onImported: () => void;
  onProfile: (profile: Profile) => void;
}) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null),
    [inspection, setInspection] = useState<Inspection | null>(null),
    [sheet, setSheet] = useState(""),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [preview, setPreview] = useState<ImportPreview | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [result, setResult] = useState<ImportCommit | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [dateFormat, setDateFormat] = useState("iso"),
    [numberFormat, setNumberFormat] = useState("dot"),
    [location, setLocation] = useState(
      state.locations.length === 1 ? String(state.locations[0].id) : "",
    ),
    [product, setProduct] = useState(""),
    [create, setCreate] = useState(true),
    [unit, setUnit] = useState("");
  function invalidate() {
    setPreview(null);
    setConfirmed(false);
    setResult(null);
    setError("");
  }
  async function inspect(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    invalidate();
    setFile(null);
    setInspection(null);
    if (selected.size > 2 * 1024 * 1024) {
      setError("Максимальный размер файла — 2 МБ");
      return;
    }
    setPending(true);
    try {
      const body = new FormData();
      body.set("file", selected);
      body.set("source_origin", "real");
      const value = await api<Inspection>("/imports/inspect", {
        method: "POST",
        body,
      });
      setFile(selected);
      setInspection(value);
      setSheet(value.selected_sheet);
      setMapping(
        value.sheets.find((s) => s.name === value.selected_sheet)?.mapping ||
          {},
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }
  function body() {
    const form = new FormData();
    form.set("file", file!);
    form.set(
      "options",
      JSON.stringify({
        source_origin: "real",
        mode: "observations",
        sheet,
        column_mapping: mapping,
        date_format: dateFormat,
        number_format: numberFormat,
        source_label: file!.name.slice(0, 120),
        create_products: create,
        default_unit: unit || null,
        ...(location && !mapping.location
          ? { default_location_id: Number(location) }
          : {}),
        ...(product && !mapping.product
          ? { default_product_id: Number(product) }
          : {}),
      }),
    );
    return form;
  }
  async function check() {
    setPending(true);
    setError("");
    try {
      setPreview(
        await api<ImportPreview>("/imports/preview", {
          method: "POST",
          body: body(),
        }),
      );
      setConfirmed(false);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }
  async function commit() {
    if (!preview || !confirmed) return;
    setPending(true);
    setError("");
    try {
      const form = body();
      form.set("preview_token", preview.preview_token);
      form.set("confirm", "IMPORT SAQTA");
      const saved = await api<ImportCommit>("/imports/commit", {
        method: "POST",
        body: form,
      });
      setResult(saved);
      setPreview(null);
      setConfirmed(false);
      onImported();
    } catch (reason) {
      setError(errorMessage(reason));
      setPreview(null);
    } finally {
      setPending(false);
    }
  }
  async function importProfile() {
    if (!file) return;
    setPending(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const p = await api<Profile>("/analysis/profile/inspect", {
        method: "POST",
        body: form,
      });
      onProfile(p);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }
  const columns =
    inspection?.sheets.find((s) => s.name === sheet)?.columns || [];
  function mappingField(field: string) {
    return (
      <Field
        key={field}
        label={
          t(fields[field]) + (field === "date" || field === "sold" ? " *" : "")
        }
      >
        <select
          className="field"
          value={mapping[field] || ""}
          disabled={pending}
          onChange={(e) => {
            const next = { ...mapping };
            if (e.target.value) next[field] = e.target.value;
            else delete next[field];
            setMapping(next);
            invalidate();
          }}
        >
          <option value="">{t("Не сопоставлено")}</option>
          {columns.map((column) => (
            <option key={column} value={column}>
              {column}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  return (
    <Card>
      <div className="mb-5 flex items-center gap-3">
        <span className="rounded-xl bg-[#eef4e4] p-3 text-[#237a57]">
          <FileSpreadsheet size={24} />
        </span>
        <div>
          <h2 className="font-semibold">{t("Загрузить Excel или CSV")}</h2>
          <p className="mt-1 text-xs muted">
            {t("Файл → столбцы → проверка → сохранение")}
          </p>
        </div>
      </div>
      <label className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed border-[#adc19f] bg-[#f7f9f1] p-8 text-center">
        <Upload size={27} className="text-[#65824a]" />
        <span className="text-sm font-medium">
          {t("Выберите файл с ежедневными продажами")}
        </span>
        <span className="text-xs muted">CSV / XLSX · 2 MB</span>
        <input
          aria-label={t("Файл с продажами")}
          type="file"
          accept=".csv,.xlsx"
          disabled={pending}
          onChange={(e) => void inspect(e)}
          className="max-w-full text-xs"
        />
      </label>
      {inspection && (
        <div className="mt-6 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Field label={t("Лист таблицы")}>
              <select
                className="field"
                value={sheet}
                disabled={pending}
                onChange={(e) => {
                  setSheet(e.target.value);
                  setMapping(
                    inspection.sheets.find((s) => s.name === e.target.value)
                      ?.mapping || {},
                  );
                  invalidate();
                }}
              >
                {inspection.sheets.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} · {s.row_count}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-xs muted">
              {file?.name} · {inspection.encoding}
            </p>
          </div>
          {inspection.sheets.some((s) => s.name === "Business") && (
            <Notice>
              <p>
                {t(
                  "В книге найдена анкета SAQTA. Её можно открыть для проверки отдельно от истории продаж.",
                )}
              </p>
              <button
                className="mt-2 underline"
                disabled={pending}
                onClick={() => void importProfile()}
              >
                {t("Открыть анкету из Excel")}
              </button>
            </Notice>
          )}
          <h3 className="font-medium">{t("Сопоставьте столбцы")}</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              "date",
              "product",
              "sold",
              "location",
              "remaining",
              "produced",
            ].map(mappingField)}
          </div>
          <details>
            <summary className="cursor-pointer text-sm text-[#237a57]">
              {t("Дополнительные столбцы и форматы")}
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.keys(fields)
                .filter(
                  (f) =>
                    ![
                      "date",
                      "product",
                      "sold",
                      "location",
                      "remaining",
                      "produced",
                    ].includes(f),
                )
                .map(mappingField)}
              <Field label={t("Формат даты")}>
                <select
                  value={dateFormat}
                  className="field"
                  disabled={pending}
                  onChange={(e) => {
                    setDateFormat(e.target.value);
                    invalidate();
                  }}
                >
                  <option value="iso">YYYY-MM-DD</option>
                  <option value="dmy">DD.MM.YYYY</option>
                </select>
              </Field>
              <Field label={t("Десятичный разделитель")}>
                <select
                  value={numberFormat}
                  className="field"
                  disabled={pending}
                  onChange={(e) => {
                    setNumberFormat(e.target.value);
                    invalidate();
                  }}
                >
                  <option value="dot">{t("Точка")}</option>
                  <option value="comma">{t("Запятая")}</option>
                </select>
              </Field>
            </div>
          </details>
          <div className="grid gap-4 sm:grid-cols-2">
            {!mapping.location && (
              <Field label={t("Точка для всего файла")}>
                <select
                  className="field"
                  value={location}
                  disabled={pending}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    invalidate();
                  }}
                >
                  <option value="">{t("Выберите точку")}</option>
                  {state.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {!mapping.product && (
              <Field label={t("Товар для всего файла")}>
                <select
                  className="field"
                  value={product}
                  disabled={pending}
                  onChange={(e) => {
                    setProduct(e.target.value);
                    invalidate();
                  }}
                >
                  <option value="">{t("Выберите товар")}</option>
                  {state.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={create}
              disabled={pending}
              onChange={(e) => {
                setCreate(e.target.checked);
                invalidate();
              }}
            />
            {t("Создать отсутствующие товары из названий в файле")}
          </label>
          {create && !mapping.unit && (
            <Field label={t("Единица новых товаров без колонки единиц")}>
              <input
                className="field"
                value={unit}
                maxLength={20}
                placeholder={t("Например: шт., кг, г")}
                onChange={(e) => {
                  setUnit(e.target.value);
                  invalidate();
                }}
              />
            </Field>
          )}
          <p className="text-xs muted">
            {t(
              "Количество указывается целыми единицами. Для дробного веса используйте граммы. Неизвестные цены и остатки остаются пустыми.",
            )}
          </p>
          <button
            className="btn-primary"
            disabled={pending || !mapping.date || !mapping.sold}
            onClick={() => void check()}
          >
            {t(pending ? "Проверяем…" : "Проверить строки")}
          </button>
        </div>
      )}
      {preview && (
        <div className="mt-6 space-y-4 border-t border-[#dfe6db] pt-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Всего строк", preview.total_rows],
              ["Готовы к импорту", preview.valid_rows],
              ["Дубликаты", preview.duplicate_rows],
              ["Ошибки", preview.rejected_rows],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-[#f3f6ed] p-4">
                <p className="text-xs muted">{t(label)}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          {preview.errors.length > 0 && (
            <Notice kind="error">
              <ul className="space-y-2">
                {preview.errors.map((issue, i) => (
                  <li key={i}>
                    {t("Строка")} {issue.row}: {t(issue.message)}
                  </li>
                ))}
              </ul>
            </Notice>
          )}
          {preview.warnings.length > 0 && (
            <details className="rounded-xl bg-[#f3f6ed] p-4 text-xs">
              <summary>
                {t("Что нужно проверить")} · {preview.warnings.length}
              </summary>
              <ul className="mt-3 space-y-2">
                {preview.warnings.map((warning, i) => (
                  <li key={i}>{t(warning)}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="max-h-72 overflow-auto">
            <table>
              <thead>
                <tr>
                  {[
                    "Строка",
                    "Дата",
                    "Товар",
                    "Продано",
                    "Остаток",
                    "Статус",
                  ].map((label) => (
                    <th key={label}>{t(label)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.preview_rows.map((row) => (
                  <tr key={row.row}>
                    <td>{row.row}</td>
                    <td>{row.record?.date ?? "—"}</td>
                    <td>{row.record?.product_name ?? "—"}</td>
                    <td>{row.record?.sold ?? "—"}</td>
                    <td>{row.record?.remaining ?? "—"}</td>
                    <td>
                      {t(
                        row.status === "ready"
                          ? "Готово"
                          : row.status === "duplicate"
                            ? "Дубликат"
                            : "Ошибка",
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.can_commit ? (
            <>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  disabled={pending}
                />
                {t(
                  "Я проверил данные и подтверждаю сохранение. Исходный файл не изменится.",
                )}
              </label>
              <button
                className="btn-primary"
                disabled={!confirmed || pending}
                onClick={() => void commit()}
              >
                <Check size={16} />
                {t(pending ? "Сохраняем…" : "Подтвердить импорт")}
              </button>
            </>
          ) : (
            !preview.errors.length && (
              <Notice>
                {t("Все строки уже сохранены. Повторный импорт не нужен.")}
              </Notice>
            )
          )}
        </div>
      )}
      {result && (
        <div className="mt-5">
          <Notice kind="success">
            {t("Импорт завершён")} · {result.imported_count} {t("записей")}.{" "}
            {t("Теперь можно запустить анализ.")}
          </Notice>
        </div>
      )}
      {error && (
        <div className="mt-5">
          <Notice kind="error">{t(error)}</Notice>
        </div>
      )}
    </Card>
  );
}
