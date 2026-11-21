// One paid plan for businesses, priced per location. Buyers never pay. Mirrors backend/app/services/billing.py.
export const PRICING = {
  preliminary: false,
  currency: "KZT",
  planName: "Business",
  perLocationKzt: 15000,
  trialDays: 14,
  trialLocations: 3,
  perLocation: { products: 100, forecastRuns: 500 },
  // A year costs ten months.
  periods: [{ months: 1, multiplier: 1 }, { months: 3, multiplier: 3 }, { months: 12, multiplier: 10 }],
  saveFeeKzt: 0,
  saveCommissionPercent: 0,
  saveSalesCommissionPercent: 5,
  quotasEnforced: true,
  paymentsConnected: true,
  features: ["План выпечки на каждый день", "Загрузка Excel и CSV, анкета без истории", "Проверка прогноза на истории", "Все функции на каждой точке"],
} as const;

export const PRICING_CONNECTION_TITLE = "Тарифы и оплата";
export const PRICING_CONNECTION_COPY = "Один тариф для бизнеса: 15 000 ₸ в месяц за точку, первые 14 дней бесплатно. Оплата картой онлайн или по счёту для ИП и ТОО, тариф включается автоматически. Покупатели пользуются SaqtaFood Save бесплатно.";
