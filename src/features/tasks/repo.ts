import { insertRow, patchRow, removeRow } from "@/lib/repo";
import { taskInputSchema, type Task, type TaskInput } from "./schema";

function completedAtFor(
  status: Task["status"],
  previous: string | null,
  now: string,
): string | null {
  if (status !== "done") return null;
  return previous ?? now;
}

export function createTask(input: TaskInput): Promise<Task> {
  const data = taskInputSchema.parse(input);
  return insertRow<Task>("tasks", {
    ...data,
    completedAt: completedAtFor(data.status, null, new Date().toISOString()),
  });
}

export function updateTask(id: string, input: TaskInput): Promise<void> {
  const data = taskInputSchema.parse(input);
  return patchRow<Task>("tasks", id, (current, now) => ({
    ...data,
    completedAt: completedAtFor(data.status, current.completedAt, now),
  }));
}

export function setTaskDone(id: string, done: boolean): Promise<void> {
  return patchRow<Task>("tasks", id, (_, now) => ({
    status: done ? "done" : "todo",
    completedAt: done ? now : null,
  }));
}

export const deleteTask = (id: string) => removeRow("tasks", id);
