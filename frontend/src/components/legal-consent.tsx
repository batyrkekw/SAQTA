"use client";

import Link from "next/link";
import { useI18n } from "./language-provider";

export function LegalConsent() {
  const { t } = useI18n();
  return (
    <div className="space-y-2 text-sm">
      <label className="flex items-start gap-2">
        <input type="checkbox" name="consent" required className="mt-1" />
        <span>{t("Я согласен на обработку персональных данных и принимаю Пользовательское соглашение.")}</span>
      </label>
      <p className="flex flex-wrap gap-x-4 gap-y-1 pl-5 text-xs">
        <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{t("Политика конфиденциальности")}</Link>
        <Link href="/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{t("Пользовательское соглашение")}</Link>
      </p>
    </div>
  );
}
