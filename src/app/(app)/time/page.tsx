import type { Metadata } from "next";
import { TimeView } from "@/features/time/time-view";

export const metadata: Metadata = { title: "Время" };

export default function Page() {
  return <TimeView />;
}
