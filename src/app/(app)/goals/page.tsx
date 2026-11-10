import type { Metadata } from "next";
import { GoalsView } from "@/features/goals/goals-view";

export const metadata: Metadata = { title: "Цели" };

export default function Page() {
  return <GoalsView />;
}
