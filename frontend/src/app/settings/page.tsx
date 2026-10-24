import { redirect } from "next/navigation";

export default function LegacyPage() {
  redirect("/forecast?view=data&settings=1");
}
