# Internal SAQTA planning model

Repository-only team reference. This historical illustrative model is not a customer feature, a price commitment or verified operating performance. It is excluded from the public documentation copy script. The retained frontend module is frontend/internal/economics-page.tsx; its calculation library and backend internal endpoint remain tested. The endpoint is excluded from public OpenAPI. Do not add this document to public builds.

## Unit economics: hypothetical assumptions

| Input / result | Default |
|---|---:|
| Subscription per location / month | 30,000 ₸ |
| Hosting and database | 3,000 ₸ |
| Forecast computation | 2,000 ₸ |
| Customer support | 3,000 ₸ |
| Backups / miscellaneous | 1,000 ₸ |
| Total variable costs | 9,000 ₸ |
| Contribution margin | 21,000 ₸ / 70% |
| CAC | 40,000 ₸ |
| Lifetime | 12 months |
| Contribution-based LTV | 252,000 ₸ |
| LTV/CAC | 6.3 |
| CAC payback | ≈ 1.9 months |

`contribution = revenue − variable costs`; `margin% = contribution/revenue × 100`; `LTV = contribution × lifetime`; `LTV/CAC = LTV/CAC`; `payback = CAC/contribution`; `customers for target = ceil(monthly revenue target/subscription)`. Undefined denominators display an unavailable value. Contribution margin is **not net profit**. Fixed company expenses, taxes and development costs are excluded.

The editable illustrative funnel is a target: **200 contacted → 60 responses → 30 demonstrations → 15 pilots → 10 paying locations**. Ten continuously paying locations at 30,000 ₸/month imply **3,600,000 ₸ ARR**. Actual first-year revenue can be lower as locations join gradually. These are assumptions to validate, not operating results.
