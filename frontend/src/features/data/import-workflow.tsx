"use client";

import { useRef, useState } from "react";
import { CheckCheck, FileCheck2, FileUp, LoaderCircle, ShieldAlert } from "lucide-react";
import { Badge, Field, Notice, number } from "@/components/ui";
import { ApiError, api, errorMessage, useApi, useReference } from "@/lib/api";
import type { RecordKind, Settings } from "@/types/api";
import type { ColumnMapping, ImportCommit, ImportInspection, ImportOptions, ImportPreview, ImportTarget, SourceOrigin } from "@/types/imports";

const MAX_BYTES = 2 * 1024 * 1024;
const TARGETS: { key: ImportTarget; label: string; hint: string }[] = [
  { key: "date", label: "Дата *", hint: "Дата операции без времени" },
  { key: "quantity", label: "Количество *", hint: "Положительное целое число; без округления" },
  { key: "kind", label: "Тип записи", hint: "production / sales / waste или русское название" },
  { key: "product", label: "Товар", hint: "ID или точное название из каталога" },
  { key: "location", label: "Точка", hint: "ID или точное название точки" },
  { key: "unit", label: "Единица измерения", hint: "Должна совпадать с каталогом; пересчёта кг в штуки нет" },
  { key: "unit_price_kzt", label: "Цена продажи, ₸", hint: "Необязательно; целые тенге" },
  { key: "reason", label: "Причина списания", hint: "Обязательна для списаний" },
];
const KIND_LABELS: Record<RecordKind, string> = { production: "Производство", sales: "Продажи", waste: "Списание" };
const ROW_STATUS = { ready: "Готово", duplicate: "Дубликат", error: "Ошибка" } as const;

function classificationLabel(value: ImportInspection["classification"]) {
  return value === "survey" ? "Анкета / опрос" : value === "daily_records_candidate" ? "Похоже на ежедневный журнал" : "Нужно уточнить структуру";
}

