export const PRICING = {
  preliminary: false,
  currency: "KZT",
  saveFeeKzt: 0,
  saveCommissionPercent: 0,
  saveSalesCommissionPercent: 5,
  quotasEnforced: true,
  paymentsConnected: true,
  plans: [
    { id: "free", name: "Free", monthlyKzt: 0, productLimit: 3, forecastLimit: 0, locationLimit: 1, description: "Каталог и бесплатное размещение остатков; Forecast открывается с платным тарифом", features: ["Бесплатная публикация в SaqtaFood Save", "Каталог и операционный учёт", "Отдельное демо на синтетических данных"], featured: false },
    { id: "starter", name: "Starter", monthlyKzt: 15000, productLimit: 20, forecastLimit: 300, locationLimit: 1, description: "Регулярно планировать производство одной пекарни", features: ["Возможности Free", "Учёт и импорт истории", "Тренды продаж и списаний", "Калькулятор сценарной экономии"], featured: true },
    { id: "pro", name: "Pro", monthlyKzt: 30000, productLimit: 100, forecastLimit: 1000, locationLimit: 10, description: "Проверять прогнозы и сравнивать несколько точек", features: ["Возможности Starter", "Историческая проверка MAE и WAPE", "Сравнение с простым прогнозом", "Несколько настроенных точек"], featured: false },
  ],
} as const;

export const PRICING_CONNECTION_TITLE = "Тарифы и оплата";
export const PRICING_CONNECTION_COPY = "Новые пекарни получают 14 дней Starter бесплатно. Тариф оплачивается картой онлайн или по счёту для ИП и ТОО и включается автоматически после оплаты. SaqtaFood Save остаётся бесплатным для размещения остатков.";
