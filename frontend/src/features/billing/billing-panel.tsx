"use client";

import { useI18n } from "@/components/language-provider";
import { Badge, Card, Field, Loading, Modal, Notice } from "@/components/ui";
import { useAccount } from "@/features/account/account";
import { useForecastAccess } from "@/features/forecast/access-panel";
import { PRICING } from "@/features/forecast/pricing.config";
import type { Location } from "@/types/api";
import { api, errorMessage, post, useApi } from "@/lib/api";
import { type BillingPlans, type CheckoutResult, type Invoice, type WidgetLaunch, kztDate, methodLabel, payByCard, planName, pointsWord, statusLabel } from "@/lib/billing";
import { Check, CreditCard, FileText, LoaderCircle, Minus, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

type Months = 1 | 3 | 12;

function CurrentPlan({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n();
  const access = useForecastAccess();
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const sub = access?.subscription;
  if (!access?.signedIn || !sub) return null;
  const until = kztDate(sub.expires_at);
  const places = sub.limits.locations ?? 1;
  const title = !sub.active ? "Нет активного тарифа" : sub.is_trial ? `Пробный период до ${until}` : `${planName(sub.plan)}, ${places} ${pointsWord(places)}, оплачен до ${until}`;
  async function stopRenewal() {
    setPending(true); setError("");
    try { await post("/billing/auto-renew", { enabled: false }); access?.reload(); onChanged(); }
    catch (reason) { setError(errorMessage(reason)); } finally { setPending(false); }
  }
  return <Card title={t("Ваш тариф")} action={<Badge tone={sub.active && !sub.is_trial ? "green" : "amber"}>{t(sub.active ? sub.is_trial ? "ПРОБНЫЙ" : "ОПЛАЧЕН" : "НЕ ОПЛАЧЕН")}</Badge>}>
    <p className="text-base font-semibold text-[#123C2F]">{t(title)}</p>
    <p className="mt-2 text-xs leading-relaxed text-[#5D6B62]">{t(sub.active ? sub.is_trial ? `Все функции открыты, до ${places} ${pointsWord(places)}. Оплатите тариф до конца пробного периода, чтобы прогнозы и импорт не остановились.` : "Оплата с тем же числом точек продлевает срок с даты окончания. Если число точек меняется, новый период начинается сегодня." : "Прогноз, импорт и проверка на истории откроются сразу после оплаты.")}</p>
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
      <tbody>{rows.map(row => <tr key={row.number}><td className="font-medium text-[#123C2F]">{row.number}</td><td>{t(kztDate(row.created_at))}</td><td>{t(`${planName(row.plan)}, ${row.locations ?? 1} ${pointsWord(row.locations ?? 1)}, ${row.months} мес.`)}</td><td>{t(money(row.amount_kzt))}</td><td>{t(methodLabel[row.method])}</td>
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
  const locations = useApi<Location[]>(access?.signedIn ? "/locations" : null);
  const [months, setMonths] = useState<Months>(1), [picked, setPicked] = useState<number | null>(null);
  const [method, setMethod] = useState<"card" | "transfer" | null>(null), [autoRenew, setAutoRenew] = useState(true);
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [waiting, setWaiting] = useState<string | null>(null), [simulated, setSimulated] = useState<{ invoice: Invoice; widget: WidgetLaunch } | null>(null);

  const methods = plans.data?.methods;
  const chosen = method ?? (methods?.card ? "card" : methods?.transfer ? "transfer" : null);
  const plan = plans.data?.plan;
  const minPlaces = Math.max(1, locations.data?.length ?? 1);
  const maxPlaces = plan?.max_locations ?? 50;
  const places = Math.min(maxPlaces, Math.max(minPlaces, picked ?? Math.max(minPlaces, access?.subscription?.is_trial ? 1 : access?.subscription?.limits.locations ?? 1)));
  const perLocation = plan?.per_location_kzt ?? PRICING.perLocationKzt;
  const multiplier = plan?.periods.find(item => item.months === months)?.multiplier ?? months;
  const amount = perLocation * places * multiplier;

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
        if (row.status === "paid") { setWaiting(null); setMessage(`Оплата получена. Тариф ${planName(row.plan)} на ${row.locations} ${pointsWord(row.locations)} активен до ${kztDate(row.period_end)}.`); refresh.current(); }
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
        months, locations: places, method: chosen, auto_renew: chosen === "card" && months === 1 && autoRenew,
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
    try { const row = await post<Invoice>(`/billing/simulate/${simulated.invoice.number}`, {}); setSimulated(null); setMessage(`Тестовая оплата проведена. Тариф ${planName(row.plan)} на ${row.locations} ${pointsWord(row.locations)} активен до ${kztDate(row.period_end)}.`); access?.reload(); invoices.reload(); }
    catch (reason) { setError(errorMessage(reason)); } finally { setPending(false); }
  }

  if (plans.loading && !plans.data) return <Loading label={t("Загружаем тарифы…")} />;
  if (!plans.data) return <Notice kind="error">{t(plans.error || "Не удалось загрузить тарифы.")} <button className="underline" onClick={plans.reload}>{t("Повторить")}</button></Notice>;
  const canPay = Boolean(access?.signedIn && chosen);

  return <div className="space-y-6">
    <div className="max-w-3xl"><h2 className="text-2xl font-semibold tracking-tight text-[#123C2F]">{t("Тариф и оплата")}</h2><p className="mt-2 text-sm leading-relaxed text-[#5D6B62]">{t(`Один тариф для бизнеса: ${money(perLocation)} в месяц за каждую точку. Новые пекарни получают ${plans.data.trial_days} дней бесплатно. Покупатели пользуются SaqtaFood Save бесплатно.`)}</p></div>
    <CurrentPlan onChanged={invoices.reload} />
    {message && <Notice kind="success">{t(message)}</Notice>}
    {waiting && <div className="flex items-center gap-2 text-xs text-[#536257]"><LoaderCircle size={15} className="animate-spin" />{t("Проверяем подтверждение оплаты…")}</div>}

    <form noValidate onSubmit={event => { void submit(event); }} className="grid items-start gap-6 lg:grid-cols-[1.25fr_1fr]">
      <div className="space-y-4">
        <section className="rounded-2xl bg-[#123C2F] p-6 text-white" aria-labelledby="plan-title">
          <div className="flex flex-wrap items-baseline justify-between gap-3"><h3 id="plan-title" className="text-lg font-semibold">{t(plan?.title ?? "SaqtaFood Business")}</h3><span className="text-sm text-[#D3E0D6]"><span className="text-3xl font-semibold tracking-tight text-[#C7F36B]">{t(money(perLocation))}</span> {t("в месяц за точку")}</span></div>
          <ul className="mt-4 grid gap-1.5 text-xs text-[#D3E0D6] sm:grid-cols-2">{[...PRICING.features, `До ${PRICING.perLocation.products} продуктов и ${PRICING.perLocation.forecastRuns} запусков анализа в месяц на точку`].map(item => <li key={item} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[#C7F36B]" />{t(item)}</li>)}</ul>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/15 pt-5">
            <div><p className="text-sm font-semibold" id="places-label">{t("Сколько точек подключить")}</p><p className="mt-1 text-xs text-[#D3E0D6]">{t(locations.data && locations.data.length > 1 ? `Сейчас у вас ${locations.data.length} ${pointsWord(locations.data.length)}: меньше оплатить нельзя.` : "Точка — это пекарня, кафе или магазин со своим учётом.")}</p></div>
            <div className="flex items-center gap-1 rounded-full bg-white/10 p-1" role="group" aria-labelledby="places-label">
              <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15 disabled:opacity-40" disabled={places <= minPlaces} onClick={() => setPicked(places - 1)} aria-label={t("Убрать точку")}><Minus size={16} /></button>
              <input className="w-14 bg-transparent text-center text-xl font-semibold text-white outline-none" type="number" inputMode="numeric" min={minPlaces} max={maxPlaces} value={places} aria-labelledby="places-label" onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) setPicked(Math.round(value)); }} />
              <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15 disabled:opacity-40" disabled={places >= maxPlaces} onClick={() => setPicked(places + 1)} aria-label={t("Добавить точку")}><Plus size={16} /></button>
            </div>
          </div>
        </section>
        <fieldset className="rounded-2xl border border-[#E2E8DB] bg-white p-4"><legend className="px-1 text-xs font-medium text-[#536257]">{t("Период оплаты")}</legend><div className="grid grid-cols-3 gap-2">{(plan?.periods ?? PRICING.periods).map(item => { const saving = perLocation * places * (item.months - item.multiplier); return <label key={item.months} className={`cursor-pointer rounded-xl border px-3 py-3 text-center text-xs ${months === item.months ? "border-[#237A57] bg-[#EAF3E6] font-semibold text-[#123C2F]" : "border-[#E2E8DB] text-[#536257]"}`}><input type="radio" name="months" className="sr-only" checked={months === item.months} onChange={() => setMonths(item.months as Months)} />{t(item.months === 1 ? "1 месяц" : item.months === 3 ? "3 месяца" : "12 месяцев")}<span className="mt-1 block text-[#237A57]">{t(saving ? `выгода ${money(saving)}` : money(perLocation * places * item.multiplier))}</span></label>; })}</div></fieldset>
      </div>

      <Card title={t("Оплата")} subtitle={t(`Business, ${places} ${pointsWord(places)}, ${months} мес.`)}>
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
          <div className="flex items-center justify-between border-t border-[#E5EBDD] pt-4"><span className="text-xs text-[#5D6B62]">{t("К оплате")}</span><span className="text-2xl font-semibold text-[#123C2F]">{t(money(amount))}</span></div>
          {error && <Notice kind="error">{t(error)}</Notice>}
          <button className="btn-primary w-full" type="submit" disabled={!canPay || pending}>{pending && <LoaderCircle size={15} className="animate-spin" />}{t(pending ? "Создаём счёт…" : chosen === "transfer" ? "Выставить счёт" : `Оплатить ${money(amount)}`)}</button>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-[#5D6B62]"><ShieldCheck size={15} className="shrink-0 text-[#237A57]" /><span>{t("Нажимая кнопку, вы принимаете условия ")}<Link className="underline" href="/offer" target="_blank">{t("публичной оферты")}</Link>{t(". Данные карты вводятся в защищённой форме TipTop Pay и не попадают к нам.")}{plans.data.methods.test_mode && methods?.card ? t(" Тестовый режим: деньги не списываются.") : ""}</span></p>
        </div>}
      </Card>
    </form>
    {access?.signedIn && <InvoiceList rows={invoices.data?.invoices || []} reload={invoices.reload} />}
    {simulated && <Modal title={t("Тестовая оплата")} onClose={() => { if (!pending) setSimulated(null); }}><p className="text-sm leading-relaxed text-[#53664F]">{t(`Счёт ${simulated.invoice.number} на ${money(simulated.invoice.amount_kzt)}. Это демонстрационный режим без эквайринга: деньги не списываются, сервер отметит счёт оплаченным.`)}</p><div className="mt-6 flex justify-end gap-2"><button className="btn-secondary" disabled={pending} onClick={() => setSimulated(null)}>{t("Отмена")}</button><button className="btn-primary" disabled={pending} onClick={() => { void simulate(); }}>{t(pending ? "Проводим…" : "Оплатить (тест)")}</button></div></Modal>}
  </div>;
}
