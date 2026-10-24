# SAQTA public API contract

Local base: `http://127.0.0.1:8000/api`. The frontend API base is configured through `NEXT_PUBLIC_API_URL`, including `/api`. FastAPI publishes `/docs` and `/openapi.json` at the backend origin.

This contract is implemented by the unified-product code release 416220352ee4a8852035a0eb5fc4581fda85299f, deployed to the existing public API/frontend on 24 October 2026. The new import/backtest endpoints and retained API behavior passed targeted PostgreSQL integration checks. See `VERIFICATION.md` for executed results and limits.

## Conventions and source separation

* Money: integer KZT. Ledger quantities: positive integer units. Product weights: grams.
* Dates: ISO `YYYY-MM-DD`; datetimes: timezone-aware ISO 8601. Date filters are inclusive.
* Lists return arrays, except paginated records. Optional analytics/ledger filters: `location_id`, `start_date`, `end_date`.
* Errors use meaningful status codes: 422 invalid input, 409 conflicting stock/state/origin, 413 oversized upload. Expected messages are safe Russian text. Validation details may be strings, Pydantic issue arrays or `{message,errors:[{row,field?,message}]}`.
* The MVP has no authentication or tenant isolation. Shared public workspaces must contain synthetic data only. CORS is not access control.
* `WORKSPACE_MODE=demo|real` controls initialization/reset policy. Origin is also stored in ApplicationSettings, so an environment change cannot relabel an existing synthetic workspace. Use a separate database and `python -m app.seed --empty` for real data, with private access controls.

## Workspace and products

| Method / path | Input / output |
|---|---|
| `GET /health` | `{status:"ok",service:"SAQTA",database:"connected",workspace_mode,demo_data}` |
| `GET /locations` | `[{id,bakery_id,name,address,city}]` |
| `GET /bakery` | `{id,name,city}` |
| `PATCH /bakery` | `{name?,city?}` → updated bakery |
| `GET /settings` | `{bakery_name,city,currency:"KZT",safety_buffer_percent,workspace_mode,demo_data,data_source,auth_enabled:false}` |
| `PATCH /settings` | `{bakery_name?,city?,safety_buffer_percent?}`; buffer 0–100 |
| `GET /products` | `[{id,name,category,unit,price_kzt,cost_kzt,weight_grams,is_active}]` |
| `POST /products` | Editable product fields without id → created product |
| `PATCH /products/{id}` | Partial editable fields → updated product |

`cost_kzt` is nullable. Missing cost is not replaced with retail price. Product names, units and weights must be verified by the bakery before interpreting financial/weight totals.

## Ledger and inventory

`GET /inventory?location_id&start_date&end_date` returns:

```text
[{id,product_id,product_name,category,location_id,location_name,
  produced,sold,written_off,on_hand,reserved,available,
  price_kzt,cost_kzt,weight_grams}]
```

`produced`, `sold`, `written_off` reflect the selected period. `on_hand`, `reserved`, `available` always represent live stock.

`GET /records?kind=production|sales|waste&location_id&start_date&end_date&page=1&page_size=100` returns:

```text
{items:[{id,kind,product_id,product_name,location_id,location_name,date,
         quantity,reason?,unit_price_kzt?,created_at}],total,page,page_size}
```

`POST /records` requires `{kind,product_id,location_id,date,quantity}`. Sales may include `unit_price_kzt`; waste requires nonempty `reason`. `PATCH /records/{kind}/{id}` accepts mutable `date`, `quantity`, and applicable `unit_price_kzt` for sales or nonempty `reason` for waste. Omit irrelevant fields, rather than sending empty reason strings.

Creates/edits check the historical ledger, current balance and marketplace reserves. Negative or impossible values return errors; records are not silently clamped. Collection-linked sales cannot be treated as unrelated manual records.

## Forecast and explanation

`POST /forecasts`:

```json
{"product_id":1,"location_id":1,"target_date":"2026-10-25","horizon_days":1}
```

Target must be at least tomorrow and within 90 days; horizon is 1–14. The calculation excludes observations dated on or after its initial target. Output:

