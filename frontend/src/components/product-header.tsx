"use client";

import { useI18n } from "@/components/language-provider";

import { productNavigation } from "@/lib/navigation";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AccountButton } from "@/features/account/account";
import { LanguageSwitcher } from "./language-switcher";

export function ProductHeader() {
  const { t } = useI18n();

  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <header className="public-header">
      <div className="public-header-inner">
        <Link href="/" aria-label={t("SAQTA — главная")}>
          <Image
            src="/brand/saqta-logo.svg"
            width={136}
            height={30}
            alt="SAQTA"
            priority
            className="w-[112px] sm:w-[136px]"
          />
        </Link>
        <nav
          id="public-navigation"
          aria-label={t("Основная навигация")}
          className={`${open ? "flex" : "hidden"} order-last w-full flex-col gap-1 rounded-xl border border-[#E1E7DD] bg-white p-3 lg:order-none lg:flex lg:w-auto lg:flex-row lg:items-center lg:gap-2 lg:border-0 lg:bg-transparent lg:p-0`}
        >
          {productNavigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={`rounded-lg px-3 py-2 text-xs font-medium ${pathname === item.href ? "bg-[#EAF3E6] text-[#237A57]" : "text-[#526258] hover:bg-[#EFF3E9]"}`}
            >
              {t(item.label)}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <LanguageSwitcher />
          <AccountButton />
          <button
            type="button"
            className="rounded-full p-2 text-[#123C2F] lg:hidden"
            aria-label={t(open ? "Закрыть меню" : "Открыть меню")}
            aria-controls="public-navigation"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
    </header>
  );
}
