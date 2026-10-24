"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartNoAxesCombined, CircleHelp, Menu, ShoppingBag, Store, X } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useApi } from "@/lib/api";
import { productNavigation } from "@/lib/navigation";
import type { Settings } from "@/types/api";

const icons = [ChartNoAxesCombined, ShoppingBag, CircleHelp];
const ShellContext = createContext(false);

export function AppShell({ children, title, description }: { children: ReactNode; title?: string; description?: string }) {
  const nested = useContext(ShellContext);
  return nested ? <>{children}</> : <ShellContext value={true}><ShellContents title={title} description={description}>{children}</ShellContents></ShellContext>;
}

function ShellContents({ children, title, description }: { children: ReactNode; title?: string; description?: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const settings = useApi<Settings>("/settings");
  const reloadSettings = settings.reload;
  useEffect(() => {
    window.addEventListener("saqta:settings-updated", reloadSettings);
    return () => window.removeEventListener("saqta:settings-updated", reloadSettings);
  }, [reloadSettings]);
  const bakeryName = settings.data?.bakery_name || "Пекарня";
  return <div className="min-h-screen bg-[#F7F7F2] text-[#202622]">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:p-3">Перейти к содержимому</a>
    {mobileOpen && <button className="fixed inset-0 z-30 bg-black/30 lg:hidden" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)}/>}
    <aside id="workspace-sidebar" className={`fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col overflow-y-auto bg-[#123C2F] px-5 pb-5 pt-8 text-white lg:translate-x-0 ${mobileOpen ? "visible translate-x-0" : "invisible -translate-x-full lg:visible"}`}>
      <div className="mb-10 flex items-center justify-between"><Link href="/" aria-label="SAQTA — главная"><Image src="/brand/saqta-logo-dark.svg" alt="SAQTA" width={146} height={32} priority/></Link><button className="lg:hidden" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)}><X size={19}/></button></div>
      <p className="mb-4 px-3 text-xs font-semibold uppercase tracking-[.16em] text-[#A8C5B5]">Два способа сохранять</p>
      <nav className="space-y-2" aria-label="Основная навигация">{productNavigation.map((item, index) => {
        const Icon = icons[index];
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${active ? "bg-[#C7F36B] font-semibold text-[#123C2F]" : "text-[#CEDFD3] hover:bg-white/10"}`}><Icon size={18}/>{item.label}</Link>;
      })}</nav>
      <div className="mt-8 rounded-xl border border-white/15 p-4"><p className="text-sm font-medium">Сначала план.<br/>Затем новая возможность.</p><p className="mt-3 text-xs leading-6 text-[#BED3C5]">Forecast — подписка на прогнозирование. Save — бесплатное размещение подходящих остатков.</p></div>
      <p className="mt-auto border-t border-white/15 pt-5 text-xs text-[#A8C5B5]">КАЗАХСТАН · KZT ₸</p>
    </aside>
    <div className="lg:pl-[232px]">
      <header className="flex min-h-[76px] items-center justify-between gap-3 border-b border-[#E5E9E0] bg-white px-5 py-4 md:px-9">
        <div className="flex min-w-0 items-center gap-3"><button className="rounded-lg border border-[#E5E9E0] p-2 lg:hidden" aria-label="Открыть меню" aria-controls="workspace-sidebar" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu size={20}/></button><Store size={18} className="shrink-0 text-[#237A57]"/><span className="truncate text-xs text-[#607264]">{bakeryName}<span className="hidden sm:inline"> · {settings.data?.city || "Подключение"}</span></span></div>
        <span className="shrink-0 rounded-full border border-[#E2E8D3] bg-[#F5F8EB] px-3 py-1.5 text-xs font-semibold text-[#647A39]">{settings.data ? settings.data.demo_data ? "DEMO DATA" : "ДАННЫЕ ПЕКАРНИ" : "ПОДКЛЮЧЕНИЕ…"}</span>
      </header>
      <main id="main-content" className="mx-auto max-w-[1600px] p-5 md:p-9">{title && <header className="mb-8"><h1 className="page-title">{title}</h1>{description && <p className="mt-2 text-sm text-[#5D6B62]">{description}</p>}</header>}{children}<footer className="mt-10 flex flex-wrap justify-between gap-3 border-t border-[#E2E7DC] pt-5 text-xs text-[#5D6B62]"><span>© {new Date().getFullYear()} SAQTA · Артықты азайт. Асты сақта.</span><span>Прогноз — оценка, а не гарантия · Размещение Save бесплатно, комиссия с завершённой продажи — 5%</span></footer></main>
    </div>
  </div>;
}

export default AppShell;
