"use client";

import { useI18n } from "@/components/language-provider";

import Link from 'next/link';
export default function NotFound() {
  const { t } = useI18n();

  return <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6"><p className="eyebrow">SAQTA / 404</p><h1 className="page-title mt-4">{t("Эта страница не найдена")}</h1><p className="muted mt-4 leading-7">{t("Проверьте адрес или вернитесь к данным вашей пекарни.")}</p><div className="mt-7 flex gap-3"><Link href="/forecast" className="btn-primary">{t("Открыть обзор")}</Link><Link href="/" className="btn-secondary">{t("На главную")}</Link></div></main>;
}
