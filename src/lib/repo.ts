import { db, markDirty, type SyncedTable } from "@/lib/db";
import type { BaseRow } from "@/lib/schema";
import { requestSync } from "@/lib/sync/engine";

// Общие операции записи: изменение и постановка в очередь синхронизации
// выполняются одной транзакцией. Функции можно вызывать внутри внешней
// транзакции Dexie, если она включает нужную таблицу и db.outbox.

const rows = <T extends BaseRow>(table: SyncedTable) => db.table<T, string>(table);

export async function insertRow<T extends BaseRow>(
  table: SyncedTable,
  data: Omit<T, keyof BaseRow>,
  // Если id задан заранее, повторный вызов с тем же id ничего не добавит.
  id: string = crypto.randomUUID(),
): Promise<T> {
  const now = new Date().toISOString();
  const row = {
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  } as T;
  const saved = await db.transaction("rw", rows(table), db.outbox, async () => {
    const existing = await rows<T>(table).get(id);
    if (existing) return existing;
    await rows<T>(table).add(row);
    await markDirty(table, row.id, now);
    return row;
  });
  requestSync();
  return saved;
}

export async function patchRow<T extends BaseRow>(
  table: SyncedTable,
  id: string,
  change: (current: T, now: string) => Partial<T>,
): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction("rw", rows(table), db.outbox, async () => {
    const current = await rows<T>(table).get(id);
    if (!current || current.deletedAt) throw new Error("Запись не найдена");
    await rows<T>(table).put({ ...current, ...change(current, now), updatedAt: now });
    await markDirty(table, id, now);
  });
  requestSync();
}

export function removeRow(table: SyncedTable, id: string): Promise<void> {
  return patchRow<BaseRow>(table, id, (_, now) => ({ deletedAt: now }));
}
