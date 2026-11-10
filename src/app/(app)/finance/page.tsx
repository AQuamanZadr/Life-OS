import type { Metadata } from "next";
import { FinanceView } from "@/features/finance/finance-view";

export const metadata: Metadata = { title: "Финансы" };

export default function Page() {
  return <FinanceView />;
}
