import { ForecastAccessProvider } from "@/features/forecast/access-panel";
import PricingPanel from "@/features/forecast/pricing-panel";

export default function BillingPage() {
  return <ForecastAccessProvider><PricingPanel /></ForecastAccessProvider>;
}
