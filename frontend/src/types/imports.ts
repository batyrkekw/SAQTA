import type { RecordKind } from "./api";

export type SourceOrigin = "demo" | "real";
export type ImportTarget = "date" | "quantity" | "kind" | "product" | "location" | "unit" | "unit_price_kzt" | "reason";
export type ColumnMapping = Partial<Record<ImportTarget, string>>;
export type ImportClassification = "survey" | "daily_records_candidate" | "unclassified";
export type ImportSheet = { name: string; columns: string[]; row_count: number };
export type ImportInspection = {
  file_sha256: string;
  workspace_mode: SourceOrigin;
  source_origin: SourceOrigin;
  sheets: ImportSheet[];
  selected_sheet: string;
  columns: string[];
  sample_rows: { row: number; values: Record<string, string> }[];
  suggested_mapping: ColumnMapping;
  classification: ImportClassification;
  limits: { max_bytes: number; max_rows: number; max_columns: number; formats: string[] };
};
export type ImportOptions = {
  source_origin: SourceOrigin;
  sheet?: string;
  column_mapping: ColumnMapping;
  default_kind?: RecordKind;
  default_product_id?: number;
  default_location_id?: number;
  date_format: "iso" | "dmy";
  number_format: "dot" | "comma";
  source_label?: string;
};
export type ImportIssue = { row: number; field: string; message: string };
export type ImportPreviewRecord = {
  kind: RecordKind;
  product_id: number;
  location_id: number;
  date: string;
  quantity: number;
  reason?: string;
  unit_price_kzt?: number | null;
  unit: string;
  product_name: string;
  location_name: string;
};
export type ImportPreview = {
  preview_token: string;
  file_sha256: string;
  classification: ImportClassification;
  workspace_mode: SourceOrigin;
  source_origin: SourceOrigin;
  selected_sheet: string;
  total_rows: number;
  valid_rows: number;
  duplicate_rows: number;
  rejected_rows: number;
  can_commit: boolean;
  errors: ImportIssue[];
  warnings: string[];
  preview_rows: { row: number; status: "ready" | "duplicate" | "error"; record?: ImportPreviewRecord }[];
};
export type ImportCommit = {
  batch_id: number | null;
  imported_count: number;
  duplicate_count: number;
  rejected_count: number;
  message: string;
  source_origin?: SourceOrigin;
};
