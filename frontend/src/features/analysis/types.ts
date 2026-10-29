export type EstimateProduct = {
  name: string;
  category: string;
  unit: string;
  price: number | null;
  typical_produced: number | null;
  typical_sold: number | null;
  typical_remaining: number | null;
  frequency: string;
  shelf_life_days: number | null;
};
export type Profile = {
  schema_version: 1;
  business_type: string;
  locations_count: number;
  estimate_location_id?: number | null;
  categories: string;
  working_days: number[];
  hours: string;
  weekday_variation: string;
  products: EstimateProduct[];
  demand: string;
  weekend: string;
  peak_hours: string;
  seasonality: string;
  promotions: string;
  leftover_causes: string;
  holidays: string;
  weather: string;
  supply: string;
  price_changes: string;
  confidence: "estimate" | "unknown";
  updated_at?: string;
};
export type AnalysisItem = {
  product_id: number;
  product_name: string;
  unit: string;
  location_id: number;
  location_name: string;
  status: "ready" | "estimate" | "insufficient";
  model: string | null;
  observations: number;
  demand?: number;
  production?: number | null;
  inventory: number | null;
  inventory_source: { warning: string; as_of_date: string | null };
  metrics: null | {
    mae: number;
    rmse: number;
    wape: number | null;
    points: { date: string; actual: number; predicted: number }[];
  };
  comparison: {
    model: string;
    mae: number;
    rmse: number;
    wape: number | null;
  }[];
  daily: {
    date: string;
    demand: number;
    production: number | null;
    surplus: number | null;
  }[];
  actual_history: { date: string; sold: number }[];
  quality: {
    observed_days: number;
    missing_days: number;
    zero_days: number;
    first_date: string | null;
    last_date: string | null;
  };
  explanation: { mode: string; facts: string[] };
  trend_units: number | null;
  holdout_period?: string[];
  validation_period?: string[];
};
export type AnalysisReport = {
  run_id: number;
  created_at: string;
  target_date: string;
  horizon_days: number;
  task: string;
  cached: boolean;
  items: AnalysisItem[];
  explanation_service?: string;
  data_source: string;
};
export type AnalysisState = {
  explanation_available?: boolean;
  profile: Profile | null;
  latest: AnalysisReport | null;
  products: { id: number; name: string; unit: string }[];
  locations: { id: number; name: string; address: string }[];
  imports: {
    id: number;
    source: string;
    sheet: string;
    rows: number;
    duplicates: number;
    created_at: string;
  }[];
};
