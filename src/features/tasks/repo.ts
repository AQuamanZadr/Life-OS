import { db } from "@/lib/db";
import { taskInputSchema, type Task, type TaskInput } from "./schema";

function completedAtFor(
  status: Task["status"],
  previous: string | null,
  now: string,
): string | null {
  if (status !== "done") return null;
  return previous ?? now;
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
  await db.tasks.add(task);
  return task;
}

export async function updateTask(id: string, input: TaskInput): Promise<void> {
  const data = taskInputSchema.parse(input);
  const now = new Date().toISOString();
  await db.transaction("rw", db.tasks, async () => {
    const current = await db.tasks.get(id);
    if (!current || current.deletedAt) throw new Error("Задача не найдена");
    await db.tasks.update(id, {
      ...data,
      updatedAt: now,
      completedAt: completedAtFor(data.status, current.completedAt, now),
    });
  });
}

export async function setTaskDone(id: string, done: boolean): Promise<void> {
  const now = new Date().toISOString();
  await db.tasks.update(id, {
    status: done ? "done" : "todo",
    completedAt: done ? now : null,
    updatedAt: now,
  });
}

export async function deleteTask(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.tasks.update(id, { deletedAt: now, updatedAt: now });
}
