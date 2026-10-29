"use client";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  CalendarPlus,
  FileSpreadsheet,
  History,
  ListChecks,
  Play,
  RefreshCw,
} from "lucide-react";
import { useI18n } from "@/components/language-provider";
import {
  Card,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  Notice,
  PageHeader,
  today,
} from "@/components/ui";
import { errorMessage, post, useApi } from "@/lib/api";
import { formValidationMessage } from "@/lib/validation";
import { useAccount } from "@/features/account/account";
import { Questionnaire } from "./questionnaire";
import { ImportData } from "./import-data";
import { Results } from "./results";
import type { AnalysisReport, AnalysisState, Profile } from "./types";
type View = "home" | "import" | "questionnaire" | "history";
export default function AnalysisWorkspace() {
  const { account } = useAccount();
  return <AnalysisWorkspaceContent key={account?.user.id ?? "anonymous"} />;
}

function AnalysisWorkspaceContent() {
  const { t, pickupTime } = useI18n();
  const { account, open, loading: accountLoading } = useAccount();
  const state = useApi<AnalysisState>(account ? "/analysis/state" : null);
  const [view, setView] = useState<View>("home"),
    [daily, setDaily] = useState(false),
    [report, setReport] = useState<AnalysisReport | null>(null),
    [importedProfile, setImportedProfile] = useState<Profile | null>(null),
    [revision, setRevision] = useState(0),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [horizon, setHorizon] = useState("7"),
    [product, setProduct] = useState(""),
    [location, setLocation] = useState(""),
    [task, setTask] = useState("demand");
  const latest = report || state.data?.latest;
  const history = useApi<AnalysisReport[]>(
    view === "history" && account ? "/analysis/runs" : null,
  );
  function select(next: View) {
    if (!account) {
      open();
      return;
    }
    setView(next);
    setError("");
  }
  function updated() {
    state.reload();
    setNotice(
      "Данные сохранены. Запустите анализ, чтобы обновить рекомендации.",
    );
  }
  async function analyze() {
    setPending(true);
    setError("");
    try {
      const value = await post<AnalysisReport>("/analysis/runs", {
        horizon_days: Number(horizon),
        task,
        ...(product ? { product_id: Number(product) } : {}),
        ...(location ? { location_id: Number(location) } : {}),
      });
      setReport(value);
      if (state.data?.explanation_available) {
        void post<AnalysisReport>(`/analysis/runs/${value.run_id}/explain`, {})
          .then((refined) =>
            setReport((current) =>
              current?.run_id === refined.run_id ? refined : current,
            ),
          )
          .catch(() => {});
      }
      setNotice("");
      setView("home");
      state.reload();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="SAQTA FORECAST"
        title={t("Планируйте по своим данным.")}
        description={t(
          "Загрузите продажи или расскажите о бизнесе — SAQTA поможет выбрать следующий шаг.",
        )}
      />
      {view === "home" && (
        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              key: "import" as const,
              title: "Загрузить Excel или CSV",
              description:
                "У вас есть история продаж. Проверим данные и построим прогноз.",
              icon: FileSpreadsheet,
            },
            {
              key: "questionnaire" as const,
              title: "Начать без истории",
              description:
                "Короткая анкета о бизнесе и продуктах. Можно отвечать приблизительно.",
              icon: ListChecks,
            },
          ].map(({ key, title, description, icon: Icon }) => (
            <button
              key={key}
              className={`group flex items-start gap-5 rounded-3xl border p-6 text-left transition-colors md:p-8 ${key === "import" ? "border-[#123c2f] bg-[#123c2f] text-white hover:bg-[#20503c]" : "border-[#dfe6db] bg-white hover:bg-[#f0f5e8]"}`}
              onClick={() => select(key)}
            >
              <Icon
                size={30}
                className={
                  key === "import"
                    ? "shrink-0 text-[#c7f36b]"
                    : "shrink-0 text-[#65824a]"
                }
              />
              <div className="flex-1">
                <h2 className="text-lg font-semibold">{t(title)}</h2>
                <p
                  className={`mt-2 max-w-md text-sm leading-6 ${key === "import" ? "text-[#c8dbc8]" : "text-[#637369]"}`}
                >
                  {t(description)}
                </p>
              </div>
              <ArrowRight className="mt-1 shrink-0" size={20} />
            </button>
          ))}
        </div>
      )}
      {!account && !accountLoading && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">
                {t("Ваши данные остаются в вашем аккаунте")}
              </h2>
              <p className="mt-2 text-sm muted">
                {t(
                  "Войдите или зарегистрируйтесь, чтобы сохранить историю и возвращаться к расчётам. Анализ доступен бесплатно.",
                )}
              </p>
            </div>
            <button className="btn-primary" onClick={open}>
              {t("Войти или создать аккаунт")}
            </button>
          </div>
        </Card>
      )}
      {account && (
        <>
          <div className="flex flex-wrap gap-2">
            {view !== "home" && (
              <button className="btn-secondary" onClick={() => setView("home")}>
                {t("К результатам")}
              </button>
            )}
            <button className="btn-secondary" onClick={() => select("import")}>
              <RefreshCw size={15} />
              {t("Обновить данные")}
            </button>
            <button
              className="btn-secondary"
              onClick={() => select("questionnaire")}
            >
              <ListChecks size={15} />
              {t("Моя анкета")}
            </button>
            <button className="btn-secondary" onClick={() => setDaily(true)}>
              <CalendarPlus size={15} />
              {t("Записать день")}
            </button>
            <button className="btn-secondary" onClick={() => select("history")}>
              <History size={15} />
              {t("История расчётов")}
            </button>
          </div>
          {state.error ? (
            <ErrorState error={state.error} retry={state.reload} />
          ) : state.loading && !state.data ? (
            <Loading />
          ) : (
            state.data && (
              <>
                {notice && <Notice kind="success">{t(notice)}</Notice>}
                {error && <Notice kind="error">{t(error)}</Notice>}
                {view === "import" && (
                  <ImportData
                    state={state.data}
                    onImported={updated}
                    onProfile={(p) => {
                      setImportedProfile(p);
                      setRevision((r) => r + 1);
                      setView("questionnaire");
                    }}
                  />
                )}
                {view === "questionnaire" && (
                  <Questionnaire
                    key={revision}
                    locations={state.data.locations}
                    saved={importedProfile || state.data.profile}
                    onSaved={() => {
                      setImportedProfile(null);
                      updated();
                    }}
                  />
                )}
                {view !== "history" && state.data.products.length > 0 && (
                  <Card>
                    <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-5">
                      <Field label={t("Что рассчитать?")}>
                        <select
                          value={task}
                          onChange={(e) => setTask(e.target.value)}
                          className="field"
                        >
                          <option value="demand">{t("Спрос")}</option>
                          <option value="production">
                            {t("Производство")}
                          </option>
                          <option value="surplus">{t("Остатки")}</option>
                        </select>
                      </Field>
                      <Field label={t("Товар")}>
                        <select
                          className="field"
                          value={product}
                          onChange={(e) => setProduct(e.target.value)}
                        >
                          <option value="">{t("Все товары")}</option>
                          {state.data.products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t("Точка")}>
                        <select
                          className="field"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                        >
                          <option value="">{t("Все точки")}</option>
                          {state.data.locations.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t("Период")}>
                        <select
                          className="field"
                          value={horizon}
                          onChange={(e) => setHorizon(e.target.value)}
                        >
                          {[1, 7, 14].map((n) => (
                            <option value={n} key={n}>
                              {n} {t(n === 1 ? "день" : "дней")}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <button
                        className="btn-primary"
                        disabled={pending}
                        onClick={() => void analyze()}
                      >
                        <Play size={15} />
                        {t(pending ? "Считаем…" : "Запустить анализ")}
                      </button>
                    </div>
                  </Card>
                )}
                {view === "home" &&
                  (latest ? (
                    <Results report={latest} />
                  ) : (
                    <Card>
                      <Empty
                        title={t("Здесь появится ваш первый анализ")}
                        description={t(
                          "Начните с файла или анкеты. Графики появятся после расчёта на ваших данных.",
                        )}
                      />
                    </Card>
                  ))}
                {view === "history" &&
                  (history.error ? (
                    <ErrorState error={history.error} retry={history.reload} />
                  ) : history.loading ? (
                    <Loading />
                  ) : history.data?.length ? (
                    <div className="space-y-3">
                      {history.data.map((run) => (
                        <Card key={run.run_id}>
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                              <h2 className="font-medium">
                                {pickupTime(run.created_at)}
                              </h2>
                              <p className="mt-1 text-xs muted">
                                {run.items.length} {t("товаров и точек")} ·{" "}
                                {run.horizon_days} {t("дней")}
                              </p>
                            </div>
                            <button
                              className="btn-secondary"
                              onClick={() => {
                                setReport(run);
                                setView("home");
                              }}
                            >
                              {t("Открыть расчёт")}
                            </button>
                          </div>
                          <Actuals run={run.run_id} />
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card>
                      <Empty title={t("Расчётов пока нет")} />
                    </Card>
                  ))}
                {state.data.imports.length > 0 && view === "import" && (
                  <details className="text-sm">
                    <summary>{t("Последние загрузки")}</summary>
                    <div className="mt-4 overflow-auto">
                      <table>
                        <thead>
                          <tr>
                            {["Источник", "Дата", "Записей", "Дубликаты"].map(
                              (label) => (
                                <th key={label}>{t(label)}</th>
                              ),
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {state.data.imports.map((b) => (
                            <tr key={b.id}>
                              <td>
                                {b.source === "Daily entry"
                                  ? t("Дневная запись")
                                  : b.source}
                              </td>
                              <td>{pickupTime(b.created_at)}</td>
                              <td>{b.rows}</td>
                              <td>{b.duplicates}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
                {daily && (
                  <Daily
                    state={state.data}
                    close={() => setDaily(false)}
                    done={() => {
                      setDaily(false);
                      updated();
                    }}
                  />
                )}
              </>
            )
          )}
        </>
      )}
    </div>
  );
}
function Daily({
  state,
  close,
  done,
}: {
  state: AnalysisState;
  close: () => void;
  done: () => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem = formValidationMessage(e.currentTarget);
    if (problem) {
      setError(problem);
      return;
    }
    const data = new FormData(e.currentTarget);
    const value: Record<string, string | number | null> = {};
    for (const [key, v] of data)
      value[key] = key === "date" ? String(v) : v === "" ? null : Number(v);
    setPending(true);
    setError("");
    try {
      await post("/analysis/observations", value);
      done();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal title={t("Записать день")} onClose={close}>
      {state.products.length ? (
        <form noValidate onSubmit={(e) => void submit(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("Товар")}>
              <select className="field" name="product_id" required>
                {state.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {t(p.unit)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("Точка")}>
              <select className="field" name="location_id" required>
                {state.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("Дата")}>
              <input
                className="field"
                name="date"
                type="date"
                required
                max={today()}
                defaultValue={today()}
              />
            </Field>
            {[
              ["sold", "Продано"],
              ["produced", "Произведено"],
              ["remaining", "Конечный остаток"],
              ["opening", "Начальный остаток"],
              ["waste", "Списано"],
              ["unit_price_kzt", "Цена, ₸"],
              ["revenue", "Выручка"],
            ].map(([key, label]) => (
              <Field key={key} label={t(label) + (key === "sold" ? " *" : "")}>
                <input
                  type="number"
                  name={key}
                  min={0}
                  max={key === "revenue" ? 1000000000 : 1000000}
                  required={key === "sold"}
                  className="field"
                  placeholder={key === "sold" ? undefined : t("Неизвестно")}
                />
              </Field>
            ))}
          </div>
          <Notice>
            {t(
              "Укажите полный итог дня. Эта запись используется для анализа и не меняет физический запас Save.",
            )}
          </Notice>
          {error && <Notice kind="error">{t(error)}</Notice>}
          <button className="btn-primary" disabled={pending}>
            {t(pending ? "Сохраняем…" : "Сохранить день")}
          </button>
        </form>
      ) : (
        <Notice>{t("Сначала добавьте товары через анкету или импорт.")}</Notice>
      )}
    </Modal>
  );
}
function Actuals({ run }: { run: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const actuals = useApi<
    {
      product: string;
      date: string;
      predicted: number;
      actual: number;
      error: number;
    }[]
  >(open ? `/analysis/runs/${run}/actuals` : null);
  return (
    <details
      className="mt-4 text-xs"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>{t("Сравнить с фактическими продажами")}</summary>
      {actuals.error ? (
        <p>{t(actuals.error)}</p>
      ) : actuals.data?.length ? (
        <div className="mt-3 overflow-auto">
          <table>
            <thead>
              <tr>
                {["Товар", "Дата", "Прогноз", "Факт", "Ошибка"].map((s) => (
                  <th key={s}>{t(s)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {actuals.data.map((row, i) => (
                <tr key={i}>
                  <td>{row.product}</td>
                  <td>{row.date}</td>
                  <td>{row.predicted}</td>
                  <td>{row.actual}</td>
                  <td>{row.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 muted">
          {t("Фактические продажи за прогнозный период ещё не записаны.")}
        </p>
      )}
    </details>
  );
}
