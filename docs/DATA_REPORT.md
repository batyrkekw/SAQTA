# Bakery data inspection

This sanitized report contains structure and quality counts only. Source answers and identifying details remain in ignored `data/private/`; they must not be committed, uploaded to the public demo or published.

Source: one read-only XLSX file, 8,065 bytes. SHA256 before and after preparation: `2037ed00f88d6172e091f9597c13a8e829fcbd4d4a86d196d0fe66494a7cd5be`. The original workbook was not modified.

Worksheets: 1. Nonempty response/data rows: 1.

## Worksheet 1

Classification: **survey**. Columns: 16; rows excluding header: 1; exact duplicate rows (including timestamp): 0.

| Column | Missing cells |
|---|---|
| Отметка времени | 0 |
| 1. В каком городе находится ваша пекарня? | 0 |
| 2. Сколько примерно единиц продукции вы производите за день? | 0 |
| 3. Ведёте ли вы учёт ежедневных продаж? | 0 |
| 4. Насколько сильно продажи меняются в зависимости от дня недели? | 0 |
| 5. Какие товары чаще всего остаются непроданными? | 0 |
| 6. Какие данные вы обычно записываете? | 0 |
| 7. Как часто остаётся непроданная продукция? | 0 |
| 8. Какая доля продукции обычно остаётся непроданной? | 0 |
| 9. Что вы делаете с непроданной продукцией? | 0 |
| 10. Какова примерная стоимость списаний за месяц? | 0 |
| 11. Сколько времени в день уходит на планирование производства и учёт остатков? | 0 |
| 12. Насколько полезным был бы прогноз спроса и рекомендации по объёму производства? | 0 |
| 13. Был бы вам интересен сервис для продажи остатков со скидкой? | 0 |
| 14. Рассмотрели бы вы платную подписку, если сервис помогал бы сокращать потери? | 0 |
| 15. Готовы ли вы протестировать SAQTA или поделиться обезличенными данными о продажах? | 0 |

## Meaning and forecasting readiness

The workbook contains Google Forms questionnaire responses, including a submission timestamp and questions about approximate production, surplus frequency, accounting practices and service interest. A form submission timestamp is not the date of an observed daily sale. The file does not provide a verified product-by-location daily ledger of production, units sold and write-offs. No rows have been imported into operational records and no model has been trained on questionnaire answers.

Use the responses privately for discovery, available-data-source planning and import mapping. Do not treat approximate volumes or stated willingness as verified operating results, prices or customer commitments. The real workbook yields **zero verified daily sales observations** for forecasting/backtesting. Existing 42-day synthetic seed data stays separate and labeled DEMO.

## Mapping to SAQTA

Operational imports require actual `date`, `quantity`, `kind` (production/sales/waste), and an existing product and location, by ID/name or explicit defaults. `unit` must match the product catalog; prices are integer KZT; write-offs require a reason. Questionnaire timestamps/approximate volume/range answers are not silently mapped to these fields. Do not invent product identities, dates, unit costs, weights or daily distributions.

Collect at least several weeks of dated product/location observations, including zero-demand days explicitly, production and starting balances for stock reconciliation, plus selling price and optional cost/weight from a verified catalog. The current positive-quantity ledger does not accept zero-quantity rows: such rows must be reviewed explicitly, not silently dropped or changed. More history is needed before real held-out accuracy can be reported.

## Reproduce and update

Run from the repository root in a private environment with the backend dependencies installed:

```powershell
backend/.venv/Scripts/python scripts/prepare_bakery_data.py --input C:/path/to/SAQTA.xlsx --output-dir data/private --report docs/DATA_REPORT.md
```

Private outputs: normalized response JSON, provenance/quality JSON, and a header-only daily-history CSV template. Normalization only standardizes Unicode/whitespace and serializes native dates; missing values and duplicate rows are retained and flagged. No survey range is converted into an exact quantity. This report includes no respondent answers, bakery identities or contact details. For a new workbook, inspect classification and quality results before using the preview/commit importer in a separate real-data database. Real-origin uploads are refused by the public demo.

## Operational import workflow

The legacy `/api/import` CSV endpoint remains compatible. New `/api/imports/inspect`, `/api/imports/preview` and `/api/imports/commit` endpoints accept CSV/XLSX with explicit sheet/column mappings and defaults. Origin must match persisted workspace mode on every step. The frontend blocks real files before upload in a public demo; the backend independently refuses mismatched origin. A real workspace still needs private hosting/access controls because no authentication or tenant isolation exists.

Preview validates dates/decimal formats, existing catalog identities, units, positive integral quantities and integer KZT prices. It refuses survey sheets and formulas. Limits: 2 MB upload, 5,000 rows/80 columns per sheet, 25 XLSX sheets and 32 MB expanded XLSX. No source file is retained by application code. Errors block the entire batch; confirmation reparses and revalidates before committing atomically. Verified production/starting stock must precede consuming sales/write-offs. No balancing production is invented.

Stateless preview hashes bind reviewed file/mapping and effective catalog values; they have no time expiry or authentication meaning. Unique database fingerprints prevent semantic repeats across file renaming/reordering and concurrent batches. Matching existing ledger records are skipped. Intentional identical operations require manual review or an explicitly combined quantity. Provenance stores file hash, origin, mapping and counts. Correct existing records explicitly rather than expecting reimport to overwrite them.

Private `research-summary.json` retains verbatim and normalized answers by research domain, qualitative limitations, source-availability flags and next-data-collection recommendations. It is one unverified self-report, not a daily series, customer commitment or permission to publish. This public report deliberately contains no actual answers.
