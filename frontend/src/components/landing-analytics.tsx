"use client";

import { BarChart3, FileSpreadsheet, ListChecks } from "lucide-react";
import { useI18n } from "@/components/language-provider";

const steps = [
  { icon: FileSpreadsheet, label: "Ваши данные" },
  { icon: BarChart3, label: "Анализ спроса" },
  { icon: ListChecks, label: "План на завтра" },
];

export default function LandingAnalytics() {
  const { t } = useI18n();
  return (
    <ol aria-label={t("От ваших данных к плану")} className="grid grid-cols-3 gap-3 border-b border-[#E2E8E1] p-6">
      {steps.map(({ icon: Icon, label }) => (
        <li key={label} className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E8EEDD] text-[#237A57]">
            <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span className="text-xs font-medium text-[#123C2F]">{t(label)}</span>
        </li>
      ))}
    </ol>
  );
}
