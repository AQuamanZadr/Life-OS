/**
 * Движок синхронизации (local-first).
 *
 * Отправка: операции из очереди применяются по порядку. Каждая операция имеет
 * уникальный id, который сервер запоминает в строке (last_op_id), поэтому
 * повторная отправка после обрыва связи не создаёт дублей и не применяется дважды.
 *
 * Конфликты: обновление проходит только если версия строки на сервере равна
 * версии, на которой основано локальное изменение (optimistic concurrency).
 * Иначе — либо автоматическое разрешение для некритичных таблиц, либо конфликт
 * откладывается для ручного решения. «Последняя запись побеждает» безусловно
 * не применяется.
 */
import { getDb, getMeta, setMeta, type SyncOperation } from "../db/db";
import { schemas, TABLE_NAMES, type TableName } from "../db/schema";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/dates";
import { RemoteError, type RemoteAdapter, type RemoteRow } from "./remote";

/** Порядок таблиц: сначала родители, затем зависимые (для внешних ключей). */
export const SYNC_ORDER: TableName[] = [
  "user_settings",
  "categories",
  "tags",
  "goals",
  "goal_milestones",
  "habits",
  "habit_logs",
  "projects",
  "tasks",
  "courses",
  "course_lessons",
  "books",
  "skills",
  "time_entries",
  "accounts",
  "transactions",
  "budgets",
  "custom_metrics",
  "health_records",
  "notes",
  "journal_entries",
  "life_balance",
  "events",
  "entity_links",
  "saved_filters",
];

/**
 * Таблицы, где конфликт разрешается автоматически по времени изменения.
 * Для всех остальных (цели, задачи, финансы, заметки…) решение принимает пользователь.
 */
const AUTO_RESOLVE: ReadonlySet<TableName> = new Set<TableName>(["user_settings", "habit_logs", "life_balance", "saved_filters", "entity_links"]);

const SERVER_FIELDS = new Set(["user_id", "last_op_id", "server_updated_at"]);
const META_FIELDS = new Set(["version", "updated_at", "created_at", ...SERVER_FIELDS]);
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:?\d{2})?|Z)$/;
const DECIMAL_RE = /^-?\d+\.\d+$/;

function canonicalValue(v: unknown): unknown {
  if (typeof v === "string") {
    if (TIMESTAMP_RE.test(v)) return new Date(v).toISOString();
    // NUMERIC приходит с хвостовыми нулями ("1500.50000000") — приводим к виду с 2+ знаками.
    if (DECIMAL_RE.test(v)) {
      const [i, f] = v.split(".");
      const trimmed = f.replace(/0+$/, "");
      return `${i}.${trimmed.padEnd(2, "0")}`;
    }
  }
  return v;
}

/** Приводит строку сервера к локальной форме. */
export function toLocalRow(remote: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(remote)) {
    if (SERVER_FIELDS.has(k)) continue;
    out[k] = canonicalValue(v);
  }
  return out;
}

function stable(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(typeof v === "string" ? canonicalValue(v) : v);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
}

/** Совпадают ли пользовательские данные двух версий записи (без служебных полей). */
export function sameContent(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => !META_FIELDS.has(k)));
  for (const k of keys) if (stable(a[k]) !== stable(b[k])) return false;
  return true;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  failed: number;
  /** Сеть недоступна: изменения остались в очереди. */
  offline: boolean;
  error: string | null;
}

type Outcome = "done" | "conflict" | "retry" | "failed";

async function finishOp(op: SyncOperation, version: number | null) {
  const db = getDb();
  await db.transaction("rw", [db.sync_operations, db.table(op.entity_type)], async () => {
    await db.sync_operations.delete(op.seq!);
    if (version === null) return;
    await db.table(op.entity_type).update(op.entity_id, { version });
    // Более новые локальные изменения той же записи теперь основаны на этой версии.
    await db.sync_operations.where("[entity_type+entity_id]").equals([op.entity_type, op.entity_id]).modify({ base_version: version });
  });
}

async function adoptRemote(op: SyncOperation, remote: RemoteRow) {
  const db = getDb();
  const parsed = schemas[op.entity_type].safeParse(toLocalRow(remote));
  await db.transaction("rw", [db.sync_operations, db.table(op.entity_type)], async () => {
    await db.sync_operations.delete(op.seq!);
    const newer = await db.sync_operations.where("[entity_type+entity_id]").equals([op.entity_type, op.entity_id]).count();
    if (newer > 0) {
      await db.sync_operations.where("[entity_type+entity_id]").equals([op.entity_type, op.entity_id]).modify({ base_version: remote.version });
      await db.table(op.entity_type).update(op.entity_id, { version: remote.version });
    } else if (parsed.success) {
      await db.table(op.entity_type).put(parsed.data);
    }
  });
}

