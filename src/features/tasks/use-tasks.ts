"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Task } from "./schema";

// undefined — данные ещё загружаются.
export function useTasks(): Task[] | undefined {
  return useLiveQuery(async () =>
    (await db.tasks.toArray()).filter((t) => !t.deletedAt),
  );
}
