import type { DetailedForecast } from "./types";

export type AssortmentRisk = "shortage" | "surplus" | "volatile" | "insufficient_history" | "missing_inventory";
export type AssortmentItem = {
  product_id: number; product_name: string; unit: string; location_id: number; location_name: string;
  status: "ok" | "insufficient_history" | "missing_inventory";
  predicted_demand: number | null; recommended_production: number | null;
  available_inventory: number | null; buffered_demand: number | null; expected_surplus: number | null;
  potential_writeoff_cost_kzt: number | null; risks: AssortmentRisk[]; priority: "high" | "medium" | "low";
  history_days: number; history_period: { start_date: string | null; end_date: string | null };
  data_source: "synthetic" | "imported" | "ledger"; warnings: string[];
  explanation_components: DetailedForecast["explanation_components"] | null;
  daily: { date: string; predicted_demand: number; recommended_production: number | null }[];
  mae: number | null; evaluation_points: number;
};
export type AssortmentRun = {
  run_id: number | string; generated_at: string; demo_data: boolean;
  scope: { bakery_id: number; location_id: number | null };
  summary: { product_count: number; location_count: number; eligible_count: number; insufficient_count: number; unknown_inventory_count: number; predicted_demand: number; recommended_production: number | null };
  items: AssortmentItem[];
};
