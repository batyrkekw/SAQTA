"use client";

import { useI18n } from "@/components/language-provider";
import { ImportWorkflow } from "@/features/data/import-workflow";
import { downloadCsv,errorMessage } from "@/lib/api";
import { Download,FileUp } from "lucide-react";
import { useState } from "react";
import { Notice } from "./ui";

export type CsvToolsProps = { onImported?: () => void; filters?: Record<string, string | number | undefined> };

export function CsvTools({ onImported, filters = {} }: CsvToolsProps) {
  const { t } = useI18n();

  const [expanded, setExpanded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  async function exportRecords() {
    setError(""); setExporting(true);
    try { await downloadCsv(filters); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setExporting(false); }
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><FileUp size={14} />{t(expanded ? "Скрыть импорт" : "Импорт CSV / XLSX")}</button><button type="button" className="btn-secondary" disabled={exporting} onClick={() => { void exportRecords(); }}><Download size={14} />{t(exporting ? "Выгружаем…" : "Экспорт CSV")}</button></div>
    <p className="text-xs leading-relaxed text-[#5D6B62]">{t("Импорт CSV или XLSX: выбор источника, сопоставление столбцов, проверка и отдельное подтверждение. До 2 МБ и 5 000 строк на листе. Выгрузка CSV учитывает выбранные фильтры.")}</p>
    {error ? <Notice kind="error">{t(error)}</Notice> : null}
    {expanded ? <ImportWorkflow onImported={onImported} /> : null}
  </div>;
}