async function markConflict(op: SyncOperation, remote: RemoteRow | null) {
  const db = getDb();
  await db.transaction("rw", [db.sync_operations, db.sync_conflicts], async () => {
    await db.sync_operations.update(op.seq!, { status: "conflict", processed_at: nowIso() });
    await db.sync_conflicts.where("op_id").equals(op.id).delete();
    await db.sync_conflicts.add({
      id: newId(),
      op_id: op.id,
      entity_type: op.entity_type,
      entity_id: op.entity_id,
      local: op.operation_payload,
      remote: remote ? toLocalRow(remote) : null,
      detected_at: nowIso(),
    });
  });
}

/** Версия на сервере разошлась с локальной основой: решаем, что делать. */
async function reconcile(remote: RemoteAdapter, op: SyncOperation, payload: Record<string, unknown>): Promise<Outcome> {
  const current = await remote.get(op.entity_type, op.entity_id);
  if (current && current.last_op_id === op.id) {
    // Операция уже была применена, но ответ до нас не дошёл.
    await finishOp(op, current.version);
    return "done";
  }
  if (current && sameContent(payload, current)) {
    await finishOp(op, current.version);
    return "done";
  }
  if (!current) {
    if (op.base_version === 0) return "retry";
    // Запись удалена на другом устройстве, а здесь изменена.
    await markConflict(op, null);
    return "conflict";
  }
  if (AUTO_RESOLVE.has(op.entity_type)) {
    const localTime = Date.parse(String(payload.updated_at ?? ""));
    const remoteTime = Date.parse(String(current.updated_at ?? ""));
    if (localTime >= remoteTime) {
      const updated = await remote.update(op.entity_type, payload, op.id, current.version);
      if (!updated) return "retry";
      await finishOp(op, updated.version);
      return "done";
    }
    await adoptRemote(op, current);
    return "done";
  }
  await markConflict(op, current);
  return "conflict";
}

async function pushOne(remote: RemoteAdapter, op: SyncOperation): Promise<Outcome> {
  if (op.operation_type === "delete") {
    await remote.remove(op.entity_type, op.entity_id);
    await finishOp(op, null);
    return "done";
  }
  const payload = op.operation_payload;
  if (!payload) {
    await finishOp(op, null);
    return "done";
  }
  if (op.base_version === 0) {
    const res = await remote.insert(op.entity_type, payload, op.id);
    if (res.ok) {
      await finishOp(op, res.row.version);
      return "done";
    }
    return reconcile(remote, op, payload);
  }
  const updated = await remote.update(op.entity_type, payload, op.id, op.base_version);
  if (updated) {
    await finishOp(op, updated.version);
    return "done";
  }
  return reconcile(remote, op, payload);
}

const MAX_RETRIES = 8;

async function push(remote: RemoteAdapter, result: SyncResult): Promise<void> {
  const db = getDb();
  // Операции, оставшиеся «в полёте» после закрытия вкладки, отправляем заново — это безопасно.
  await db.sync_operations.where("status").equals("in_flight").modify({ status: "pending" });
  for (let pass = 0; pass < 6; pass++) {
    const pending = (await db.sync_operations.where("status").equals("pending").sortBy("seq")).filter((op) => op.retry_count < MAX_RETRIES || pass === 0);
    if (pending.length === 0) return;
    let progress = 0;
    for (const queued of pending) {
      // Операция могла быть заменена более новой, пока шла отправка предыдущих.
      const op = await db.sync_operations.get(queued.seq!);
      if (!op || op.status !== "pending") continue;
      await db.sync_operations.update(op.seq!, { status: "in_flight" });
      try {
        const outcome = await pushOne(remote, op);
        if (outcome === "done") {
          result.pushed++;
          progress++;
        } else if (outcome === "conflict") {
          result.conflicts++;
          progress++;
        } else {
          await db.sync_operations.update(op.seq!, { status: "pending", retry_count: op.retry_count + 1 });
        }
      } catch (e) {
        const err = e instanceof RemoteError ? e : new RemoteError("unknown", e instanceof Error ? e.message : String(e));
        if (err.kind === "network" || err.kind === "auth") {
          await db.sync_operations.update(op.seq!, { status: "pending" });
          result.offline = err.kind === "network";
          result.error = err.message;
          throw err;
        }
        if (err.kind === "dependency") {
          // Связанная запись ещё не отправлена — повторим на следующем проходе.
          await db.sync_operations.update(op.seq!, { status: "pending", retry_count: op.retry_count + 1, last_error: err.message });
        } else {
          await db.sync_operations.update(op.seq!, { status: "failed", retry_count: op.retry_count + 1, last_error: err.message, processed_at: nowIso() });
          result.failed++;
          progress++;
        }
      }
    }
    if (progress === 0) return;
  }
}

const PAGE = 500;

