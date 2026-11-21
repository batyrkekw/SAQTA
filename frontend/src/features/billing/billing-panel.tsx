"use client";

import { useI18n } from "@/components/language-provider";
import { Badge, Card, Field, Loading, Modal, Notice } from "@/components/ui";
import { useAccount } from "@/features/account/account";
import { useForecastAccess } from "@/features/forecast/access-panel";
import { PRICING } from "@/features/forecast/pricing.config";
import { api, errorMessage, post, useApi } from "@/lib/api";
import { type BillingPlans, type CheckoutResult, type Invoice, type WidgetLaunch, kztDate, methodLabel, payByCard, planName, statusLabel } from "@/lib/billing";
import { CreditCard, FileText, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

type PlanId = "starter" | "pro";
type Months = 1 | 3 | 12;

function CurrentPlan({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n();
  const access = useForecastAccess();
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const sub = access?.subscription;
  if (!access?.signedIn || !sub) return null;
  const until = kztDate(sub.expires_at);
  const title = !sub.active ? "Нет активного тарифа" : sub.is_trial ? `Пробный период ${planName(sub.plan)} до ${until}` : `${planName(sub.plan)} оплачен до ${until}`;
  async function stopRenewal() {
    setPending(true); setError("");
    try { await post("/billing/auto-renew", { enabled: false }); access?.reload(); onChanged(); }
    catch (reason) { setError(errorMessage(reason)); } finally { setPending(false); }
  }
  return <Card title={t("Ваш тариф")} action={<Badge tone={sub.active && !sub.is_trial ? "green" : "amber"}>{t(sub.active ? sub.is_trial ? "ПРОБНЫЙ" : "ОПЛАЧЕН" : "НЕ ОПЛАЧЕН")}</Badge>}>
    <p className="text-base font-semibold text-[#123C2F]">{t(title)}</p>
    <p className="mt-2 text-xs leading-relaxed text-[#5D6B62]">{t(sub.active ? sub.is_trial ? "Все функции Starter открыты. Оплатите тариф до конца пробного периода, чтобы прогнозы и импорт не остановились." : "Новая оплата того же тарифа продлевает срок с даты окончания. Смена тарифа начинает новый период с сегодняшнего дня." : "Прогноз, импорт и проверка на истории откроются сразу после оплаты.")}</p>
    {sub.auto_renew && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-[#F2F5EC] p-3 text-xs text-[#536257]"><RefreshCw size={15} className="text-[#237A57]" />{t("Автопродление включено: карта списывается раз в месяц.")}<button className="btn-secondary !py-1.5 !text-xs" disabled={pending} onClick={() => { void stopRenewal(); }}>{t(pending ? "Отключаем…" : "Отключить автопродление")}</button></div>}
    {error && <div className="mt-3"><Notice kind="error">{t(error)}</Notice></div>}
  </Card>;
}

function InvoiceList({ rows, reload }: { rows: Invoice[]; reload: () => void }) {
  const { t, money } = useI18n();
  const [error, setError] = useState("");
  if (!rows.length) return null;
  async function cancel(number: string) {
    setError("");
    try { await post(`/billing/invoices/${number}/cancel`, {}); reload(); } catch (reason) { setError(errorMessage(reason)); }
  }
  return <Card title={t("Счета и платежи")} subtitle={t("Последние 50 документов организации")}>
    <div className="overflow-x-auto"><table className="min-w-[640px] text-xs"><thead><tr><th>{t("Номер")}</th><th>{t("Дата")}</th><th>{t("Тариф")}</th><th>{t("Сумма")}</th><th>{t("Способ")}</th><th>{t("Статус")}</th><th /></tr></thead>
      <tbody>{rows.map(row => <tr key={row.number}><td className="font-medium text-[#123C2F]">{row.number}</td><td>{t(kztDate(row.created_at))}</td><td>{t(`${planName(row.plan)}, ${row.months} мес.`)}</td><td>{t(money(row.amount_kzt))}</td><td>{t(methodLabel[row.method])}</td>
        <td><Badge tone={row.status === "paid" ? "green" : row.status === "pending" ? "amber" : "gray"}>{t(statusLabel[row.status])}</Badge>{row.status === "paid" && row.period_end && <span className="mt-1 block text-[#5D6B62]">{t("до ")}{t(kztDate(row.period_end))}</span>}{row.failure_reason && row.status === "pending" && <span className="mt-1 block text-red-700">{t(row.failure_reason)}</span>}</td>
        <td className="whitespace-nowrap text-right">{row.method === "transfer" && <Link className="font-semibold text-[#237A57] underline" href={`/billing/invoice/${row.number}`}>{t("Открыть счёт")}</Link>}{row.status === "pending" && <button className="ml-3 text-[#9B6654] underline" onClick={() => { void cancel(row.number); }}>{t("Отменить")}</button>}</td></tr>)}</tbody></table></div>
    {error && <div className="mt-3"><Notice kind="error">{t(error)}</Notice></div>}
  </Card>;
}

export default function BillingPanel() {
  const { t, money } = useI18n();
  const router = useRouter();
  const access = useForecastAccess();
  const { account } = useAccount();
  const plans = useApi<BillingPlans>("/billing/plans");
  const invoices = useApi<{ invoices: Invoice[] }>(access?.signedIn ? "/billing/invoices" : null);
  const [plan, setPlan] = useState<PlanId>("starter"), [months, setMonths] = useState<Months>(1);
  const [method, setMethod] = useState<"card" | "transfer" | null>(null), [autoRenew, setAutoRenew] = useState(true);
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [waiting, setWaiting] = useState<string | null>(null), [simulated, setSimulated] = useState<{ invoice: Invoice; widget: WidgetLaunch } | null>(null);

  const methods = plans.data?.methods;
  const chosen = method ?? (methods?.card ? "card" : methods?.transfer ? "transfer" : null);
  const selected = plans.data?.plans.find(item => item.id === plan);
  const period = selected?.periods.find(item => item.months === months);
  const limits = PRICING.plans.find(item => item.id === plan);

  const refresh = useRef(() => {});
  useEffect(() => { refresh.current = () => { access?.reload(); invoices.reload(); }; });

  // After the card form closes, the bank confirms through the server; poll until the invoice is paid.
  useEffect(() => {
    if (!waiting) return;
    let tries = 0;
    const timer = window.setInterval(async () => {
      tries += 1;
      try {
        const row = await api<Invoice>(`/billing/invoices/${waiting}`);
        if (row.status === "paid") { setWaiting(null); setMessage(`Оплата получена. Тариф ${planName(row.plan)} активен до ${kztDate(row.period_end)}.`); refresh.current(); }
      } catch { /* keep polling; a network blip must not lose a successful payment */ }
      if (tries >= 40) { setWaiting(null); setMessage("Платёж отправлен в банк. Подтверждение может занять несколько минут: статус обновится в списке счетов."); refresh.current(); }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [waiting]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chosen) return;
    const data = new FormData(event.currentTarget);
    setPending(true); setError(""); setMessage("");
    try {
      const result = await post<CheckoutResult>("/billing/checkout", {
        plan, months, method: chosen, auto_renew: chosen === "card" && months === 1 && autoRenew,
        payer_name: String(data.get("payer_name") || "").trim(), payer_bin: String(data.get("payer_bin") || "").trim(),
        payer_email: String(data.get("payer_email") || "").trim(),
      });
      invoices.reload();
      if (result.invoice.method === "transfer") { router.push(`/billing/invoice/${result.invoice.number}`); return; }
      if (!result.widget) throw new Error("Платёжная форма недоступна.");
      if (result.widget.simulator) { setSimulated({ invoice: result.invoice, widget: result.widget }); return; }
      const outcome = await payByCard(result.widget.intent);
      if (outcome.type === "payment" || outcome.status === "success") { setMessage("Банк принял платёж. Ждём подтверждения…"); setWaiting(result.invoice.number); }
      else if (outcome.type === "cancel") setMessage("Оплата не завершена: форма закрыта. Счёт сохранён, его можно оплатить позже.");
      else setError(outcome.message || "Банк отклонил платёж. Проверьте данные карты или выберите оплату по счёту.");
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setPending(false); }
  }

  async function simulate() {
    if (!simulated) return;
    setPending(true);
    try { const row = await post<Invoice>(`/billing/simulate/${simulated.invoice.number}`, {}); setSimulated(null); setMessage(`Тестовая оплата проведена. Тариф ${planName(row.plan)} активен до ${kztDate(row.period_end)}.`); access?.reload(); invoices.reload(); }
    catch (reason) { setError(errorMessage(reason)); } finally { setPending(false); }
  }

  if (plans.loading && !plans.data) return <Loading label={t("Загружаем тарифы…")} />;
  if (!plans.data) return <Notice kind="error">{t(plans.error || "Не удалось загрузить тарифы.")} <button className="underline" onClick={plans.reload}>{t("Повторить")}</button></Notice>;
  const canPay = Boolean(access?.signedIn && chosen);

  return <div className="space-y-6">
    <div className="max-w-3xl"><h2 className="text-2xl font-semibold tracking-tight text-[#123C2F]">{t("Тариф и оплата")}</h2><p className="mt-2 text-sm leading-relaxed text-[#5D6B62]">{t(`Подписка открывает SaqtaFood Forecast. Новые пекарни получают ${plans.data.trial_days} дней Starter бесплатно. SaqtaFood Save остаётся бесплатным на любом плане.`)}</p></div>
    <CurrentPlan onChanged={invoices.reload} />
    {message && <Notice kind="success">{t(message)}</Notice>}
    {waiting && <div className="flex items-center gap-2 text-xs text-[#536257]"><LoaderCircle size={15} className="animate-spin" />{t("Проверяем подтверждение оплаты…")}</div>}

    <form noValidate onSubmit={event => { void submit(event); }} className="grid items-start gap-6 lg:grid-cols-[1.25fr_1fr]">
      <div className="space-y-4">
        <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="sr-only">{t("Тариф")}</legend>{plans.data.plans.map(item => {
          const info = PRICING.plans.find(p => p.id === item.id);
          const active = plan === item.id;
          return <label key={item.id} className={`flex cursor-pointer flex-col rounded-2xl border p-5 transition-colors ${active ? "border-[#237A57] bg-[#123C2F] text-white" : "border-[#E2E8DB] bg-white text-[#123C2F] hover:border-[#9FC7A6]"}`}>
            <input type="radio" name="plan" value={item.id} checked={active} onChange={() => setPlan(item.id)} className="sr-only" />
            <span className="flex items-center justify-between text-lg font-semibold">{planName(item.id)}{item.id === "starter" && <span className="rounded-full bg-[#C7F36B] px-2.5 py-1 text-xs font-semibold text-[#123C2F]">{t("Для одной точки")}</span>}</span>
            <span className={`mt-3 text-3xl font-semibold tracking-tight ${active ? "text-[#C7F36B]" : ""}`}>{t(money(item.monthly_kzt))}</span>
            <span className={`text-xs ${active ? "text-[#D3E0D6]" : "text-[#5D6B62]"}`}>{t("в месяц")}</span>
            {info && <span className={`mt-4 space-y-1 border-t pt-3 text-xs ${active ? "border-white/15 text-[#D3E0D6]" : "border-[#E5EBDD] text-[#5D6B62]"}`}><span className="block">{t(`До ${info.productLimit} продуктов`)}</span><span className="block">{t(`До ${info.forecastLimit} запусков анализа в месяц`)}</span><span className="block">{t(info.locationLimit === 1 ? "1 точка" : `До ${info.locationLimit} точек`)}</span></span>}
          </label>;
        })}</fieldset>
        <fieldset className="rounded-2xl border border-[#E2E8DB] bg-white p-4"><legend className="px-1 text-xs font-medium text-[#536257]">{t("Период оплаты")}</legend><div className="grid grid-cols-3 gap-2">{selected?.periods.map(item => <label key={item.months} className={`cursor-pointer rounded-xl border px-3 py-3 text-center text-xs ${months === item.months ? "border-[#237A57] bg-[#EAF3E6] font-semibold text-[#123C2F]" : "border-[#E2E8DB] text-[#536257]"}`}><input type="radio" name="months" className="sr-only" checked={months === item.months} onChange={() => setMonths(item.months)} />{t(item.months === 1 ? "1 месяц" : item.months === 3 ? "3 месяца" : "12 месяцев")}<span className="mt-1 block text-[#237A57]">{t(item.saving_kzt ? `выгода ${money(item.saving_kzt)}` : money(item.amount_kzt))}</span></label>)}</div></fieldset>
      </div>

      <Card title={t("Оплата")} subtitle={t(limits ? `${planName(plan)}, ${months} мес.` : "")}>
        {!access?.signedIn ? <Notice>{t(access?.isDemo ? "В публичном DEMO оплата недоступна. Зарегистрируйте пекарню в рабочем пространстве." : "Войдите в организацию или создайте её выше, чтобы оплатить тариф.")}</Notice> : <div className="space-y-4">
          <fieldset className="space-y-2"><legend className="mb-2 text-xs font-medium text-[#536257]">{t("Способ оплаты")}</legend>
            <label className={`flex items-start gap-3 rounded-xl border p-3 text-xs ${methods?.card ? "cursor-pointer" : "opacity-60"} ${chosen === "card" ? "border-[#237A57] bg-[#F2F8EF]" : "border-[#E2E8DB]"}`}><input type="radio" name="method" disabled={!methods?.card} checked={chosen === "card"} onChange={() => setMethod("card")} className="mt-0.5" /><CreditCard size={17} className="shrink-0 text-[#237A57]" /><span><span className="block font-semibold text-[#123C2F]">{t("Картой онлайн")}</span><span className="text-[#5D6B62]">{t(methods?.card ? "Visa, Mastercard. Тариф включится сразу после оплаты." : "Появится после подключения эквайринга TipTop Pay.")}</span></span></label>
            <label className={`flex items-start gap-3 rounded-xl border p-3 text-xs ${methods?.transfer ? "cursor-pointer" : "opacity-60"} ${chosen === "transfer" ? "border-[#237A57] bg-[#F2F8EF]" : "border-[#E2E8DB]"}`}><input type="radio" name="method" disabled={!methods?.transfer} checked={chosen === "transfer"} onChange={() => setMethod("transfer")} className="mt-0.5" /><FileText size={17} className="shrink-0 text-[#237A57]" /><span><span className="block font-semibold text-[#123C2F]">{t("Счёт на оплату")}</span><span className="text-[#5D6B62]">{t(methods?.transfer ? "Для ИП и ТОО: перевод по реквизитам или Kaspi. Тариф включится после поступления оплаты." : "Появится после указания реквизитов продавца.")}</span></span></label>
          </fieldset>
          {chosen && <div key={account?.user.id ?? "guest"} className="space-y-4">
            <Field label={t("Плательщик (ИП, ТОО или ФИО)")}><input className="field" name="payer_name" required minLength={2} maxLength={160} defaultValue={account?.organization.name || ""} /></Field>
            <Field label={t("БИН / ИИН")} hint={t(chosen === "transfer" ? "12 цифр. Нужен для бухгалтерии." : "Необязательно")}><input className="field" name="payer_bin" inputMode="numeric" pattern="\d{12}" maxLength={12} required={chosen === "transfer"} /></Field>
            <Field label={t("Email для чеков и счетов")}><input className="field" name="payer_email" type="email" required maxLength={254} defaultValue={account?.user.email || ""} /></Field>
            {chosen === "card" && months === 1 && <label className="flex items-start gap-2 text-xs text-[#536257]"><input type="checkbox" checked={autoRenew} onChange={event => setAutoRenew(event.target.checked)} className="mt-0.5" />{t("Продлевать автоматически каждый месяц. Отключить можно в любой момент.")}</label>}
          </div>}
          {!methods?.card && !methods?.transfer && <Notice>{t("Приём оплаты ещё настраивается. Напишите нам, и мы подключим тариф вручную.")}</Notice>}
          <div className="flex items-center justify-between border-t border-[#E5EBDD] pt-4"><span className="text-xs text-[#5D6B62]">{t("К оплате")}</span><span className="text-2xl font-semibold text-[#123C2F]">{t(money(period?.amount_kzt ?? 0))}</span></div>
          {error && <Notice kind="error">{t(error)}</Notice>}
          <button className="btn-primary w-full" type="submit" disabled={!canPay || pending}>{pending && <LoaderCircle size={15} className="animate-spin" />}{t(pending ? "Создаём счёт…" : chosen === "transfer" ? "Выставить счёт" : `Оплатить ${money(period?.amount_kzt ?? 0)}`)}</button>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-[#5D6B62]"><ShieldCheck size={15} className="shrink-0 text-[#237A57]" /><span>{t("Нажимая кнопку, вы принимаете условия ")}<Link className="underline" href="/offer" target="_blank">{t("публичной оферты")}</Link>{t(". Данные карты вводятся в защищённой форме TipTop Pay и не попадают к нам.")}{plans.data.methods.test_mode && methods?.card ? t(" Тестовый режим: деньги не списываются.") : ""}</span></p>
        </div>}
      </Card>
    </form>
    {access?.signedIn && <InvoiceList rows={invoices.data?.invoices || []} reload={invoices.reload} />}
    {simulated && <Modal title={t("Тестовая оплата")} onClose={() => { if (!pending) setSimulated(null); }}><p className="text-sm leading-relaxed text-[#53664F]">{t(`Счёт ${simulated.invoice.number} на ${money(simulated.invoice.amount_kzt)}. Это демонстрационный режим без эквайринга: деньги не списываются, сервер отметит счёт оплаченным.`)}</p><div className="mt-6 flex justify-end gap-2"><button className="btn-secondary" disabled={pending} onClick={() => setSimulated(null)}>{t("Отмена")}</button><button className="btn-primary" disabled={pending} onClick={() => { void simulate(); }}>{t(pending ? "Проводим…" : "Оплатить (тест)")}</button></div></Modal>}
  </div>;
}
