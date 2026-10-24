export const PRICING = {
  preliminary: true,
  currency: "KZT",
  saveFeeKzt: 0,
  saveCommissionPercent: 0,
  quotasEnforced: false,
  paymentsConnected: false,
  plans: [
    { id: "free", name: "Free", monthlyKzt: 0, productLimit: 3, forecastLimit: 10, locationLimit: 1, description: "Познакомиться с планированием на основе данных", features: ["Прогноз спроса по истории продаж", "Рекомендация с учётом остатков", "Объяснение расчёта"], featured: false },
    { id: "starter", name: "Starter", monthlyKzt: 15000, productLimit: 20, forecastLimit: 300, locationLimit: 1, description: "Регулярно планировать производство одной пекарни", features: ["Возможности Free", "Учёт и импорт истории", "Тренды продаж и списаний", "Калькулятор сценарной экономии"], featured: true },
    { id: "pro", name: "Pro", monthlyKzt: 30000, productLimit: 100, forecastLimit: 1000, locationLimit: null, description: "Проверять прогнозы и сравнивать несколько точек", features: ["Возможности Starter", "Историческая проверка MAE и WAPE", "Сравнение с простым прогнозом", "Несколько настроенных точек"], featured: false },
  ],
} as const;

export const PRICING_CONNECTION_TITLE = "Подключение тарифов";
export const PRICING_CONNECTION_COPY = "Платные тарифы SAQTA Forecast находятся на этапе подготовки. Выбор тарифа пока не запускает оплату или активацию подписки. Мы сообщим о доступности подключения, когда процесс будет готов. SAQTA Save остаётся бесплатным для размещения остатков.";