```text
{id,product_id,product_name,location_id,target_date,horizon_days,
 predicted_demand,recommended_production,existing_inventory,expected_surplus,
 stockout_risk,method,explanation,generated_at,mae:number|null,evaluation_points,
 history:[{date,sales,production}],daily:[{date,predicted_demand,recommended_production}],
 demo_data,explanation_components:{history_days,safety_buffer_percent,existing_inventory,
 days:[{date,recent_sales:[{date,sales}],recent_mean,
        same_weekday_sales:[{date,sales}],same_weekday_mean:number|null,
        recent_weight,same_weekday_weight,weekday_difference:number|null,
        weighted_demand,predicted_demand,available_inventory,safety_buffer_percent,
        buffered_demand,recommended_production,demand_formula,production_formula}],
 limitations:[string]}}
```

Weights are 0.6/0.4 for the latest seven observed dates and up to four matching weekdays; fallback is 1/0 when no matching weekdays exist. Production is `max(0, ceil(predicted_demand × (1 + buffer/100)) − available_inventory)`. Existing inventory excludes Save reservations. Per-day components contain the actual samples and formulas; they are not generated narrative reasons. For multiple days, initial stock is consumed once and future-production surplus is not assumed fresh for reuse.

`GET /forecasts` returns stored results/summaries. Legacy stored forecasts may lack additive `explanation_components`. `GET /history?product_id&location_id` returns `[{date,sales,production,waste}]`.

Insufficient forecasting history returns an actionable error. MAE is reported only for genuine chronological held-out predictions; otherwise `mae=null` and `evaluation_points=0`. A synthetic metric does not establish real bakery accuracy. The risk indicator is a heuristic, not a calibrated probability.

## Rolling historical backtest

`GET /backtest?product_id&location_id&min_train_days=14&test_days=7&end_date=YYYY-MM-DD`

`min_train_days` is 14–365 **observed dates**; `test_days` is 1–30 observations. `end_date` is optional and cannot be future. A complete requested test window after the minimum training history is required. Response:

```text
{product_id,product_name,location_id,demo_data,data_source:"synthetic"|"real",
 status:"ok"|"insufficient_history",method,naive_method:"last_observed_sales",
 history_days,min_train_days,requested_test_days,evaluation_points,
 period:{start_date:string|null,end_date:string|null},
 metrics:{mae:number|null,wape_percent:number|null},
 naive_metrics:{mae:number|null,wape_percent:number|null},
 mae_improvement_percent:number|null,
 points:[{date,actual,predicted,naive_predicted,absolute_error,naive_absolute_error,
          training_observations,training_end_date}],
 observation_source:{days_with_sales_records,days_without_sales_records,
                     missing_calendar_days,zero_sales_interpretation},
 warnings:[string],requirements:[string],generated_at}
```

Each prediction uses only earlier observations, then its actual outcome becomes eligible history for later dates. Both models use the same test observations. Statistical demand is evaluated before integer production rounding. `MAE=mean(abs(actual−predicted))`; `WAPE=sum(abs(error))/sum(actual)×100`. WAPE is null for zero total actual sales; relative improvement is null for zero comparison MAE. Insufficient history returns HTTP 200 with null metrics and empty points, not invented accuracy.

Entirely absent calendar dates are not filled. The existing ledger interprets production/write-off dates without sale entries as zero sales; absence versus true zero is not independently verified and is exposed in warnings/source metadata. Short windows and synthetic origins remain explicit limitations.

## Operational and recorded impact metrics

`GET /dashboard?location_id&start_date&end_date&loss_reduction_percent` returns:

```text
{demo_data,period:{start_date,end_date},
 metrics:{produced,sold,unsold,written_off,waste_kg,loss_kzt,forecast_demand,
          potential_savings_kzt,active_listings},
 trends:[{date,sales,production,waste,forecast}],
 best_sellers:[{name,quantity}],surplus_products:[{name,quantity}],
 recommendations:[string],savings_scenario:{configured:boolean,loss_reduction_percent:number|null},savings_methodology:string}
```

