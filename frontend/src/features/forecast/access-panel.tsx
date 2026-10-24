"use client";

import Link from "next/link";
import { createContext, useContext, useState, type FormEvent, type ReactNode } from "react";
import { LogIn, LogOut, ShieldCheck } from "lucide-react";
import { Badge, Card, Field, Loading, Notice, number } from "@/components/ui";
import { errorMessage, post, setSessionToken, useApi } from "@/lib/api";
import type { AuthSession, Subscription, WorkspaceHealth } from "@/types/access";

type Access = { canAnalyze: boolean; isDemo: boolean; signedIn: boolean; loading: boolean; reload: () => void; subscription: Subscription | null };
const AccessContext = createContext<Access | null>(null);
export const useForecastAccess = () => useContext(AccessContext);

export function AccessStatus({ subscription }: { subscription: Subscription }) {
  const demo = subscription.access_mode === "demo";
  return <section aria-label="Статус доступа Forecast" className="rounded-2xl border border-[#DCE5D5] bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[#123C2F]">{demo ? "Демонстрационный доступ" : `Тариф ${subscription.plan === "free" ? "Free" : subscription.plan === "starter" ? "Starter" : "Pro"}`}</p><p className="mt-1 text-xs text-[#5D6B62]">{demo ? "Синтетические данные · настоящая подписка не оплачена" : subscription.active ? "Активен · доступ проверяется сервером" : subscription.status === "expired" ? "Срок подписки истёк. Прогноз и импорт недоступны." : "Подписка не активирована. Прогноз и импорт недоступны."}</p></div><Badge tone={demo || !subscription.active ? "amber" : "green"}>{demo ? "DEMO DATA" : subscription.active ? "АКТИВЕН" : "НЕТ ДОСТУПА"}</Badge></div>{!demo && <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#536257]"><p>Продуктов: до {number(subscription.limits.products ?? 0)}</p><p>Точек: {subscription.limits.locations === null ? "несколько" : number(subscription.limits.locations)}</p><p>Запуски за {subscription.usage.period}: {number(subscription.usage.forecast_runs)} / {number(subscription.limits.forecast_runs_per_month ?? 0)}</p><p>Осталось: {subscription.usage.remaining === null ? "—" : number(subscription.usage.remaining)}</p>{subscription.expires_at && <p>До {new Date(subscription.expires_at).toLocaleDateString("ru-RU", { timeZone: "Asia/Qyzylorda" })}</p>}</div>}<p className="mt-3 text-xs leading-relaxed text-[#5D6B62]">{demo ? "Публичное DEMO предназначено только для проверки функций. Реальные файлы здесь запрещены." : "Лимит считается по запуску анализа ассортимента, а не по токенам. Оплата не подключена; ручная активация выполняется оператором в закрытом окружении."}</p></section>;
}

function OrganizationSignIn() {
  const [register, setRegister] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setPending(true);
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) || "").trim();
    const payload = { email: value("email"), password: String(data.get("password") || ""), ...(register ? { bakery_name: value("bakery_name"), location_name: value("location_name"), address: value("address"), city: value("city") } : {}) };
    try { const session = await post<AuthSession>(register ? "/auth/register" : "/auth/login", payload); setSessionToken(session.token); }
    catch (reason) { setError(errorMessage(reason)); } finally { setPending(false); }
  }
  return <Card title={register ? "Создайте организацию и первую точку" : "Войдите в свою организацию"} subtitle="Вход доступен только в отдельном окружении реальных данных"><form className="space-y-4" onSubmit={event => { void submit(event); }}><div className="grid gap-4 sm:grid-cols-2"><Field label="Email"><input className="field" type="email" name="email" autoComplete="email" required maxLength={254}/></Field><Field label="Пароль" hint="Не менее 10 символов"><input className="field" type="password" name="password" autoComplete={register ? "new-password" : "current-password"} minLength={10} maxLength={128} required/></Field>{register && <><Field label="Название организации"><input className="field" name="bakery_name" required minLength={2} maxLength={120}/></Field><Field label="Название первой точки"><input className="field" name="location_name" required minLength={2} maxLength={120}/></Field><Field label="Адрес точки"><input className="field" name="address" required minLength={2} maxLength={250}/></Field><Field label="Город"><input className="field" name="city" defaultValue="Астана" required maxLength={100}/></Field></>}</div>{register && <Notice>Создание организации не означает оплату или активацию тарифа. История новой организации пуста; демонстрационные записи в неё не копируются.</Notice>}{error && <Notice kind="error">{error}</Notice>}<div className="flex flex-wrap items-center gap-3"><button className="btn-primary" disabled={pending} type="submit"><LogIn size={15}/>{pending ? "Проверяем…" : register ? "Создать организацию" : "Войти"}</button><button className="btn-secondary" type="button" disabled={pending} onClick={() => { setRegister(value => !value); setError(""); }}>{register ? "Уже есть аккаунт" : "Новая организация"}</button></div></form></Card>;
}

export function ForecastAccessProvider({ children }: { children: ReactNode }) {
  const health = useApi<WorkspaceHealth>("/health");
  const subscription = useApi<Subscription>(health.data ? "/subscription" : null);
  const [logoutError, setLogoutError] = useState("");
  const isDemo = health.data?.workspace_mode === "demo";
  const signedIn = !isDemo && Boolean(subscription.data);
  const canAnalyze = isDemo ? subscription.data?.access_mode === "demo" : subscription.data?.active === true && subscription.data?.access_mode === "paid";
  const loading = health.loading || Boolean(health.data && subscription.loading && !subscription.data);
  async function logout() { setLogoutError(""); try { await post("/auth/logout", {}); } catch (reason) { setLogoutError(`Сеанс удалён из браузера; сервер не подтвердил отзыв: ${errorMessage(reason)}`); } finally { setSessionToken(null); } }
  return <AccessContext value={{ canAnalyze, isDemo, signedIn, loading, reload: subscription.reload, subscription: subscription.data }}><div className="mb-6 space-y-4">{loading ? <Loading label="Проверяем рабочее пространство и доступ Forecast…"/> : health.error ? <Notice kind="error">{health.error} <button className="underline" onClick={health.reload}>Повторить</button></Notice> : subscription.data ? <><AccessStatus subscription={subscription.data}/>{signedIn && <div className="flex justify-end"><button className="btn-secondary" onClick={() => { void logout(); }}><LogOut size={14}/>Выйти из организации</button></div>}</> : !isDemo && health.data && subscription.status === 401 ? <><Notice><ShieldCheck size={16} className="mb-2"/>Данные организаций изолированы на сервере. Для работы войдите или создайте собственную организацию. <Link className="underline" href="/forecast?view=pricing">Тарифы</Link></Notice><OrganizationSignIn/></> : <Notice kind="error">{subscription.error || "Не удалось определить доступ Forecast."} <button className="underline" onClick={subscription.reload}>Повторить</button></Notice>}{logoutError && <Notice kind="error">{logoutError}</Notice>}</div>{children}</AccessContext>;
}