async function pull(remote: RemoteAdapter, result: SyncResult): Promise<void> {
  const db = getDb();
  for (const table of SYNC_ORDER) {
    const cursorKey = `sync_cursor:${table}`;
    const since = await getMeta<string | null>(cursorKey, null);
    let maxSeen = since;
    for (let offset = 0; ; offset += PAGE) {
      const rows = await remote.listChanged(table, since, PAGE, offset);
      for (const remoteRow of rows) {
        if (!maxSeen || remoteRow.server_updated_at > maxSeen) maxSeen = remoteRow.server_updated_at;
        const parsed = schemas[table].safeParse(toLocalRow(remoteRow));
        if (!parsed.success) {
          await logSyncError(`Строка ${table}/${remoteRow.id} с сервера не прошла проверку: ${parsed.error.issues[0]?.message}`);
          continue;
        }
        const applied = await db.transaction("rw", [db.table(table), db.sync_operations], async () => {
          // Есть неотправленные локальные изменения — их согласует отправка (или конфликт).
          const local = (await db.table(table).get(remoteRow.id)) as { version: number } | undefined;
          const ops = await db.sync_operations.where("[entity_type+entity_id]").equals([table, remoteRow.id]).count();
          if (ops > 0) return false;
          if (local && local.version >= remoteRow.version) return false;
          await db.table(table).put(parsed.data);
          return true;
        });
        if (applied) result.pulled++;
      }
      if (rows.length < PAGE) break;
    }
    if (maxSeen && maxSeen !== since) await setMeta(cursorKey, maxSeen);
  }

  const tombKey = "sync_cursor:tombstones";
  const tombSince = await getMeta<string | null>(tombKey, null);
  const tombstones = await remote.listTombstones(tombSince);
  let maxTomb = tombSince;
  for (const t of tombstones) {
    if (!maxTomb || t.deleted_at > maxTomb) maxTomb = t.deleted_at;
    if (!TABLE_NAMES.includes(t.entity_type as TableName)) continue;
    const table = t.entity_type as TableName;
    const removed = await db.transaction("rw", [db.table(table), db.sync_operations], async () => {
      const ops = await db.sync_operations.where("[entity_type+entity_id]").equals([table, t.entity_id]).toArray();
      // Локально запись изменена, а на сервере удалена — оставляем решение отправке (конфликт).
      if (ops.some((op) => op.operation_type === "upsert")) return false;
      const local = await db.table(table).get(t.entity_id);
      if (!local) return false;
      await db.table(table).delete(t.entity_id);
      return true;
    });
    if (removed) result.pulled++;
  }
  if (maxTomb && maxTomb !== tombSince) await setMeta(tombKey, maxTomb);
}

async function logSyncError(message: string) {
  try {
    await getDb().error_logs.add({ id: newId(), occurred_at: nowIso(), source: "sync", message, stack: null });
  } catch {
    /* журнал ошибок не должен ломать синхронизацию */
  }
}

let running: Promise<SyncResult> | null = null;

/** Полный цикл синхронизации. Параллельные вызовы объединяются в один. */
export function syncNow(remote: RemoteAdapter): Promise<SyncResult> {
  if (running) return running;
  running = (async () => {
    const result: SyncResult = { pushed: 0, pulled: 0, conflicts: 0, failed: 0, offline: false, error: null };
    try {
      await push(remote, result);
      await pull(remote, result);
      await setMeta("sync_last_success", nowIso());
    } catch (e) {
      const err = e instanceof RemoteError ? e : new RemoteError("unknown", e instanceof Error ? e.message : String(e));
      result.offline = err.kind === "network";
      result.error = err.message;
      if (err.kind !== "network") await logSyncError(err.message);
    } finally {
      running = null;
    }
    return result;
  })();
  return running;
}

/** Ручное разрешение конфликта: оставить локальную версию или принять серверную. */
export async function resolveConflict(conflictId: string, choice: "local" | "remote"): Promise<void> {
  const db = getDb();
  const conflict = await db.sync_conflicts.get(conflictId);
  if (!conflict) return;
  const table = conflict.entity_type;
  await db.transaction("rw", [db.sync_conflicts, db.sync_operations, db.table(table), db.audit_logs], async () => {
    const op = await db.sync_operations.where("id").equals(conflict.op_id).first();
    const remoteVersion = conflict.remote ? Number(conflict.remote.version ?? 0) : 0;
    if (choice === "local") {
      if (op) await db.sync_operations.update(op.seq!, { status: "pending", base_version: remoteVersion, retry_count: 0, last_error: null });
      await db.table(table).update(conflict.entity_id, { version: remoteVersion });
    } else {
      if (op) await db.sync_operations.delete(op.seq!);
      if (conflict.remote) {
        const parsed = schemas[table].safeParse(conflict.remote);
        if (parsed.success) await db.table(table).put(parsed.data);
      } else {
        await db.table(table).delete(conflict.entity_id);
      }
    }
    await db.sync_conflicts.delete(conflictId);
    await db.audit_logs.add({
      id: newId(),
      entity_type: table,
      entity_id: conflict.entity_id,
      action: "sync",
      changed_at: nowIso(),
      change_summary: choice === "local" ? "Конфликт: оставлена локальная версия" : "Конфликт: принята версия с сервера",
    });
  });
}

/** Повторить операции, отклонённые сервером (после исправления данных). */
export async function retryFailed(): Promise<void> {
  await getDb().sync_operations.where("status").equals("failed").modify({ status: "pending", retry_count: 0 });
}

export async function pendingCount(): Promise<number> {
  return getDb().sync_operations.where("status").anyOf("pending", "in_flight").count();
}
