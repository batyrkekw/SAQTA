"use client";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/components/language-provider";
import { Badge, Card, Notice } from "@/components/ui";
import type { AnalysisItem, AnalysisReport } from "./types";
const methods: Record<string, string> = {
  last: "Последнее наблюдение",
  mean7: "Среднее последних 7 наблюдений",
  seasonal: "Аналогичный день недели",
  weighted: "Среднее с поправкой на день недели",
  ridge: "Регрессия по прошлым продажам и дням недели",
  questionnaire: "Оценка по анкете",
};
const facts: Record<string, string> = {
  stale:
    "История не обновлялась больше недели. Обновите продажи перед принятием решения.",
  estimate:
    "Это предварительная оценка по вашим ответам, а не прогноз, обученный на истории.",
  history: "Расчёт основан на фактически записанных продажах.",
  empty: "Пока недостаточно данных для числового прогноза.",
  metrics:
    "Качество проверено на последних 7 наблюдениях, которые не участвовали в выборе модели.",
  no_metrics:
    "Данных пока недостаточно для отдельной проверки точности. Метрики не рассчитаны.",
  stock:
    "При планировании учтён подтверждённый остаток без резерва Save. Проверьте срок хранения.",
  no_stock:
    "Текущий остаток неизвестен. Рекомендация по производству не рассчитана.",
  daily_tracking:
    "Записывайте продажи и остатки каждый день, включая дни с нулевыми продажами.",
  gaps: "В истории есть пропуски. Они не заменены нулевыми продажами.",
  rising: "Средние продажи последних 7 наблюдений выше предыдущих 7.",
  falling: "Средние продажи последних 7 наблюдений ниже предыдущих 7.",
  stable: "Средние продажи двух последних периодов совпадают.",
};
function ResultItem({ item }: { item: AnalysisItem }) {
  const { t, number, dateLabel } = useI18n();
  const chart = [
    ...item.actual_history
      .slice(-28)
      .map((p) => ({
        date: p.date,
        actual: p.sold,
        demand: undefined as number | undefined,
      })),
    ...item.daily.map((p) => ({
      date: p.date,
      actual: undefined as number | undefined,
      demand: p.demand,
    })),
  ];
  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{item.product_name}</h2>
          <p className="mt-1 text-xs muted">
            {item.location_name} · {item.quality.observed_days}{" "}
            {t("наблюдаемых дней")}
          </p>
        </div>
        <Badge tone={item.status === "ready" ? "green" : "amber"}>
          {t(
            item.status === "ready"
              ? "По истории продаж"
              : item.status === "estimate"
                ? "Предварительная оценка"
                : "Нужно больше данных",
          )}
        </Badge>
      </div>
      {item.status !== "insufficient" && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-[#123c2f] p-5 text-white">
              <p className="text-xs text-[#c2d8bf]">
                {t("Ожидаемый спрос за период")}
              </p>
              <p className="mt-2 text-3xl font-medium">
                {number(item.demand ?? 0)}{" "}
                <span className="text-base">{t(item.unit)}</span>
              </p>
            </div>
            <div className="rounded-xl bg-[#f1f5e9] p-5">
              <p className="text-xs muted">{t("Рекомендуемое производство")}</p>
              <p className="mt-2 text-2xl font-medium">
                {item.production == null
                  ? "—"
                  : `${number(item.production)} ${t(item.unit)}`}
              </p>
            </div>
            <div className="rounded-xl bg-[#f1f5e9] p-5">
              <p className="text-xs muted">{t("Доступный текущий остаток")}</p>
              <p className="mt-2 text-2xl font-medium">
                {item.inventory == null
                  ? t("Неизвестно")
                  : `${number(item.inventory)} ${t(item.unit)}`}
              </p>
            </div>
          </div>
          <div
            className="mt-6 h-64 w-full"
            role="img"
            aria-label={t("Фактические продажи и прогноз спроса")}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chart}
                margin={{ top: 15, right: 15, left: -20, bottom: 5 }}
              >
                <CartesianGrid vertical={false} stroke="#e9eee2" />
                <XAxis
                  dataKey="date"
                  tickFormatter={dateLabel}
                  tick={{ fontSize: 10 }}
                  minTickGap={30}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip labelFormatter={(value) => dateLabel(String(value))} />
                <Area
                  dataKey="actual"
                  name={t("Фактические продажи")}
                  stroke="#237a57"
                  fill="#e8f0df"
                  strokeWidth={2}
                  connectNulls={false}
                />
                <Line
                  dataKey="demand"
                  name={t(
                    item.status === "estimate" ? "Оценка по анкете" : "Прогноз",
                  )}
                  stroke="#80964a"
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mb-5 flex gap-5 text-xs muted">
            <span>● {t("Фактические продажи")}</span>
            <span>
              ┄ {t(item.status === "estimate" ? "Оценка по анкете" : "Прогноз")}
            </span>
          </div>
        </>
      )}
      <ul className="space-y-2 text-sm leading-6 text-[#53635a]">
        {item.explanation.facts.map((fact) => (
          <li key={fact}>· {t(facts[fact] || fact)}</li>
        ))}
      </ul>
      <details className="mt-6 border-t border-[#e5e9e0] pt-4">
        <summary className="cursor-pointer text-sm font-medium text-[#237a57]">
          {t("Расчёт, качество данных и ограничения")}
        </summary>
        <div className="mt-5 space-y-5">
          <p className="text-sm">
            {t("Метод")}:{" "}
            {item.model ? t(methods[item.model] || item.model) : "—"}
          </p>
          <p className="text-xs muted">
            {t("Пропущенных дней")}: {item.quality.missing_days} ·{" "}
            {t("Явных нулей")}: {item.quality.zero_days} ·{" "}
            {item.quality.first_date ?? "—"} — {item.quality.last_date ?? "—"}
          </p>
          {item.metrics && (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  ["MAE", number(item.metrics.mae, 2)],
                  ["RMSE", number(item.metrics.rmse, 2)],
                  [
                    "WAPE",
                    item.metrics.wape === null
                      ? t("Не определена")
                      : `${number(item.metrics.wape, 2)}%`,
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-[#f4f6ef] p-4">
                    <p className="text-xs muted">{label}</p>
                    <p className="mt-1 font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs muted">
                {t("Проверочный период")}: {item.holdout_period?.join(" — ")}.{" "}
                {t(
                  "MAE и RMSE измеряются в единицах товара; WAPE — доля абсолютной ошибки. Это не гарантия будущей точности.",
                )}
              </p>
              <div className="overflow-auto">
                <table>
                  <thead>
                    <tr>
                      <th>{t("Сравнение на периоде выбора модели")}</th>
                      <th>MAE</th>
                      <th>RMSE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.comparison.map((model) => (
                      <tr key={model.model}>
                        <td>{t(methods[model.model])}</td>
                        <td>{number(model.mae, 2)}</td>
                        <td>{number(model.rmse, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {item.daily.length > 0 && (
            <div className="overflow-auto">
              <table>
                <thead>
                  <tr>
                    {["Дата", "Спрос", "Производство", "Расчётный избыток"].map(
                      (label) => (
                        <th key={label}>{t(label)}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {item.daily.map((point) => (
                    <tr key={point.date}>
                      <td>{dateLabel(point.date)}</td>
                      <td>{point.demand}</td>
                      <td>{point.production ?? "—"}</td>
                      <td>{point.surplus ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Notice>
            {t(
              "Расчётный избыток не является физическим запасом и не публикуется в Save автоматически. Буфер производства — 10%. Перенос будущих остатков не предполагается.",
            )}
          </Notice>
          <p className="text-xs muted">{t(item.inventory_source.warning)}</p>
          <p className="text-xs muted">
            {t(
              "Погода, акции и праздники сохранены как контекст. Их причинное влияние не оценено. Доверительный интервал не рассчитан.",
            )}
          </p>
        </div>
      </details>
    </Card>
  );
}
export function Results({ report }: { report: AnalysisReport }) {
  const { t, pickupTime } = useI18n();
  return (
    <section className="space-y-5" aria-label={t("Результат анализа")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {t("Ваш план на ближайшие дни")}
        </h2>
        <p className="text-xs muted">
          {pickupTime(report.created_at)} · {report.horizon_days} {t("дней")}
        </p>
      </div>
      {report.items.length ? (
        report.items.map((item) => (
          <ResultItem
            key={`${item.product_id}:${item.location_id}`}
            item={item}
          />
        ))
      ) : (
        <Card>
          <Notice>
            {t("Добавьте товары через файл или анкету, чтобы начать анализ.")}
          </Notice>
        </Card>
      )}
    </section>
  );
}
