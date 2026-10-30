"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import { ProductHeader } from "./product-header";
import { useI18n } from "./language-provider";
const ShellContext = createContext(false);
export function AppShell({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  const nested = useContext(ShellContext);
  const { t } = useI18n();
  if (nested) return <>{children}</>;
  return (
    <ShellContext value={true}>
      <div className="workspace-surface">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:p-4">
        {t("Перейти к содержимому")}
      </a>
      <ProductHeader />
      <main
        id="main-content"
        className="workspace-main"
      >
        {title && (
          <header className="mb-8">
            <h1 className="page-title">{t(title)}</h1>
            {description && <p className="muted mt-3">{t(description)}</p>}
          </header>
        )}
        {children}
      </main>
      <footer className="workspace-footer">
        <div className="workspace-footer-inner">
          <span className="workspace-footer-brand">SAQTA</span>
          <span>© {new Date().getFullYear()} · {t("Меньше потерь. Больше пользы.")}</span>
          <Link href="/">{t("Обзор проекта")}<ArrowUpRight size={15} aria-hidden="true" /></Link>
        </div>
      </footer>
      </div>
    </ShellContext>
  );
}
export default AppShell;
