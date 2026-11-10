import type { Metadata } from "next";
import { TasksView } from "@/features/tasks/tasks-view";

export const metadata: Metadata = { title: "Задачи" };

export default function TasksPage() {
  return <TasksView />;
}
