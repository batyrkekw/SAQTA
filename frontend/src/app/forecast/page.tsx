"use client";

import { useI18n } from "@/components/language-provider";

import { AppShell } from "@/components/app-shell";
import { Loading,PageHeader } from "@/components/ui";
import ForecastWorkspace from "@/features/forecast/workspace";
import Link from "next/link";
import { Suspense } from "react";

export default function ForecastPage() {
  const { t } = useI18n();

  return <AppShell>
    <PageHeader eyebrow="SAQTA Forecast" title={t("От данных к разумному производству")} description={t("Прогнозируйте спрос, проверяйте решения на истории и оценивайте сценарии экономии — в одном рабочем пространстве.")} action={<Link href="/forecast?view=pricing" className="btn-secondary">{t("Тарифы Forecast")}</Link>} />
    <Suspense fallback={<Loading label={t("Открываем SAQTA Forecast…")} />}><ForecastWorkspace /></Suspense>
  </AppShell>;
}
