"use client";

import { useToday } from "@/lib/use-today";
import { isOverdue } from "./filter";
import { useTasks } from "./use-tasks";

export function TasksSummary() {
  const tasks = useTasks();
  const today = useToday();
  if (tasks === undefined) return <>&nbsp;</>;
  const active = tasks.filter((t) => t.status !== "done");
  if (tasks.length === 0) return <>Пока нет данных</>;
  const overdue = active.filter((t) => isOverdue(t, today)).length;
  const dueToday = active.filter((t) => t.dueDate === today).length;
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1">
      <span>
        Активных: <b className="font-semibold text-foreground">{active.length}</b>
      </span>
      <span>
        На сегодня: <b className="font-semibold text-foreground">{dueToday}</b>
      </span>
      {overdue > 0 && (
        <span className="text-destructive">Просрочено: {overdue}</span>
      )}
    </span>
  );
}
