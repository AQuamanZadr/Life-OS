import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { transactionSchema } from "@/features/finance/schema";
import { goalSchema } from "@/features/goals/schema";
import { habitLogSchema, habitSchema } from "@/features/habits/schema";
import { projectSchema } from "@/features/projects/schema";
import { taskSchema } from "@/features/tasks/schema";
import { timeEntrySchema } from "@/features/time/schema";
import {
  clearLocalData,
  db,
  syncedTables,
  type OutboxEntry,
  type SyncedTable,
} from "@/lib/db";
import { hardNavigate } from "@/lib/hard-navigate";
import { getSupabase } from "@/lib/supabase/client";
import { localOnly, supabaseConfigured } from "@/lib/supabase/config";
import { fromRemote, toRemote } from "./mapping";

// Синхронизация локальной базы с Supabase.
// Правило при конфликте: побеждает запись с более поздним updatedAt.

type Row = { id: string; updatedAt: string };

export const schemas: Record<SyncedTable, z.ZodType<Row>> = {
  goals: goalSchema,
  projects: projectSchema,
  tasks: taskSchema,
  habits: habitSchema,
  habit_logs: habitLogSchema,
  transactions: transactionSchema,
  time_entries: timeEntrySchema,
};

const PAGE = 500;

export type SyncStatus = "idle" | "syncing" | "offline" | "error";
export type SyncState = { status: SyncStatus; lastSyncedAt: string | null };

export const syncEnabled = supabaseConfigured && !localOnly;

let state: SyncState = { status: "idle", lastSyncedAt: null };
const listeners = new Set<() => void>();

function setState(next: Partial<SyncState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function subscribeSync(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getSyncState = () => state;

let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

// Запросить синхронизацию с небольшой задержкой (после локальной записи).
export function requestSync(delay = 800) {
  if (!syncEnabled || typeof window === "undefined") return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

export function syncNow(): Promise<void> {
  if (!syncEnabled) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = run().finally(() => {
    running = null;
    if (again) {
      again = false;
      requestSync(0);
    }
  });
  return running;
}

async function run() {
  if (!navigator.onLine) {
    setState({ status: "offline" });
    return;
  }
  setState({ status: "syncing" });
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) {
      // Сессия закончилась — на страницу входа.
      hardNavigate("/login");
      return;
    }
    await ensureOwner(userId);
    // Сбой одной таблицы не должен останавливать синхронизацию остальных.
    let failed = false;
    for (const table of syncedTables) {
      try {
        await pull(supabase, table);
        await push(supabase, table);
      } catch {
        failed = true;
      }
    }
    if (failed) throw new Error("sync incomplete");
    setState({ status: "idle", lastSyncedAt: new Date().toISOString() });
  } catch {
    // Подробности ошибки не выводим: в них могут быть личные данные.
    setState({ status: navigator.onLine ? "error" : "offline" });
  }
}

// Локальные данные принадлежат одному пользователю; при смене — очищаем.
async function ensureOwner(userId: string) {
  const owner = await db.meta.get("owner");
  if (owner?.value === userId) return;
  if (owner) await clearLocalData();
  await db.meta.put({ key: "owner", value: userId });
}

async function pull(supabase: SupabaseClient, table: SyncedTable) {
  const cursorKey = `pull:${table}`;
  const cursor = (await db.meta.get(cursorKey))?.value;
  let latest = cursor;

  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from(table)
      .select("*")
      .order("server_updated_at")
      .order("id")
      .range(from, from + PAGE - 1);
    if (cursor) query = query.gte("server_updated_at", cursor);
    const { data, error } = await query;
    if (error) throw new Error("pull failed");

    const rows: Row[] = [];
    for (const remote of data as Record<string, unknown>[]) {
      const parsed = schemas[table].safeParse(fromRemote(remote));
      if (parsed.success) rows.push(parsed.data);
      const stamp = remote.server_updated_at;
      if (typeof stamp === "string" && (!latest || stamp > latest)) latest = stamp;
    }

    const local = db.table<Row, string>(table);
    await db.transaction("rw", local, async () => {
      const current = await local.bulkGet(rows.map((r) => r.id));
      const newer = rows.filter((row, i) => {
        const mine = current[i];
        return !mine || row.updatedAt > mine.updatedAt;
      });
      await local.bulkPut(newer);
    });

    if (data.length < PAGE) break;
  }

  if (latest && latest !== cursor) {
    await db.meta.put({ key: cursorKey, value: latest });
  }
}

async function push(supabase: SupabaseClient, table: SyncedTable) {
  const entries = await db.outbox.where("table").equals(table).toArray();
  for (let i = 0; i < entries.length; i += PAGE) {
    const batch = entries.slice(i, i + PAGE);
    const found = await db.table<Row, string>(table).bulkGet(batch.map((e) => e.id));
    const rows = found.filter((r): r is Row => r !== undefined);
    if (rows.length > 0) {
      const { error } = await supabase
        .from(table)
        .upsert(rows.map(toRemote), { onConflict: "id" });
      if (error) throw new Error("push failed");
    }
    const sent = new Map(rows.map((r) => [r.id, r.updatedAt]));
    await db.transaction("rw", db.outbox, async () => {
      for (const entry of batch) {
        // Если запись изменили во время отправки, оставляем её в очереди.
        const now = await db.outbox.get([entry.table, entry.id]);
        if (now && isSent(now, sent)) await db.outbox.delete([entry.table, entry.id]);
      }
    });
  }
}

function isSent(entry: OutboxEntry, sent: Map<string, string>) {
  const pushed = sent.get(entry.id);
  return pushed === undefined || pushed >= entry.updatedAt;
}

export async function signOut() {
  await syncNow();
  const pending = await db.outbox.count();
  if (
    pending > 0 &&
    !window.confirm(
      `Не отправлено изменений: ${pending}. Если выйти сейчас, они будут потеряны. Выйти?`,
    )
  ) {
    return;
  }
  await getSupabase().auth.signOut({ scope: "local" });
  await clearLocalData();
  hardNavigate("/login");
}
