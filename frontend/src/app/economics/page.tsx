import { redirect } from "next/navigation";

export default function LegacyEconomics() {
  redirect("/forecast?view=pricing");
}
