"use client";
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
      <a href="#main-content" className="sr-only focus:not-sr-only focus:p-4">
        {t("Перейти к содержимому")}
      </a>
      <ProductHeader />
      <main
        id="main-content"
        className="mx-auto min-h-[calc(100dvh-160px)] max-w-[1360px] px-5 py-8 md:px-12 md:py-10"
      >
        {title && (
          <header className="mb-8">
            <h1 className="page-title">{t(title)}</h1>
            {description && <p className="muted mt-3">{t(description)}</p>}
          </header>
        )}
        {children}
      </main>
      <footer className="mx-auto flex max-w-[1360px] flex-wrap justify-between gap-3 border-t border-[#dfe6db] px-5 py-6 text-xs text-[#637369] md:px-12">
        <span>© {new Date().getFullYear()} SAQTA</span>
        <span>{t("Меньше потерь. Больше пользы.")}</span>
      </footer>
    </ShellContext>
  );
}
export default AppShell;
