"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { productNavigation } from "@/lib/navigation";

export function ProductHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return <header className="relative z-30 mx-auto flex min-h-24 max-w-[1360px] flex-wrap items-center justify-between gap-4 px-6 py-5 md:px-12">
    <Link href="/" aria-label="SAQTA — главная"><Image src="/brand/saqta-logo.svg" width={146} height={32} alt="SAQTA" priority /></Link>
    <button type="button" className="btn-secondary md:hidden" aria-label={open ? "Закрыть меню" : "Открыть меню"} aria-controls="public-navigation" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? <X size={20}/> : <Menu size={20}/>}</button>
    <nav id="public-navigation" aria-label="Основная навигация" className={`${open ? "flex" : "hidden"} w-full flex-col gap-2 rounded-xl border border-[#E1E7DD] bg-white p-3 md:flex md:w-auto md:flex-row md:items-center md:gap-6 md:border-0 md:bg-transparent md:p-0`}>
      {productNavigation.map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={() => setOpen(false)} className={`rounded-lg px-3 py-2 text-sm font-medium ${pathname === item.href ? "bg-[#EAF3E6] text-[#237A57]" : "text-[#526258] hover:bg-[#EFF3E9]"}`}>{item.label}</Link>)}
    </nav>
    <Link href="/forecast" className="btn-primary hidden md:inline-flex">Открыть демо</Link>
  </header>;
}
