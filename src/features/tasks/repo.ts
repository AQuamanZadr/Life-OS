import { db, markDirty } from "@/lib/db";
import { requestSync } from "@/lib/sync/engine";
import { taskInputSchema, type Task, type TaskInput } from "./schema";

function completedAtFor(
  status: Task["status"],
  previous: string | null,
  now: string,
): string | null {
  if (status !== "done") return null;
  return previous ?? now;
}

// Изменяет задачу и ставит её в очередь синхронизации одной транзакцией.
async function patchTask(
  id: string,
  change: (current: Task, now: string) => Partial<Task>,
): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction("rw", db.tasks, db.outbox, async () => {
    const current = await db.tasks.get(id);
    if (!current || current.deletedAt) throw new Error("Задача не найдена");
    await db.tasks.update(id, { ...change(current, now), updatedAt: now });
    await markDirty("tasks", id, now);
  });
  requestSync();
}

export async function createTask(input: TaskInput): Promise<Task> {
  const data = taskInputSchema.parse(input);
  const now = new Date().toISOString();
  const task: Task = {
    ...data,
    id: crypto.randomUUID(),
    projectId: null,
    goalId: null,
    createdAt: now,
    updatedAt: now,
    completedAt: completedAtFor(data.status, null, now),
    deletedAt: null,
  };
  await db.transaction("rw", db.tasks, db.outbox, async () => {
    await db.tasks.add(task);
    await markDirty("tasks", task.id, now);
  });
  requestSync();
  return task;
}

export function updateTask(id: string, input: TaskInput): Promise<void> {
  const data = taskInputSchema.parse(input);
  return patchTask(id, (current, now) => ({
    ...data,
    completedAt: completedAtFor(data.status, current.completedAt, now),
  }));
}

export function setTaskDone(id: string, done: boolean): Promise<void> {
  return patchTask(id, (_, now) => ({
    status: done ? "done" : "todo",
    completedAt: done ? now : null,
  }));
}

export function deleteTask(id: string): Promise<void> {
  return patchTask(id, (_, now) => ({ deletedAt: now }));
}
