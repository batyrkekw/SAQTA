"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { BarChart3, Calculator, ChartNoAxesCombined, Database, Layers3 } from "lucide-react";
import { Loading, Notice } from "@/components/ui";
import { ForecastAccessProvider, useForecastAccess } from "./access-panel";

const loading = () => <Loading label="Открываем инструмент…" />;
const ForecastTool = dynamic(() => import("./assortment-panel"), { loading });
const BacktestPanel = dynamic(() => import("./backtest-panel"), { loading });
const SavingsCalculator = dynamic(() => import("./savings-calculator"), { loading });
const PricingPanel = dynamic(() => import("./pricing-panel"), { loading });
const DashboardWorkspace = dynamic(() => import("@/features/workspace/dashboard"), { loading });
const InventoryWorkspace = dynamic(() => import("@/features/workspace/inventory"), { loading });
const ImpactWorkspace = dynamic(() => import("@/features/workspace/impact"), { loading });
const SettingsWorkspace = dynamic(() => import("@/features/workspace/settings"), { loading });

const tabs = [
  { id: "forecast", label: "Прогноз", icon: ChartNoAxesCombined },
  { id: "data", label: "Данные", icon: Database },
  { id: "results", label: "Результаты", icon: BarChart3 },
  { id: "savings", label: "Экономия", icon: Calculator },
  { id: "pricing", label: "Тарифы", icon: Layers3 },
] as const;

function DataWorkspace({ initialSettingsOpen }: { initialSettingsOpen: boolean }) {
  const [settingsOpen, setSettingsOpen] = useState(initialSettingsOpen);
  return <div className="space-y-6"><InventoryWorkspace /><details className="rounded-2xl border border-[#DCE5D5] bg-[#F0F4E8] p-5" open={settingsOpen} onToggle={event => setSettingsOpen(event.currentTarget.open)}><summary className="cursor-pointer text-sm font-semibold text-[#123C2F]">Настройки пекарни и источника данных</summary>{settingsOpen && <div className="mt-6"><SettingsWorkspace /></div>}</details></div>;
}

function ResultsWorkspace() {
  const [overviewOpen, setOverviewOpen] = useState(false), [impactOpen, setImpactOpen] = useState(false);
  return <div className="space-y-6"><BacktestPanel /><details className="rounded-2xl border border-[#DCE5D5] bg-[#F0F4E8] p-5" open={overviewOpen} onToggle={event => setOverviewOpen(event.currentTarget.open)}><summary className="cursor-pointer text-sm font-semibold text-[#123C2F]">Продажи, остатки и рекомендации по записям</summary>{overviewOpen && <div className="mt-6"><DashboardWorkspace /></div>}</details><details className="rounded-2xl border border-[#DCE5D5] bg-[#F0F4E8] p-5" open={impactOpen} onToggle={event => setImpactOpen(event.currentTarget.open)}><summary className="cursor-pointer text-sm font-semibold text-[#123C2F]">Подтверждённые выдачи SAQTA Save и списания</summary>{impactOpen && <div className="mt-6"><ImpactWorkspace /></div>}</details></div>;
}

function WorkspaceContent() {
  const params = useSearchParams();
  const access = useForecastAccess();
  const view = tabs.find(tab => tab.id === params.get("view"))?.id || "forecast";
  const needsLogin = access && !access.loading && !access.isDemo && !access.signedIn && (view === "data" || view === "forecast" || view === "results");
  const denied = view === "results" && !access?.canAnalyze;
  return <><nav aria-label="Инструменты SAQTA Forecast" className="mb-7 flex max-w-full flex-wrap gap-1 rounded-xl border border-[#E0E7D9] bg-white p-1.5">{tabs.map(({ id, label, icon: Icon }) => <Link key={id} href={`/forecast?view=${id}`} scroll={false} aria-current={view === id ? "page" : undefined} className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-xs font-medium transition-colors sm:flex-1 ${view === id ? "bg-[#123C2F] text-[#C7F36B]" : "text-[#5D6B62] hover:bg-[#F1F5E9]"}`}><Icon size={16} strokeWidth={1.6} />{label}</Link>)}</nav>
    <div key={view}>{access?.loading ? <Loading label="Проверяем доступ…"/> : needsLogin ? <Notice>Войдите в свою организацию выше. Чужие данные и подписки недоступны.</Notice> : denied ? <Notice>Историческая проверка требует активного тарифа Forecast. Сервер не запускает её без доступа.</Notice> : view === "forecast" ? <ForecastTool /> : view === "data" ? <DataWorkspace key={String(params.get("settings"))} initialSettingsOpen={params.get("settings") === "1"} /> : view === "results" ? <ResultsWorkspace /> : view === "savings" ? <SavingsCalculator /> : <PricingPanel />}</div>
  </>;
}

export default function ForecastWorkspace() { return <ForecastAccessProvider><WorkspaceContent/></ForecastAccessProvider>; }