Current unsold stock, surplus products and active listings are live. Production/sales/write-offs/losses are date-filtered. Forecast demand is for the day after the selected period end; trend predictions use only preceding data. `potential_savings_kzt` defaults to numeric 0 for compatibility, with `savings_scenario.configured=false` and a null percentage: no improvement is assumed. An explicitly supplied integer `loss_reduction_percent` (0–100) calculates recorded write-off cost × that user scenario, rounded half-up to integer KZT, and marks the scenario configured. It is never an achieved saving. The public manual calculator separately starts at 0% and also accounts for subscription cost.

`GET /impact?location_id&start_date&end_date` returns:

```text
{demo_data,recovered_units,recovered_weight_kg,recovered_value_kzt,
 written_off_units,written_off_kg,
 baseline:{start_date,end_date,waste_kg,observed_days,required_days,complete},
 comparison_complete:boolean,change_percent:number|null,
 trends:[{date,waste_kg,recovered_kg}],methodology:[string],
 potential_avoided_waste_kg:null}
```

Only collected orders count. Weight is recorded quantity × snapshotted catalog grams, not physical weighing. Value uses the reserved discounted price. The baseline is the preceding equal-length period; percentage is suppressed unless both periods have recorded production coverage for every date and baseline waste is nonzero. Coverage is a proxy, not proof of full reporting. No causal or CO₂ claim is made. The 42-day seed cannot provide a complete preceding 30-day baseline.

## Free SAQTA Save and demo orders

`GET /listings?location_id&search&status=active|inactive|all`:

```text
[{id,product_id,product_name,category,location_id,location_name,address,
 quantity,available_quantity,reserved_quantity,original_price_kzt,
 discounted_price_kzt,pickup_start,pickup_deadline,status,description,weight_grams}]
```

`POST /listings` accepts `{product_id,location_id,quantity,discounted_price_kzt,pickup_start,pickup_deadline,description?}`. `PATCH /listings/{id}` accepts `quantity?`, `discounted_price_kzt?`, pickup fields, `status:"active"|"inactive"`, `description?`.

Publication is free, with no mandatory payment or publication commission. Stock must be eligible and unallocated; discounted price must be below original price. Pickup deadline must follow the start and current time, within 48 hours in this demo. Allocated quantities are unavailable to normal sales. Status/quantity edits preserve existing reservations.

The announcement generator runs locally in the listing form. It formats user-supplied information deterministically, with edit/copy controls; it neither calls an LLM nor invents food safety details.

`GET /orders` returns:

```text
[{id,status:"reserved"|"collected"|"cancelled",customer_name,total_kzt,created_at,
 items:[{id,listing_id,product_name,quantity,unit_price_kzt,pickup_deadline,location_name}]}]
```

`POST /orders` accepts `{customer_name,items:[{listing_id,quantity}]}`. `POST /orders/{id}/cancel` restores reservation availability before deadline. `POST /orders/{id}/collect` confirms collection within the pickup window, deducts inventory and creates sales once. All return the order.

Orders are demonstration checkout without payment. Guarded conditional updates and transactions prevent overselling/partial multi-item reservations. Public demo orders are shared; do not enter personal information.

## CSV/XLSX inspect, preview and confirmed import

All three endpoints use multipart forms. Source origin must match the **persisted** workspace; a real-origin upload to demo is refused before reading its file. The UI additionally blocks that upload before sending bytes. Never mislabel a real file as demo.

### Inspect

`POST /imports/inspect`: `file` + `source_origin:"demo"|"real"`.

```text
{file_sha256,workspace_mode,source_origin,
 sheets:[{name,columns:[string],row_count}],selected_sheet,columns,
 sample_rows:[{row,values:{header:value}}],suggested_mapping,
 classification:"survey"|"daily_records_candidate"|"unclassified",
 limits:{max_bytes,max_rows,max_columns,formats:["csv","xlsx"]}}
```

Samples are at most five rows. Classification is a structural aid; a daily-record candidate still requires validation. Survey responses cannot be imported as sales history.

### Preview

`POST /imports/preview`: `file` + `options` as a JSON string:

