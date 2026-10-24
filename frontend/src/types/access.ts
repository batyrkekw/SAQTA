export type Subscription = {
  plan: "free" | "starter" | "pro" | "demo";
  status: "inactive" | "active" | "expired" | "demo";
  active: boolean;
  access_mode: "demo" | "paid" | "unavailable";
  expires_at: string | null;
  limits: { products: number | null; forecast_runs_per_month: number | null; locations: number | null };
  usage: { period: string; forecast_runs: number; remaining: number | null };
  manual_activation: boolean;
};
export type AuthSession = {
  token: string;
  expires_at: string;
  user: { id: number; email: string; bakery_id: number };
  organization: { id: number; name: string };
  subscription: Subscription;
};
export type WorkspaceHealth = { status: string; workspace_mode: "demo" | "real"; demo_data: boolean };
