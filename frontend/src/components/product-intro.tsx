"use client";

import { Leaf, ShoppingBag, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "./language-provider";

const steps = {
  save: ["Выбирайте рядом", "Бронируйте онлайн", "Забирайте вовремя"],
  forecast: ["CSV и Excel", "Анкета без истории", "Понятные рекомендации"],
};

export function ProductIntro({ kind, title, description, action }: {
  kind: "save" | "forecast";
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const { t } = useI18n();
  const Icon = kind === "save" ? ShoppingBag : TrendingUp;
  return (
    <header className={`workspace-hero workspace-hero--${kind}`}>
      <div className="workspace-hero-copy">
        <p className="workspace-kicker"><Leaf size={14} aria-hidden="true" />SAQTA {kind.toUpperCase()}</p>
        <h1>{t(title)}</h1>
        <p className="workspace-hero-description">{t(description)}</p>
        <div className="workspace-hero-bottom">
        <ul className="workspace-pills">{steps[kind].map(step => <li key={step}>{t(step)}</li>)}</ul>
        {action && <div className="workspace-hero-action">{action}</div>}
        </div>
      </div>
      <div className="workspace-emblem" aria-hidden="true"><span className="workspace-orbit" /><span className="workspace-emblem-icon"><Icon size={68} strokeWidth={1} /></span><span className="workspace-emblem-leaf"><Leaf size={23} /></span></div>
    </header>
  );
}