export function ImportWorkflow({ onImported }: { onImported?: () => void }) {
  const settings = useApi<Settings>("/settings");
  const reference = useReference();
  const fileInput = useRef<HTMLInputElement>(null);
  const [origin, setOrigin] = useState<SourceOrigin | "">("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<ImportInspection | null>(null);
  const [sheet, setSheet] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [defaultKind, setDefaultKind] = useState<RecordKind | "">("");
  const [defaultProduct, setDefaultProduct] = useState("");
  const [defaultLocation, setDefaultLocation] = useState("");
  const [dateFormat, setDateFormat] = useState<"iso" | "dmy">("iso");
  const [numberFormat, setNumberFormat] = useState<"dot" | "comma">("dot");
  const [sourceLabel, setSourceLabel] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<ImportCommit | null>(null);
  const [pending, setPending] = useState<"inspect" | "preview" | "commit" | null>(null);
  const [error, setError] = useState("");
  const [requestErrors, setRequestErrors] = useState<{ row: number; message: string }[]>([]);

  const workspace = settings.data?.workspace_mode;
  const sourceMatches = Boolean(origin && workspace && origin === workspace);
  const canChoose = sourceMatches && acknowledged && !settings.loading && !settings.error && !pending;
  const selectedSheet = inspection?.sheets.find(value => value.name === sheet);
  const columns = selectedSheet?.columns || [];
  const firstSheet = sheet === inspection?.selected_sheet;
  const survey = Boolean(firstSheet && inspection?.classification === "survey");
  const hasRequiredMapping = Boolean(mapping.date && mapping.quantity && (mapping.kind || defaultKind) && (mapping.product || defaultProduct) && (mapping.location || defaultLocation));
  const canPreview = Boolean(canChoose && file && inspection && hasRequiredMapping && !survey && !reference.loading && !reference.error);

  function invalidatePreview() {
    setPreview(null); setConfirmed(false); setResult(null); setError(""); setRequestErrors([]);
  }
  function clearFile() {
    setFile(null); setInspection(null); setSheet(""); setMapping({}); invalidatePreview();
    setDefaultKind(""); setDefaultProduct(""); setDefaultLocation(""); setSourceLabel(""); setDateFormat("iso"); setNumberFormat("dot");
    if (fileInput.current) fileInput.current.value = "";
  }
  function changeOrigin(value: SourceOrigin | "") {
    setOrigin(value); setAcknowledged(false); clearFile();
  }
  function showRequestError(reason: unknown) {
    setError(errorMessage(reason)); setRequestErrors(reason instanceof ApiError ? reason.rows : []);
  }
  async function inspectFile(selected: File | undefined) {
    if (!selected) return;
    clearFile();
    if (!canChoose || !origin) { setError("Сначала явно укажите происхождение файла и подтвердите безопасную загрузку."); return; }
    if (!/\.(csv|xlsx)$/i.test(selected.name)) { setError("Выберите CSV или XLSX. Форматы XLS и XLSM не поддерживаются."); return; }
    if (selected.size > MAX_BYTES) { setError("Максимальный размер файла — 2 МБ. Разделите исходную таблицу, сохранив оригинал."); return; }
    setPending("inspect");
    const body = new FormData(); body.set("file", selected); body.set("source_origin", origin);
    try {
      const value = await api<ImportInspection>("/imports/inspect", { method: "POST", body });
      if (value.source_origin !== origin || value.workspace_mode !== origin) throw new Error("Сервер вернул другой источник данных. Загрузка остановлена; проверьте рабочее пространство.");
      setFile(selected); setInspection(value); setSheet(value.selected_sheet); setMapping(value.suggested_mapping);
    } catch (reason) { showRequestError(reason); }
    finally { setPending(null); }
  }
  function currentOptions(): ImportOptions | null {
    if (!origin) return null;
    return { source_origin: origin, sheet, column_mapping: mapping,
      ...(defaultKind && !mapping.kind ? { default_kind: defaultKind } : {}),
      ...(defaultProduct && !mapping.product ? { default_product_id: Number(defaultProduct) } : {}),
      ...(defaultLocation && !mapping.location ? { default_location_id: Number(defaultLocation) } : {}),
      date_format: dateFormat, number_format: numberFormat, ...(sourceLabel.trim() ? { source_label: sourceLabel.trim() } : {}) };
  }
  function requestBody(options: ImportOptions): FormData | null {
    if (!file) return null;
    const body = new FormData(); body.set("file", file); body.set("options", JSON.stringify(options)); return body;
  }
  async function checkPreview() {
    const options = currentOptions();
    if (!canPreview || !options) return;
    const body = requestBody(options); if (!body) return;
    invalidatePreview(); setPending("preview");
    try {
      const value = await api<ImportPreview>("/imports/preview", { method: "POST", body });
      if (value.source_origin !== origin || value.workspace_mode !== origin) throw new Error("Источник предварительного просмотра не совпадает с выбранным. Импорт заблокирован.");
      if (value.file_sha256 !== inspection?.file_sha256 || value.selected_sheet !== sheet) throw new Error("Файл или лист изменился после чтения структуры. Выберите файл и повторите проверку.");
      setPreview(value);
    } catch (reason) { showRequestError(reason); }
    finally { setPending(null); }
  }
  async function commit() {
    const options = currentOptions();
    if (!canChoose || !preview?.can_commit || !confirmed || !options) return;
    const body = requestBody(options); if (!body) return;
    body.set("preview_token", preview.preview_token); body.set("confirm", "IMPORT SAQTA");
    setError(""); setRequestErrors([]); setPending("commit");
    try {
      const value = await api<ImportCommit>("/imports/commit", { method: "POST", body });
      setResult(value); setPreview(null); setConfirmed(false);
      if (value.imported_count > 0) onImported?.();
    } catch (reason) { showRequestError(reason); setPreview(null); setConfirmed(false); }
    finally { setPending(null); }
  }

  return <section aria-label="Проверяемый импорт данных" className="space-y-6 rounded-xl border border-[#DDE5D7] bg-[#FCFDF9] p-4 sm:p-5">
    <div>
      <h3 className="text-sm font-semibold text-[#123C2F]">1. Укажите происхождение файла</h3>
      <p className="mt-2 text-xs leading-relaxed text-[#5D6B62]">Файл отправится на сервер только после вашего выбора и подтверждения. Ответы анкеты не превращаются в историю продаж. Исходный файл на сервере не сохраняется; оставьте у себя оригинал.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Происхождение файла"><select className="field" value={origin} disabled={Boolean(pending)} onChange={event => changeOrigin(event.target.value as SourceOrigin | "")}><option value="">Выберите источник явно</option><option value="demo">Синтетический / DEMO</option><option value="real">Реальные данные пекарни</option></select></Field>
        <div className="rounded-lg bg-[#EFF4EA] p-3 text-xs text-[#536257]"><span className="block font-medium">Текущее рабочее пространство</span><span className="mt-1 block">{settings.loading ? "Проверяем режим сервера…" : settings.error ? "Не удалось подтвердить режим" : workspace === "demo" ? "Общее DEMO · только синтетические данные" : workspace === "real" ? "База реальных данных · требуется закрытое окружение" : "Не определено"}</span></div>
      </div>
      {settings.error ? <div className="mt-3"><Notice kind="error">{settings.error} <button type="button" className="underline" onClick={settings.reload}>Повторить проверку</button></Notice></div> : null}
      {origin === "real" && workspace === "demo" ? <div className="mt-3"><Notice kind="error">Реальный файл нельзя загружать в публичное DEMO. Используйте отдельное приватное окружение и базу реальных данных. Не переобозначайте реальный файл как синтетический ради загрузки.</Notice></div> : null}
      {origin === "demo" && workspace === "real" ? <div className="mt-3"><Notice>Синтетические данные нельзя смешивать с реальной базой. Откройте отдельное демонстрационное пространство.</Notice></div> : null}
      {origin ? <label className="mt-4 flex items-start gap-2.5 text-xs leading-relaxed text-[#536257]"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#237A57]" checked={acknowledged} disabled={!sourceMatches || Boolean(pending)} onChange={event => { setAcknowledged(event.target.checked); if (!event.target.checked) clearFile(); }} /><span>{origin === "demo" ? "Подтверждаю, что файл содержит только синтетические данные, без реальных данных бизнеса и персональных сведений." : "Подтверждаю, что использую закрытое окружение и имею право обработать эти данные. Без авторизации сервер не изолирует доступ между пользователями."}</span></label> : null}
    </div>
    <div>
      <h3 className="text-sm font-semibold text-[#123C2F]">2. Выберите CSV или XLSX</h3>
      <div className="mt-3 flex flex-wrap items-center gap-3"><input ref={fileInput} className="hidden" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Файл CSV или XLSX" disabled={!canChoose} onChange={event => { void inspectFile(event.target.files?.[0]); }} /><button type="button" className="btn-secondary" disabled={!canChoose} onClick={() => fileInput.current?.click()}>{pending === "inspect" ? <LoaderCircle size={14} className="animate-spin" /> : <FileUp size={14} />}{pending === "inspect" ? "Читаем структуру…" : "Выбрать файл"}</button><span className="max-w-full break-all text-xs text-[#5D6B62]">{file ? `${file.name} · ${number(file.size / 1024, 1)} КБ` : "До 2 МБ · до 5 000 строк на листе · оригинал остаётся у вас"}</span></div>
    </div>
    {inspection ? <div className="border-t border-[#E5E9E0] pt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[#123C2F]">3. Сопоставьте столбцы</h3><Badge tone={survey ? "amber" : "gray"}>{firstSheet ? classificationLabel(inspection.classification) : "Проверьте выбранный лист"}</Badge></div>
      {survey ? <div className="mb-4"><Notice>Этот лист похож на анкету. Ответы о бизнесе не являются ежедневными продажами и не импортируются как операции. Сохраните их отдельно; для прогноза нужен журнал с датами и количеством.</Notice></div> : null}
      <div className="mb-4 grid gap-4 sm:grid-cols-2"><Field label="Лист таблицы"><select className="field" value={sheet} disabled={Boolean(pending)} onChange={event => { const value = event.target.value; setSheet(value); setMapping(value === inspection.selected_sheet ? inspection.suggested_mapping : {}); setDefaultKind(""); setDefaultProduct(""); setDefaultLocation(""); invalidatePreview(); }}>{inspection.sheets.map(value => <option key={value.name} value={value.name}>{value.name} · {number(value.row_count)} строк</option>)}</select></Field><Field label="Метка источника" hint="Необязательно; без имён и персональных сведений"><input className="field" maxLength={120} placeholder="Например: журнал выпуска, октябрь" value={sourceLabel} disabled={Boolean(pending)} onChange={event => { setSourceLabel(event.target.value); invalidatePreview(); }} /></Field></div>
      <div className="grid gap-4 sm:grid-cols-2">{TARGETS.map(target => <Field key={target.key} label={target.label} hint={target.hint}><select className="field" value={mapping[target.key] || ""} disabled={Boolean(pending)} onChange={event => { const next = { ...mapping }; if (event.target.value) next[target.key] = event.target.value; else delete next[target.key]; setMapping(next); invalidatePreview(); }}><option value="">Не сопоставлено</option>{columns.map(column => <option key={column} value={column}>{column}</option>)}</select></Field>)}</div>
      <div className="mt-5 rounded-lg border border-[#E5E9E0] bg-white p-4"><h4 className="text-xs font-semibold text-[#123C2F]">Значения для всего листа</h4><p className="mt-1 text-xs leading-relaxed text-[#5D6B62]">Используются только когда соответствующий столбец не сопоставлен. Товар и точка должны уже существовать в каталоге; автоматического создания нет.</p><div className="mt-3 grid gap-4 sm:grid-cols-3"><Field label="Тип для всего листа"><select className="field" value={defaultKind} disabled={Boolean(mapping.kind || pending)} onChange={event => { setDefaultKind(event.target.value as RecordKind | ""); invalidatePreview(); }}><option value="">Выберите тип</option>{Object.entries(KIND_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field><Field label="Товар для всего листа"><select className="field" value={defaultProduct} disabled={Boolean(mapping.product || pending || reference.loading)} onChange={event => { setDefaultProduct(event.target.value); invalidatePreview(); }}><option value="">Выберите товар</option>{reference.products.map(product => <option key={product.id} value={product.id}>{product.name} · {product.unit}</option>)}</select></Field><Field label="Точка для всего листа"><select className="field" value={defaultLocation} disabled={Boolean(mapping.location || pending || reference.loading)} onChange={event => { setDefaultLocation(event.target.value); invalidatePreview(); }}><option value="">Выберите точку</option>{reference.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field></div>{reference.error ? <div className="mt-3"><Notice kind="error">{reference.error} <button type="button" className="underline" onClick={reference.reload}>Повторить загрузку каталога</button></Notice></div> : null}</div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Формат текстовых дат"><select className="field" value={dateFormat} disabled={Boolean(pending)} onChange={event => { setDateFormat(event.target.value as "iso" | "dmy"); invalidatePreview(); }}><option value="iso">ГГГГ-ММ-ДД · 2026-10-24</option><option value="dmy">ДД.ММ.ГГГГ · 24.10.2026</option></select></Field><Field label="Десятичный разделитель"><select className="field" value={numberFormat} disabled={Boolean(pending)} onChange={event => { setNumberFormat(event.target.value as "dot" | "comma"); invalidatePreview(); }}><option value="dot">Точка · 10.0</option><option value="comma">Запятая · 10,0</option></select></Field></div>
      <p className="mt-3 text-xs leading-relaxed text-[#5D6B62]">Количество и цены сохраняются только целыми значениями. Дробные значения, нулевые количества, неоднозначные даты и формулы требуют исправления в исходной копии. Пропуски не заполняются выдуманными продажами.</p>
      {firstSheet && inspection.sample_rows.length > 0 ? <details className="mt-4 text-xs"><summary className="cursor-pointer font-medium text-[#237A57]">Первые строки исходного листа · до 5 строк</summary><div className="mt-3 max-h-60 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="whitespace-nowrap p-2">Строка</th>{columns.map(column => <th key={column} className="whitespace-nowrap p-2 font-medium">{column}</th>)}</tr></thead><tbody>{inspection.sample_rows.map(row => <tr key={row.row} className="border-t border-[#E5E9E0]"><td className="p-2">{row.row}</td>{columns.map(column => <td key={column} className="max-w-56 break-words p-2">{row.values[column] || "—"}</td>)}</tr>)}</tbody></table></div></details> : null}
      <button type="button" className="btn-primary mt-5" disabled={!canPreview} onClick={() => { void checkPreview(); }}>{pending === "preview" ? <LoaderCircle size={15} className="animate-spin" /> : <FileCheck2 size={15} />}{pending === "preview" ? "Проверяем строки…" : "Проверить и показать строки"}</button>
      {!hasRequiredMapping && !survey ? <p className="mt-2 text-xs text-[#5D6B62]">Укажите дату и количество; для типа, товара и точки выберите столбцы или значения для всего листа.</p> : null}
    </div> : null}
    {preview ? <div className="space-y-4 border-t border-[#E5E9E0] pt-5">
      <h3 className="text-sm font-semibold text-[#123C2F]">4. Проверьте результат перед сохранением</h3>
      <dl className="grid grid-cols-2 gap-3 text-xs lg:grid-cols-4">{[["Всего строк", preview.total_rows], ["Готовы к импорту", preview.valid_rows], ["Дубликаты", preview.duplicate_rows], ["Отклонены", preview.rejected_rows]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-[#E5E9E0] bg-white p-3"><dt className="text-[#5D6B62]">{label}</dt><dd className="mt-1 text-lg font-semibold text-[#123C2F]">{number(Number(value))}</dd></div>)}</dl>
      {preview.warnings.length > 0 ? <Notice><ul className="space-y-2">{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></Notice> : null}
      {preview.errors.length > 0 ? <Notice kind="error"><p className="font-semibold">Сохранение заблокировано. Исправьте ошибки и повторите проверку; пакет с ошибками не импортируется частично.</p><ul className="mt-2 space-y-1">{preview.errors.map((issue, index) => <li key={index}>Строка {issue.row}, {issue.field}: {issue.message}</li>)}</ul></Notice> : null}
      {preview.duplicate_rows > 0 ? <Notice>{preview.valid_rows === 0 && preview.rejected_rows === 0 ? "Все строки уже существуют. Повторный импорт не требуется; новые записи не созданы." : `Дубликатов: ${number(preview.duplicate_rows)}. Они будут пропущены; сохранятся только проверенные новые строки.`}</Notice> : null}
      {preview.preview_rows.length > 0 ? <div className="max-h-80 overflow-auto rounded-lg border border-[#E5E9E0] bg-white"><table className="w-full text-left text-xs"><caption className="p-3 text-left text-[#5D6B62]">Нормализованные строки · показано до 50 · источник: {preview.source_origin === "demo" ? "SYNTHETIC / DEMO" : "реальные данные"}</caption><thead className="bg-[#F2F5EC]"><tr>{["Строка", "Статус", "Дата", "Тип", "Товар", "Точка", "Количество"].map(label => <th key={label} scope="col" className="whitespace-nowrap p-2 font-medium text-[#536257]">{label}</th>)}</tr></thead><tbody>{preview.preview_rows.map(row => <tr key={row.row} className="border-t border-[#E5E9E0]"><td className="p-2">{row.row}</td><td className="whitespace-nowrap p-2"><Badge tone={row.status === "ready" ? "green" : "amber"}>{ROW_STATUS[row.status]}</Badge></td><td className="whitespace-nowrap p-2">{row.record?.date || "—"}</td><td className="p-2">{row.record ? KIND_LABELS[row.record.kind] : "—"}</td><td className="min-w-28 p-2">{row.record?.product_name || "—"}</td><td className="min-w-28 p-2">{row.record?.location_name || "—"}</td><td className="whitespace-nowrap p-2">{row.record ? `${number(row.record.quantity)} ${row.record.unit}` : "—"}</td></tr>)}</tbody></table></div> : null}
      {preview.can_commit ? <><label className="flex items-start gap-2.5 text-xs leading-relaxed text-[#536257]"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#237A57]" checked={confirmed} disabled={Boolean(pending)} onChange={event => setConfirmed(event.target.checked)} /><span>Я проверил сопоставление, единицы, ошибки и источник. Подтверждаю сохранение {number(preview.valid_rows)} новых записей.</span></label><button type="button" className="btn-primary" disabled={!confirmed || !canChoose} onClick={() => { void commit(); }}>{pending === "commit" ? <LoaderCircle size={15} className="animate-spin" /> : <CheckCheck size={15} />}{pending === "commit" ? "Сохраняем записи…" : "Подтвердить импорт"}</button></> : null}
    </div> : null}
    {result ? <Notice kind="success"><p className="font-semibold">Импорт завершён</p><p className="mt-1">Добавлено: {number(result.imported_count)}. Дубликаты: {number(result.duplicate_count)}. Отклонено: {number(result.rejected_count)}.</p><p className="mt-1">{result.message}</p>{result.batch_id !== null ? <p className="mt-1">Пакет #{result.batch_id} · источник: {origin === "demo" ? "SYNTHETIC / DEMO" : "реальные данные"}.</p> : null}</Notice> : null}
    {error ? <Notice kind="error">{error}{requestErrors.length > 0 ? <ul className="mt-2 space-y-1">{requestErrors.slice(0, 20).map((issue, index) => <li key={index}>{Number.isInteger(issue.row) ? `Строка ${issue.row}` : "Данные"}: {issue.message}</li>)}</ul> : null}</Notice> : null}
    <div className="flex items-start gap-2 text-xs leading-relaxed text-[#5D6B62]"><ShieldAlert size={15} className="mt-0.5 shrink-0" /><p>Предпросмотр не меняет остатки. Сервер повторно проверит файл, сопоставление, дубликаты и доступный запас перед сохранением. Публичная демонстрация не подходит для частных данных бизнеса.</p></div>
  </section>;
}
