import type { Task, TaskPriority, TaskStatus } from "./schema";

export type TaskFilter = {
  query: string;
  status: TaskStatus | "active" | "all";
  priority: TaskPriority | "all";
};

export const defaultTaskFilter: TaskFilter = {
  query: "",
  status: "active",
  priority: "all",
};

const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

export function isOverdue(task: Task, today: string): boolean {
  return task.status !== "done" && task.dueDate !== null && task.dueDate < today;
}

export function filterTasks(tasks: Task[], filter: TaskFilter): Task[] {
  const q = filter.query.trim().toLowerCase();
  return tasks
    .filter((t) => {
      if (t.deletedAt) return false;
      if (filter.status === "active" && t.status === "done") return false;
      if (
        filter.status !== "active" &&
        filter.status !== "all" &&
        t.status !== filter.status
      )
        return false;
      if (filter.priority !== "all" && t.priority !== filter.priority)
        return false;
      if (
        q &&
        !t.title.toLowerCase().includes(q) &&
        !t.notes.toLowerCase().includes(q)
      )
        return false;
      return true;
    })
    .sort(compareTasks);
}

// Невыполненные выше; затем по сроку (без срока — в конце), приоритету и новизне.
export function compareTasks(a: Task, b: Task): number {
  const doneA = a.status === "done" ? 1 : 0;
  const doneB = b.status === "done" ? 1 : 0;
  if (doneA !== doneB) return doneA - doneB;
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  if (a.priority !== b.priority)
    return priorityRank[a.priority] - priorityRank[b.priority];
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}
