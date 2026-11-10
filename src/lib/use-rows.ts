"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type SyncedTable } from "@/lib/db";
import type { BaseRow } from "@/lib/schema";

// Живой список записей таблицы без удалённых. undefined — ещё загружается.
export function useRows<T extends BaseRow>(table: SyncedTable): T[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.table<T, string>(table).toArray()).filter((r) => !r.deletedAt),
    [table],
  );
}
