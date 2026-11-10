import { db } from "@/lib/db";
import { insertRow, patchRow, removeRow } from "@/lib/repo";
import type { Project } from "@/features/projects/schema";
import type { Task } from "@/features/tasks/schema";
import { goalInputSchema, type Goal, type GoalInput } from "./schema";

export const createGoal = (input: GoalInput) =>
  insertRow<Goal>("goals", goalInputSchema.parse(input));

export function updateGoal(id: string, input: GoalInput): Promise<void> {
  const data = goalInputSchema.parse(input);
  return patchRow<Goal>("goals", id, () => data);
}

// Удаляет цель и отвязывает от неё проекты и задачи (они остаются).
export function deleteGoal(id: string): Promise<void> {
  return db.transaction("rw", db.goals, db.projects, db.tasks, db.outbox, async () => {
    for (const project of await db.projects.where("goalId").equals(id).toArray()) {
      if (!project.deletedAt)
        await patchRow<Project>("projects", project.id, () => ({ goalId: null }));
    }
    for (const task of await db.tasks.where("goalId").equals(id).toArray()) {
      if (!task.deletedAt)
        await patchRow<Task>("tasks", task.id, () => ({ goalId: null }));
    }
    await removeRow("goals", id);
  });
}
