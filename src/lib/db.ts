import Dexie, { type EntityTable } from "dexie";
import type { Task } from "@/features/tasks/schema";

// Локальная база в браузере (IndexedDB).
export const db = new Dexie("life-os") as Dexie & {
  tasks: EntityTable<Task, "id">;
};

db.version(1).stores({
  tasks: "id, status, dueDate, projectId, goalId, updatedAt",
});
