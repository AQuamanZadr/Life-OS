import { addDays, type DateStr } from "@/core/lib/dates";
import { nextOccurrence } from "@/core/lib/recurrence";
import { deterministicId } from "@/core/lib/ids";
import type { Task } from "@/core/db/schema";

export type TaskView = "all" | "today" | "upcoming" | "overdue" | "done";

export function isOpen(task: Pick<Task, "status">): boolean {
  return task.status === "todo" || task.status === "in_progress";
}

export function isTaskOverdue(task: Pick<Task, "status" | "due_date">, today: DateStr): boolean {
  return isOpen(task) && !!task.due_date && task.due_date < today;
}

export function matchesView(task: Pick<Task, "status" | "due_date">, view: TaskView, today: DateStr): boolean {
  switch (view) {
    case "all":
      return isOpen(task);
    case "today":
      return isOpen(task) && task.due_date === today;
    case "upcoming":
      return isOpen(task) && !!task.due_date && task.due_date > today && task.due_date <= addDays(today, 14);
    case "overdue":
      return isTaskOverdue(task, today);
    case "done":
      return task.status === "done";
  }
}

const PRIORITY_WEIGHT = { critical: 0, high: 1, medium: 2, low: 3 } as const;

/** Сортировка по умолчанию: срок, затем приоритет, затем порядок создания. */
export function compareTasks(a: Task, b: Task): number {
  const da = a.due_date ?? "9999-12-31";
  const db = b.due_date ?? "9999-12-31";
  if (da !== db) return da < db ? -1 : 1;
  const ta = a.due_time ?? "99:99";
  const tb = b.due_time ?? "99:99";
  if (ta !== tb) return ta < tb ? -1 : 1;
  const p = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
  if (p !== 0) return p;
  return a.created_at < b.created_at ? -1 : 1;
}

/**
 * Следующее вхождение повторяющейся задачи после её выполнения.
 * id детерминирован (задача + дата), поэтому повторное завершение или
 * синхронизация с другого устройства не создаст второй экземпляр.
 */
export function nextRecurringTask(task: Task): { id: string; due_date: DateStr } | null {
  if (!task.recurrence_rule || !task.due_date) return null;
  const next = nextOccurrence(task.recurrence_rule, task.due_date, task.due_date);
  if (!next) return null;
  return { id: deterministicId("task-recurrence", task.id, next), due_date: next };
}

/** Доля выполненных задач, 0–100 (отменённые не учитываются). */
export function completionPercent(tasks: Pick<Task, "status" | "deleted_at">[]): number {
  const counted = tasks.filter((t) => !t.deleted_at && t.status !== "cancelled");
  if (counted.length === 0) return 0;
  return Math.round((counted.filter((t) => t.status === "done").length / counted.length) * 100);
}
