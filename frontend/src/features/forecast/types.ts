import type { Forecast } from "@/types/api";

export type ExplanationDay = {
  date: string;
  recent_sales: { date: string; sales: number }[];
  recent_mean: number;
  same_weekday_sales: { date: string; sales: number }[];
  same_weekday_mean: number | null;
  recent_weight: number;
  same_weekday_weight: number;
  weekday_difference: number | null;
  weighted_demand: number;
  predicted_demand: number;
  available_inventory: number | null;
  buffered_demand: number;
  recommended_production: number | null;
  demand_formula: string;
  production_formula: string;
};
export type DetailedForecast = Forecast & {
  explanation_components?: {
    history_days: number;
    safety_buffer_percent: number;
    existing_inventory: number | null;
    days: ExplanationDay[];
    limitations: string[];
  };
};
export type BacktestResult = {
  product_id: number;
  product_name: string;
  location_id: number;
  demo_data: boolean;
  data_source: "synthetic" | "real";
  status: "ok" | "insufficient_history";
  method: string;
  naive_method: string;
  history_days: number;
  min_train_days: number;
  requested_test_days: number;
  evaluation_points: number;
  period: { start_date: string | null; end_date: string | null };
  metrics: { mae: number | null; wape_percent: number | null };
  naive_metrics: { mae: number | null; wape_percent: number | null };
  mae_improvement_percent: number | null;
  observation_source?: { days_with_sales_records: number; days_without_sales_records: number; missing_calendar_days: number; zero_sales_interpretation: string };
  points: { date: string; actual: number; predicted: number; naive_predicted: number; absolute_error: number; naive_absolute_error: number; training_observations: number; training_end_date: string }[];
  warnings: string[];
  requirements: string[];
  generated_at: string;
};
