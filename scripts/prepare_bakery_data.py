"""Read a bakery workbook without modifying it; keep all responses private.

Usage: python scripts/prepare_bakery_data.py --input C:/path/to/workbook.xlsx
Requires openpyxl (pinned in backend/requirements.lock.txt).
"""
import argparse
import csv
from datetime import date, datetime
import hashlib
import json
from pathlib import Path
import re
import unicodedata

import openpyxl


def normalize(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, str):
        return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value)).strip()
    return value


def prepare_research_summary(sheets, output_dir):
    """Interpret self-reports locally; never print or publish response values."""
    domains = {
        "stated_production_volume": [2], "sales_accounting": [3, 6],
        "weekday_variation": [4], "surplus_products": [5],
        "surplus_frequency_and_share": [7, 8], "surplus_handling": [9],
        "stated_loss_and_planning_time": [10, 11],
        "stated_interest_and_source_sharing": [12, 13, 14, 15],
    }
    notes = {
        "stated_production_volume": "Approximate self-reported volume/range only. Preserve the range as stated; do not select a midpoint, assign dates or create ProductionRecord rows.",
        "sales_accounting": "Self-reported accounting practices indicate where to request a verified export. The supplied workbook itself contains no daily sales export.",
        "weekday_variation": "A qualitative weekday statement can guide questions and demo labels; it does not establish a measured weekday multiplier.",
        "surplus_products": "Use the named categories privately to prioritize catalog/SKU clarification. They are not a verified catalog with units, prices, costs or weights.",
        "surplus_frequency_and_share": "Frequency and share are estimates from one respondent. They are not dated surplus quantities, observed probabilities or a validated reduction target.",
        "surplus_handling": "Use the stated process to ask about eligible pickup, stock and write-off records. Do not assume all remaining products would have been discarded.",
        "stated_loss_and_planning_time": "Approximate monthly cost/time estimates are research responses. They cannot be booked as dated waste, verified unit costs or measured savings.",
        "stated_interest_and_source_sharing": "Stated interest is unverified and may be conditional. It is not an active subscription, paying customer, approved price, pilot agreement or consent to publish responses.",
    }
    responses = []
    for sheet in sheets:
        if sheet["classification"] != "survey":
            continue
        numbered = {}
        for column in sheet["columns"]:
            match = re.match(r"(\d+)\.", column)
            if match:
                numbered[int(match.group(1))] = column
        for row in sheet["rows"]:
            values = row.get("original_values", row["values"])
            details = {}
            for domain, numbers in domains.items():
                details[domain] = {"evidence_status": "one self-report; unverified", "responses": [
                    {"question_number": number, "question": numbered[number], "verbatim_answer": values.get(numbered[number]),
                     "normalized_answer": row["values"].get(numbered[number])}
                    for number in numbers if number in numbered], "qualitative_note": notes[domain]}
            accounting = " ".join(str(values.get(numbered.get(number, ""), "")) for number in (3, 6)).casefold()
            source_flags = []
            for label, pattern in (
                ("spreadsheet mentioned", r"excel|эксел|xlsx|таблиц"),
                ("Google tooling mentioned; export format needs confirmation", r"google|гугл"),
                ("POS/ERP mentioned", r"касс|\bpos\b|iiko|r.?keeper|1[сc]"),
                ("manual/paper records mentioned", r"тетрад|бумаг|блокнот|вручн"),
                ("no/partial records statement; clarify coverage", r"не вед|не запис|частич|^нет$"),
            ):
                if re.search(pattern, accounting):
                    source_flags.append(label)
            follow_up = ["Request a private, de-identified daily export and explicit permission for its intended use; no actual daily series has been supplied."]
            if any("spreadsheet" in flag or "Google" in flag for flag in source_flags):
                follow_up.append("Ask for the existing spreadsheet export, its date coverage, one row's meaning, product/location keys and explicit zero-day coverage.")
            if any("POS/ERP" in flag for flag in source_flags):
                follow_up.append("Ask which POS/ERP report can export dated SKU-level units; inspect actual headers and reconcile totals before mapping.")
            if any("manual/paper" in flag for flag in source_flags):
                follow_up.append("Agree a daily capture template or verified transcription with the bakery; do not digitize approximate survey answers into invented transactions.")
            if not source_flags:
                follow_up.append("Confirm whether any transaction-level file exists and which system owns it; source availability is not established by the supplied workbook.")
            follow_up += ["Clarify the self-reported surplus categories into existing SKU names/units and a location list before creating catalog mappings.",
                          "Collect dated production, sales, write-offs with reasons, opening stock, prices and optional verified cost/weight; reconcile balances and retain explicit zero-demand evidence outside the positive-only ledger until supported.",
                          "Use the stated interest answers only to frame a follow-up discussion; independently confirm pilot scope, willingness to pay and permission to share data."]
            responses.append({"source_sheet": sheet["name"], "source_row": row["source_row"],
                              "evidence_status": "one self-report; unverified", "domains": details,
                              "source_availability_flags": source_flags, "recommended_next_collection": follow_up})
    summary = {"private": True, "origin": "real_survey", "respondent_count": len(responses),
               "verified_daily_sales_observations": 0,
               "limitation": "Research responses only, not representative evidence or a transaction history. No contacts, outreach or public upload are performed.",
               "responses": responses}
    (output_dir / "research-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def analyze(input_path: Path, output_dir: Path, report_path: Path):
    before = hashlib.sha256(input_path.read_bytes()).hexdigest()
    workbook = openpyxl.load_workbook(input_path, read_only=True, data_only=False)
    sheets = []
    for sheet in workbook:
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            sheets.append({"name": sheet.title, "columns": [], "rows": [], "row_count": 0,
                           "classification": "empty", "missing": {}, "duplicate_rows": 0})
            continue
        headers = [str(normalize(value) or f"column_{index + 1}") for index, value in enumerate(rows[0])]
        # Position suffixes preserve every column when a source repeats its header.
        labels = [header if headers.count(header) == 1 else f"{header} [{index + 1}]" for index, header in enumerate(headers)]
        prepared, signatures, duplicates = [], set(), 0
        missing = {label: 0 for label in labels}
        for number, source in enumerate(rows[1:], start=2):
            if all(value is None or value == "" for value in source):
                continue
            normalized = {label: normalize(source[index]) if index < len(source) else None for index, label in enumerate(labels)}
            for key, value in normalized.items():
                if value is None or value == "":
                    missing[key] += 1
            signature = json.dumps(normalized, ensure_ascii=False, sort_keys=True, default=str)
            duplicate = signature in signatures
            duplicates += duplicate
            signatures.add(signature)
            prepared.append({"source_row": number, "duplicate": duplicate, "values": normalized,
                             "original_values": {label: source[index] if index < len(source) else None for index, label in enumerate(labels)}})
        joined = " ".join(headers).casefold()
        survey = sum("?" in header or bool(re.match(r"\d+\.", header)) for header in headers) >= 3
        operational = any(word in joined for word in ("product_id", "товар", "продукт")) and any(word in joined for word in ("quantity", "количество", "продано")) and any(word in joined for word in ("date", "дата"))
        classification = "survey" if survey else "daily_records_candidate" if operational else "unclassified"
        sheets.append({"name": sheet.title, "columns": labels, "rows": prepared, "row_count": len(prepared),
                       "classification": classification, "missing": missing, "duplicate_rows": duplicates})
    workbook.close()
    after = hashlib.sha256(input_path.read_bytes()).hexdigest()
    if before != after:
        raise RuntimeError("Source changed during read-only preparation")
    output_dir.mkdir(parents=True, exist_ok=True)
    private = {"source_file": str(input_path.resolve()), "source_sha256": before,
               "source_bytes": input_path.stat().st_size, "source_unchanged": before == after,
               "origin": "real", "contains_private_responses": True,
               "transformations": ["Unicode NFKC and whitespace normalization for text", "Native Excel date/time values serialized as ISO strings", "Missing values retained as null", "Duplicate rows flagged, not dropped", "Survey answers never expanded into daily sales"],
               "sheets": sheets}
    (output_dir / "bakery-normalized.json").write_text(json.dumps(private, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    provenance = {key: value for key, value in private.items() if key != "sheets"}
    provenance["sheet_summary"] = [{key: value for key, value in sheet.items() if key != "rows"} for sheet in sheets]
    (output_dir / "provenance.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=2), encoding="utf-8")
    prepare_research_summary(sheets, output_dir)
    # A schema only: no daily observations are invented from questionnaire answers.
    with (output_dir / "daily-history-template.csv").open("w", encoding="utf-8", newline="") as stream:
        csv.writer(stream).writerow(["kind", "product", "location", "date", "quantity", "unit", "unit_price_kzt", "reason"])
    lines = ["# Bakery data inspection", "", "This sanitized report contains structure and quality counts only. Source answers and identifying details remain in ignored `data/private/`; they must not be committed, uploaded to the public demo or published.", "", f"Source: one read-only XLSX file, {private['source_bytes']:,} bytes. SHA256 before and after preparation: `{before}`. The original workbook was not modified.", "", f"Worksheets: {len(sheets)}. Nonempty response/data rows: {sum(s['row_count'] for s in sheets)}.", ""]
    for index, sheet in enumerate(sheets, start=1):
        lines += [f"## Worksheet {index}", "", f"Classification: **{sheet['classification']}**. Columns: {len(sheet['columns'])}; rows excluding header: {sheet['row_count']}; exact duplicate rows (including timestamp): {sheet['duplicate_rows']}.", "", "| Column | Missing cells |", "|---|---|"]
        lines += [f"| {label.replace('|', '/')} | {sheet['missing'][label]} |" for label in sheet["columns"]]
        lines.append("")
    is_survey = any(sheet["classification"] == "survey" for sheet in sheets)
    if is_survey:
        lines += ["## Meaning and forecasting readiness", "", "The workbook contains Google Forms questionnaire responses, including a submission timestamp and questions about approximate production, surplus frequency, accounting practices and service interest. A form submission timestamp is not the date of an observed daily sale. The file does not provide a verified product-by-location daily ledger of production, units sold and write-offs. No rows have been imported into operational records and no model has been trained on questionnaire answers.", "", "Use the responses privately for discovery, available-data-source planning and import mapping. Do not treat approximate volumes or stated willingness as verified operating results, prices or customer commitments. The real workbook yields **zero verified daily sales observations** for forecasting/backtesting. Existing 42-day synthetic seed data stays separate and labeled DEMO.", ""]
    lines += ["## Mapping to SAQTA", "", "Operational imports require actual `date`, `quantity`, `kind` (production/sales/waste), and an existing product and location, by ID/name or explicit defaults. `unit` must match the product catalog; prices are integer KZT; write-offs require a reason. Questionnaire timestamps/approximate volume/range answers are not silently mapped to these fields. Do not invent product identities, dates, unit costs, weights or daily distributions.", "", "Collect at least several weeks of dated product/location observations, including zero-demand days explicitly, production and starting balances for stock reconciliation, plus selling price and optional cost/weight from a verified catalog. The current positive-quantity ledger does not accept zero-quantity rows: such rows must be reviewed explicitly, not silently dropped or changed. More history is needed before real held-out accuracy can be reported.", "", "## Reproduce and update", "", "Run from the repository root in a private environment with the backend dependencies installed:", "", "```powershell", "python scripts/prepare_bakery_data.py --input C:/path/to/SAQTA.xlsx --output-dir data/private --report docs/DATA_REPORT.md", "```", "", "Private outputs: normalized response JSON, provenance/quality JSON, and a header-only daily-history CSV template. Normalization only standardizes Unicode/whitespace and serializes native dates; missing values and duplicate rows are retained and flagged. No survey range is converted into an exact quantity. This report includes no respondent answers, bakery identities or contact details. For a new workbook, inspect classification and quality results before using the preview/commit importer in a separate real-data database. Real-origin uploads are refused by the public demo."]
    lines = [line.replace("python scripts/prepare_bakery_data.py --input", "backend/.venv/Scripts/python scripts/prepare_bakery_data.py --input") for line in lines]
    lines += ["", "## Operational import workflow", "", "The legacy `/api/import` CSV endpoint remains compatible. New `/api/imports/inspect`, `/api/imports/preview` and `/api/imports/commit` endpoints accept CSV/XLSX with explicit sheet/column mappings and defaults. Origin must match persisted workspace mode on every step. The frontend blocks real files before upload in a public demo; the backend independently refuses mismatched origin. A real workspace still needs private hosting/access controls because no authentication or tenant isolation exists.", "", "Preview validates dates/decimal formats, existing catalog identities, units, positive integral quantities and integer KZT prices. It refuses survey sheets and formulas. Limits: 2 MB upload, 5,000 rows/80 columns per sheet, 25 XLSX sheets and 32 MB expanded XLSX. No source file is retained by application code. Errors block the entire batch; confirmation reparses and revalidates before committing atomically. Verified production/starting stock must precede consuming sales/write-offs. No balancing production is invented.", "", "Stateless preview hashes bind reviewed file/mapping and effective catalog values; they have no time expiry or authentication meaning. Unique database fingerprints prevent semantic repeats across file renaming/reordering and concurrent batches. Matching existing ledger records are skipped. Intentional identical operations require manual review or an explicitly combined quantity. Provenance stores file hash, origin, mapping and counts. Correct existing records explicitly rather than expecting reimport to overwrite them.", "", "Private `research-summary.json` retains verbatim and normalized answers by research domain, qualitative limitations, source-availability flags and next-data-collection recommendations. It is one unverified self-report, not a daily series, customer commitment or permission to publish. This public report deliberately contains no actual answers."]
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"source_unchanged": before == after, "source_sha256": before,
                      "sheets": len(sheets), "rows": sum(s["row_count"] for s in sheets),
                      "columns": [len(s["columns"]) for s in sheets],
                      "classifications": [s["classification"] for s in sheets],
                      "missing_cells": sum(sum(s["missing"].values()) for s in sheets),
                      "duplicate_rows": sum(s["duplicate_rows"] for s in sheets),
                      "private_output_dir": str(output_dir), "sanitized_report": str(report_path)}, ensure_ascii=True))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("data/private"))
    parser.add_argument("--report", type=Path, default=Path("docs/DATA_REPORT.md"))
    args = parser.parse_args()
    analyze(args.input, args.output_dir, args.report)
