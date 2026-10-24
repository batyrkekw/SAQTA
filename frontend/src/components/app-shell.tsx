"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Activity, ArrowUpRight, ChartNoAxesCombined, ChevronDown, CircleHelp, LayoutDashboard, Menu, Package, Settings, ShoppingBag, Sparkles, Sprout, Store, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useApi } from "@/lib/api";
import type { Settings as WorkspaceSettings } from "@/types/api";

const navigation = [
  { href: "/dashboard", label: "Обзор", icon: LayoutDashboard },
  { href: "/forecast", label: "Прогноз спроса", icon: ChartNoAxesCombined },
  { href: "/inventory", label: "Продукты и учёт", icon: Package },
  { href: "/save", label: "SAQTA Save", icon: ShoppingBag },
  { href: "/impact", label: "Экологический вклад", icon: Sprout },
  { href: "/economics", label: "Экономика", icon: Activity },
];

export function AppShell({ children, title, description }: { children: ReactNode; title?: string; description?: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const settings = useApi<WorkspaceSettings>("/settings");
  const reloadSettings = settings.reload;
  useEffect(() => { window.addEventListener("saqta:settings-updated", reloadSettings); return () => window.removeEventListener("saqta:settings-updated", reloadSettings); }, [reloadSettings]);
  const bakeryName = settings.data?.bakery_name || "Пекарня";
  const city = settings.data?.city || "Рабочее пространство";
  return <div className="min-h-screen bg-[#F7F7F2] text-[#202622]">
    <a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:p-3" href="#main-content">Перейти к содержимому</a>
    {mobileOpen && <button className="fixed inset-0 z-30 bg-black/30 lg:hidden" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)} />}
    <aside id="workspace-sidebar" className={`fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col overflow-y-auto bg-[#123C2F] px-5 pb-5 pt-8 text-white transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0 visible" : "-translate-x-full invisible lg:visible"}`}>
      <div className="mb-10 flex items-center justify-between"><Link href="/" aria-label="SAQTA — главная" className="block w-[146px]"><Image src="/brand/saqta-logo-dark.svg" alt="SAQTA" width={146} height={32} priority /></Link><button className="lg:hidden" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)}><X size={19} /></button></div>
      <div className="mb-4 px-3 text-xs font-semibold uppercase tracking-[.18em] text-[#8FAE9D]">Рабочее пространство</div>
      <nav className="space-y-1" aria-label="Основная навигация">{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} aria-current={pathname === href ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[12px] transition-colors ${pathname === href ? "bg-[#C7F36B] font-semibold text-[#123C2F]" : "text-[#C0D0C5] hover:bg-white/5 hover:text-white"}`}><Icon size={17} strokeWidth={1.6} />{label}{href === "/save" && <span className={`ml-auto rounded px-1.5 py-0.5 text-xs ${pathname === href ? "bg-[#123C2F]/10" : "bg-white/10 text-[#C7F36B]"}`}>Save</span>}</Link>)}</nav>
      <div className="mt-auto pt-8"><div className="rounded-xl border border-white/10 bg-white/[.035] p-4"><Sparkles size={20} className="mb-3 text-[#C7F36B]" /><p className="text-xs font-medium">Меньше излишков.<br />Больше возможностей.</p><p className="mt-2 text-xs leading-relaxed text-[#95B09E]">Планируйте производство на основе данных.</p><Link href="/forecast" className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[#C7F36B]">Открыть прогноз<ArrowUpRight size={13} /></Link></div><Link href="/settings" onClick={() => setMobileOpen(false)} className={`mt-5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs ${pathname === "/settings" ? "bg-white/10 text-white" : "text-[#BCD0C1] hover:bg-white/5"}`}><Settings size={17} />Настройки и данные</Link><Link href="/" className="mt-1 flex items-center gap-3 px-3 py-2.5 text-xs text-[#BCD0C1]"><CircleHelp size={17} />О платформе</Link><div className="mt-6 border-t border-white/10 pt-4 text-xs tracking-wide text-[#7FA18B]">СОЗДАНО В КАЗАХСТАНЕ · KZT ₸</div></div>
    </aside>
    <div className="lg:pl-[232px]"><header className="flex h-[76px] items-center justify-between border-b border-[#E5E9E0] bg-white/80 px-5 md:px-9"><div className="flex items-center gap-3"><button className="rounded-lg border border-[#E5E9E0] p-2 lg:hidden" aria-label="Открыть меню" aria-controls="workspace-sidebar" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="flex items-center gap-2.5 text-xs text-[#607264]"><Store size={17} className="text-[#237A57]" /><span className="hidden sm:inline">{bakeryName}</span><span className="text-[#CCD3C9]">/</span><span>{city}</span><ChevronDown size={12} className="text-[#5D6B62]" /></div></div><div className="flex items-center gap-4"><span className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8D3] bg-[#F5F8EB] px-2.5 py-1.5 text-xs font-semibold tracking-[.06em] text-[#647A39]"><span className="h-1.5 w-1.5 rounded-full bg-[#91AD56]" />{settings.data ? settings.data.demo_data ? "DEMO DATA" : "ДАННЫЕ ПЕКАРНИ" : "ПОДКЛЮЧЕНИЕ…"}</span><Link href="/settings" aria-label="Настройки пекарни" className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E9EEE3] text-xs font-bold text-[#237A57]">{bakeryName.split(" ").slice(0, 2).map(word => word[0]).join("").toUpperCase()}</span><span className="hidden text-xs font-medium md:block">{bakeryName}</span></Link></div></header>
    <main id="main-content" className="mx-auto max-w-[1600px] p-5 md:p-9">{title && <header className="mb-8"><h1 className="text-3xl font-semibold tracking-tight text-[#123C2F]">{title}</h1>{description && <p className="mt-2 text-sm text-[#5D6B62]">{description}</p>}</header>}{children}<footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E7DC] pt-5 text-xs text-[#5D6B62]"><span>© {new Date().getFullYear()} SAQTA · Артықты азайт. Асты сақта.</span><span>Прогнозы не гарантируют спрос · KZT ₸</span></footer></main></div>
  </div>;
}

export default AppShell;
