"use client";

import { useI18n } from "@/components/language-provider";

import { AlertCircle,ArrowDownRight,ArrowUpRight,Check,Leaf,LoaderCircle,RefreshCw,X } from "lucide-react";
import { useEffect,useRef,type ReactNode } from "react";

export const money = (value: number) => new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: 0 }).format(value) + " ₸";
export const number = (value: number, digits = 0) => new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: digits }).format(value);
export const dateLabel = (value: string) => new Date(value.includes("T") ? value : value + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qyzylorda" });

export function PageHeader({ eyebrow, title, description, action, level = 1 }: { eyebrow: string; title: string; description: string; action?: ReactNode; level?: 1 | 2 }) {
  const { t } = useI18n();

  const Heading = level === 2 ? "h2" : "h1";
  return <header className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><div className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-[#237A57]">{t(eyebrow)}</div><Heading className={`${level === 2 ? "text-2xl" : "text-3xl md:text-[34px]"} font-semibold tracking-[-.04em] text-[#123C2F]`}>{t(title)}</Heading><p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5D6B62]">{t(description)}</p></div>{t(action)}</header>;
}

export function Card({ title, subtitle, children, action, className = "" }: { title?: string; subtitle?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  const { t } = useI18n();

  return <section className={`saqta-card rounded-2xl border border-[#E5E9E0] bg-white p-5 md:p-6 ${className}`}>{title && <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-[15px] font-semibold tracking-[-.02em] text-[#202622]">{t(title)}</h2>{subtitle && <p className="mt-1 text-xs leading-relaxed text-[#5D6B62]">{t(subtitle)}</p>}</div>{t(action)}</div>}{t(children)}</section>;
}

export function Metric({ label, value, note, icon, accent = false, trend }: { label: string; value: string; note?: string; icon: ReactNode; accent?: boolean; trend?: "up" | "down" }) {
  const { t } = useI18n();

  return <div className={`relative overflow-hidden rounded-2xl border p-5 ${accent ? "border-[#123C2F] bg-[#123C2F] text-white" : "border-[#E5E9E0] bg-white"}`}><div className="flex items-center justify-between gap-2"><p className={`text-xs ${accent ? "text-[#C1D3C8]" : "text-[#5D6B62]"}`}>{t(label)}</p><span className={`rounded-lg p-2 ${accent ? "bg-white/10 text-[#C7F36B]" : "bg-[#F1F5EE] text-[#237A57]"}`}>{t(icon)}</span></div><p className={`mt-3 text-[29px] font-semibold leading-none tracking-[-.04em] ${accent ? "text-[#C7F36B]" : "text-[#123C2F]"}`}>{t(value)}</p>{note && <p className={`mt-3 flex items-center gap-1.5 text-xs ${accent ? "text-[#C1D3C8]" : "text-[#5D6B62]"}`}>{trend === "up" && <ArrowUpRight size={13} />}{trend === "down" && <ArrowDownRight size={13} />}{t(note)}</p>}</div>;
}

export function Loading({ label = "Загружаем данные пекарни…" }: { label?: string }) {
  const { t } = useI18n();
 return <div role="status" className="flex min-h-64 flex-col items-center justify-center gap-4 text-sm text-[#5D6B62]"><LoaderCircle className="animate-spin text-[#237A57]" size={28} />{t(label)}</div>; }
export function ErrorState({ error, retry }: { error: string; retry: () => void }) {
  const { t } = useI18n();
 return <div role="alert" className="my-6 rounded-2xl border border-red-200 bg-red-50 p-6"><div className="flex items-center gap-2 font-semibold text-red-800"><AlertCircle size={18} />{t("Не удалось получить данные")}</div><p className="mt-2 text-sm text-red-700">{t(error)}</p><button className="btn-secondary mt-4" onClick={retry}><RefreshCw size={15} />{t("Повторить")}</button></div>; }
export function Empty({ title = "Пока нет данных", description = "Добавьте записи или измените фильтры." }: { title?: string; description?: string }) {
  const { t } = useI18n();
 return <div className="saqta-empty"><span className="saqta-empty-icon" aria-hidden="true"><Leaf size={31} strokeWidth={1.25} /></span><p className="saqta-empty-title">{t(title)}</p><p className="saqta-empty-description">{t(description)}</p></div>; }
export function Notice({ children, kind = "info" }: { children: ReactNode; kind?: "info" | "success" | "error" }) {
  const { t } = useI18n();
 return <div role={kind === "error" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-xs leading-relaxed ${kind === "error" ? "border-red-200 bg-red-50 text-red-800" : kind === "success" ? "border-[#CBE3D0] bg-[#EDF7EC] text-[#237A57]" : "border-[#E4E8DE] bg-[#F2F5EC] text-[#60715F]"}`}>{kind === "success" ? <Check className="mt-0.5 shrink-0" size={15} /> : <AlertCircle className="mt-0.5 shrink-0" size={15} />}<div>{t(children)}</div></div>; }
export function Badge({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "gray" | "amber" }) {
  const { t } = useI18n();
 return <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${tone === "green" ? "bg-[#EAF3E6] text-[#237A57]" : tone === "amber" ? "bg-[#FFF2D8] text-[#8D621D]" : "bg-[#F0F1EE] text-[#5D6B62]"}`}>{t(children)}</span>; }
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const { t } = useI18n();

  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const selector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(selector) ?? []);
    focusable()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = focusable(), first = elements[0], last = elements.at(-1);
      if (!first || !last) { event.preventDefault(); dialogRef.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trapFocus);
    return () => { document.removeEventListener("keydown", trapFocus); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#123C2F]/40 p-4 backdrop-blur-sm" onClick={onClose}><section ref={dialogRef} role="dialog" aria-modal="true" aria-label={t(title)} tabIndex={-1} className="saqta-modal max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") onClose(); }}><div className="mb-6 flex items-center justify-between gap-4"><h2 className="text-xl font-semibold text-[#123C2F]">{t(title)}</h2><button aria-label={t("Закрыть")} onClick={onClose} className="rounded-lg p-2 hover:bg-[#F2F5EC]"><X size={20} /></button></div>{t(children)}</section></div>;
}
export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  const { t } = useI18n();
 return <label className="block space-y-1.5 text-xs font-medium text-[#536257]"><span>{t(label)}</span>{t(children)}{hint && <span className="block text-xs font-normal text-[#5D6B62]">{t(hint)}</span>}{error && <span className="block text-xs text-red-700">{t(error)}</span>}</label>; }
export function FormActions({ pending, onCancel, label = "Сохранить" }: { pending: boolean; onCancel?: () => void; label?: string }) {
  const { t } = useI18n();
 return <div className="mt-6 flex justify-end gap-2">{onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>{t("Отмена")}</button>}<button className="btn-primary" disabled={pending} type="submit">{pending && <LoaderCircle size={15} className="animate-spin" />}{t(pending ? "Сохраняем…" : label)}</button></div>; }
