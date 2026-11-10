import type { Metadata } from "next";
import { ProjectsView } from "@/features/projects/projects-view";

export const metadata: Metadata = { title: "Проекты" };

export default function Page() {
  return <ProjectsView />;
}
