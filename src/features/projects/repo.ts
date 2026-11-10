import { db } from "@/lib/db";
import { insertRow, patchRow, removeRow } from "@/lib/repo";
import type { Task } from "@/features/tasks/schema";
import { projectInputSchema, type Project, type ProjectInput } from "./schema";

export const createProject = (input: ProjectInput) =>
  insertRow<Project>("projects", projectInputSchema.parse(input));

export function updateProject(id: string, input: ProjectInput): Promise<void> {
  const data = projectInputSchema.parse(input);
  return patchRow<Project>("projects", id, () => data);
}

// Удаляет проект и отвязывает от него задачи (сами задачи остаются).
export function deleteProject(id: string): Promise<void> {
  return db.transaction("rw", db.projects, db.tasks, db.outbox, async () => {
    const linked = await db.tasks.where("projectId").equals(id).toArray();
    for (const task of linked) {
      if (!task.deletedAt)
        await patchRow<Task>("tasks", task.id, () => ({ projectId: null }));
    }
    await removeRow("projects", id);
  });
}