```json
{
  "source_origin":"demo",
  "sheet":"CSV",
  "column_mapping":{"date":"date","quantity":"quantity","kind":"kind","product":"product_id","location":"location_id","reason":"reason","unit_price_kzt":"unit_price_kzt"},
  "date_format":"iso",
  "number_format":"dot",
  "source_label":"Synthetic import example"
}
```

Mapping is **target field → source header**. Supported targets: `date`, `quantity`, `kind`, `product`, `location`, `unit`, `unit_price_kzt`, `reason`. Optional defaults: `default_kind`, `default_product_id`, `default_location_id`; each must be selected explicitly if its column is unmapped. `sheet` is optional; `date_format` is `iso|dmy`, `number_format` is `dot|comma`.

Response:

```text
{preview_token,file_sha256,classification,workspace_mode,source_origin,selected_sheet,
 total_rows,valid_rows,duplicate_rows,rejected_rows,can_commit,
 errors:[{row,field,message}],warnings:[string],
 preview_rows:[{row,status:"ready"|"duplicate"|"error",record?}]}
```

Preview does not persist ledger records or stock. It validates unique headers, required mappings, exact product/location resolution, units, whole-number quantities/prices, dates, write-off reasons, historical balance, live reserves and duplicate identities. Up to 50 preview rows and 100 errors are returned. Zero/fractional quantities, ambiguous values and formulas are rejected rather than silently changed. Catalog unit aliases are normalized; weight-to-unit conversion is not guessed.

### Commit

`POST /imports/commit`: the same `file` + `options`, `preview_token`, and `confirm:"IMPORT SAQTA"`.

```text
{batch_id:number|null,imported_count,duplicate_count,rejected_count:0,message,source_origin?}
```

A stale file/mapping/catalog token returns 409; any validation errors block the entire batch with 422. Commit rechecks ledger/current availability, sorts valid rows chronologically with production before sales/write-offs on the same date, and writes one transaction. Duplicates are skipped. An all-duplicate commit returns zero imported rows and no new batch. Unique fingerprints protect overlapping concurrent imports; a conflict rolls the whole batch back with 409 and asks for preview again.

Duplicate identity is semantic across filenames and also checks existing matching manual ledger rows. Intentionally identical separate transactions may be treated as duplicates; aggregate or review them. Raw uploads are not stored. ImportBatch retains source hash/origin/label, sheet, mapping and counts; ImportFingerprint retains the unique record identity. Additive migration `c83f42d78b91` is required.

### Limits and legacy exchange

Maximum upload 2 MB; 5,000 rows/sheet; 80 columns; 25 XLSX sheets; 32 MB total expanded XLSX content. CSV supports UTF-8/BOM and comma/semicolon/tab separators. Only `.csv` and ordinary `.xlsx` are accepted; `.xls`, `.xlsm` and encrypted files are unsupported. Formulas are not executed.

`POST /import` remains compatible with canonical UTF-8 comma CSV: required `kind,product_id,location_id,date,quantity`; optional `reason,unit_price_kzt`; 2 MB/5,000 rows. It validates atomically in row order and returns `{imported,message}` or structured 422 errors, but **does not deduplicate repeated imports**. New UI uses inspect/preview/commit.

`GET /export?location_id&start_date&end_date` downloads canonical CSV; filters are inclusive. `POST /demo/reset` accepts `{confirm:"RESET SAQTA DEMO"}` and returns `{message,products,days,workspace_mode}`. Reset destroys only configured demo records and refuses real origin; it must never be part of migration/startup.

## Initialization and privacy

After `alembic upgrade head`, `python -m app.seed` initializes reproducible synthetic history: PRNG `24042`, 42 days × 5 products × 2 locations. Pickup windows use execution time. `--reset` is explicit; `--empty` initializes a separate real database without synthetic business records. Optional `AUTO_SEED_DEMO=true` only bootstraps an empty demo and preserves existing data.

The inspected private XLSX is one survey response, not a daily ledger. It is not uploaded to this API or turned into fabricated sales. Keep original files and preparation outputs in ignored private storage; use the sanitized structural report for documentation.
