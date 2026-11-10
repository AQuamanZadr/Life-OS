import type { Metadata } from "next";
import { HabitsView } from "@/features/habits/habits-view";

export const metadata: Metadata = { title: "Привычки" };

export default function Page() {
  return <HabitsView />;
}
