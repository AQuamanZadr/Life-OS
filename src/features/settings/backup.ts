import { z } from "zod";
import { db, markDirty, syncedTables, type SyncedTable } from "@/lib/db";
import { requestSync, schemas, syncNow } from "@/lib/sync/engine";

// Резервная копия: все записи пользователя одним JSON-файлом.

type Row = { id: string; updatedAt: string; deletedAt?: string | null };
export type BackupTables = Record<SyncedTable, Row[]>;

const FORMAT = "life-os-backup";
const VERSION = 1;

const fileSchema = z.object({
  format: z.literal(FORMAT),
  version: z.literal(VERSION),
  exportedAt: z.string(),
  tables: z.record(z.string(), z.array(z.unknown())),
});

// Ссылки между таблицами: [таблица, поле, на какую таблицу, обязательная ли].
const links: [SyncedTable, string, SyncedTable, boolean][] = [
  ["projects", "goalId", "goals", false],
  ["tasks", "projectId", "projects", false],
  ["tasks", "goalId", "goals", false],
  ["habit_logs", "habitId", "habits", true],
];

export function buildBackup(tables: BackupTables, exportedAt: string): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, exportedAt, tables }, null, 2);
}

export type ParsedBackup = {
  exportedAt: string;
  tables: BackupTables;
  total: number;
  skipped: number;
};

// Разбирает файл копии. Некорректные записи пропускаются, а не ломают восстановление.
// `existingIds` — id записей, которые уже есть на устройстве (для проверки ссылок).
export function parseBackup(
  text: string,
  existingIds: Record<SyncedTable, ReadonlySet<string>>,
): ParsedBackup | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const file = fileSchema.safeParse(json);
  if (!file.success) return null;

  const tables = {} as BackupTables;
  let skipped = 0;
  for (const table of syncedTables) {
    tables[table] = [];
    for (const raw of file.data.tables[table] ?? []) {
      const row = schemas[table].safeParse(raw);
      if (row.success) tables[table].push(row.data);
      else skipped++;
    }
  }

  // Ссылка на запись, которой нет ни в копии, ни на устройстве, не должна остаться:
  // необязательную обнуляем, запись с обязательной — пропускаем.
  for (const [table, field, target, required] of links) {
    const known = new Set([...existingIds[target], ...tables[target].map((r) => r.id)]);
    tables[table] = tables[table].flatMap((row) => {
      const value = (row as Record<string, unknown>)[field];
      if (typeof value !== "string" || known.has(value)) return [row];
      if (required) {
        skipped++;
        return [];
      }
      return [{ ...row, [field]: null }];
    });
  }

  const total = syncedTables.reduce((n, t) => n + tables[t].length, 0);
  return { exportedAt: file.data.exportedAt, tables, total, skipped };
}

export async function exportBackup(): Promise<string> {
  // Сначала забираем свежие данные из облака, если оно доступно.
  await syncNow();
  const tables = {} as BackupTables;
  for (const table of syncedTables) {
    tables[table] = (await db.table<Row, string>(table).toArray()).filter((r) => !r.deletedAt);
  }
  return buildBackup(tables, new Date().toISOString());
}

export async function existingIds(): Promise<Record<SyncedTable, ReadonlySet<string>>> {
  const result = {} as Record<SyncedTable, ReadonlySet<string>>;
  for (const table of syncedTables) {
    const rows = await db.table<Row, string>(table).toArray();
    result[table] = new Set(rows.filter((r) => !r.deletedAt).map((r) => r.id));
  }
  return result;
}

// Возвращает записи из копии в сохранённое состояние. Записи, созданные после
// копии, не трогает. Восстановленные записи получают новое время изменения,
// поэтому при синхронизации они заменят облачные версии.
export async function restoreBackup(backup: ParsedBackup): Promise<void> {
  const now = new Date().toISOString();
  const stores = syncedTables.map((t) => db.table<Row, string>(t));
  await db.transaction("rw", [...stores, db.outbox], async () => {
    for (const table of syncedTables) {
      for (const row of backup.tables[table]) {
        await db.table<Row, string>(table).put({ ...row, updatedAt: now, deletedAt: null });
        await markDirty(table, row.id, now);
      }
    }
  });
  requestSync(0);
}
