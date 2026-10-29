'use client';

import { useI18n } from "@/components/language-provider";
import Link from 'next/link';
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();

  return <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6"><p className="eyebrow">SAQTA</p><h1 className="page-title mt-4">{t("Не удалось открыть страницу")}</h1><p className="muted mt-4 leading-7">{t("Повторите попытку. Если ошибка сохраняется, проверьте доступность приложения и API.")}</p><div className="mt-7 flex gap-3"><button className="btn-primary" onClick={reset}>{t("Повторить")}</button><Link href="/" className="btn-secondary">{t("На главную")}</Link></div></main>;
}
