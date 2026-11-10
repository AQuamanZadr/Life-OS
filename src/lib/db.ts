import Dexie, { type EntityTable, type Table } from "dexie";
import type { Habit, HabitLog } from "@/features/habits/schema";
import type { Transaction } from "@/features/finance/schema";
import type { Goal } from "@/features/goals/schema";
import type { Project } from "@/features/projects/schema";
import type { Task } from "@/features/tasks/schema";
import type { TimeEntry } from "@/features/time/schema";

// Таблицы, которые синхронизируются с Supabase (имена совпадают с облачными).
// Порядок важен: сначала те, на кого ссылаются остальные.
export const syncedTables = [
  "goals",
  "projects",
  "tasks",
  "habits",
  "habit_logs",
  "transactions",
  "time_entries",
] as const;
export type SyncedTable = (typeof syncedTables)[number];

// Запись, ожидающая отправки в облако.
export type OutboxEntry = { table: SyncedTable; id: string; updatedAt: string };
export type MetaEntry = { key: string; value: string };

// Локальная база в браузере (IndexedDB).
export const db = new Dexie("life-os") as Dexie & {
  goals: EntityTable<Goal, "id">;
  projects: EntityTable<Project, "id">;
  tasks: EntityTable<Task, "id">;
  habits: EntityTable<Habit, "id">;
  habit_logs: EntityTable<HabitLog, "id">;
  transactions: EntityTable<Transaction, "id">;
  time_entries: EntityTable<TimeEntry, "id">;
  outbox: Table<OutboxEntry, [SyncedTable, string]>;
  meta: EntityTable<MetaEntry, "key">;
};

db.version(1).stores({
  tasks: "id, status, dueDate, projectId, goalId, updatedAt",
});

db.version(2)
  .stores({ outbox: "[table+id], table", meta: "key" })
  .upgrade(async (tx) => {
    // Всё, что создано до появления синхронизации, ставим в очередь отправки.
    const tasks = await tx.table<Task>("tasks").toArray();
    await tx.table<OutboxEntry>("outbox").bulkPut(
      tasks.map((t) => ({ table: "tasks", id: t.id, updatedAt: t.updatedAt })),
    );
  });

db.version(3).stores({
  goals: "id, status",
  projects: "id, status, goalId",
});

db.version(4).stores({
  habits: "id, status",
  habit_logs: "id, habitId, date",
});

db.version(5).stores({
  transactions: "id, date, type, category",
});

db.version(6).stores({
  time_entries: "id, startedAt, taskId, projectId",
});

// Вызывать внутри транзакции записи, включающей db.outbox.
export function markDirty(table: SyncedTable, id: string, updatedAt: string) {
  return db.outbox.put({ table, id, updatedAt });
}

export async function clearLocalData() {
  await db.transaction("rw", db.tables, () =>
    Promise.all(db.tables.map((t) => t.clear())),
  );
}
