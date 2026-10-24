import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Loading, PageHeader } from "@/components/ui";
import ForecastWorkspace from "@/features/forecast/workspace";

export default function ForecastPage() {
  return <AppShell>
    <PageHeader eyebrow="SAQTA Forecast" title="От данных к разумному производству" description="Прогнозируйте спрос, проверяйте решения на истории и оценивайте сценарии экономии — в одном рабочем пространстве." action={<Link href="/forecast?view=pricing" className="btn-secondary">Тарифы Forecast</Link>} />
    <Suspense fallback={<Loading label="Открываем SAQTA Forecast…" />}><ForecastWorkspace /></Suspense>
  </AppShell>;
}
