/**
 * Репозиторий: единственная точка записи пользовательских данных.
 *
 * Каждое изменение в одной транзакции IndexedDB:
 *   1) проверяется схемой Zod;
 *   2) сохраняется в локальной таблице;
 *   3) попадает в очередь синхронизации;
 *   4) фиксируется в журнале изменений.
 * Если любой шаг не удался, не сохраняется ничего.
 */
import Dexie from "dexie";
import { z } from "zod";
import { getDb, type AuditLog, type SyncOperation } from "./db";
import { CASCADES, NULLIFY, schemas, TABLE_NAMES, type NewRow, type Patch, type Row, type TableName } from "./schema";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/dates";

export class ValidationError extends Error {
  /** Ошибки по полям: имя поля → сообщение. */
  fields: Record<string, string>;
  constructor(fields: Record<string, string>) {
    super(Object.values(fields)[0] ?? "Данные не прошли проверку");
    this.name = "ValidationError";
    this.fields = fields;
  }
}

export class NotFoundError extends Error {
  constructor() {
    super("Запись не найдена");
    this.name = "NotFoundError";
  }
}

export class BusinessRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessRuleError";
  }
}

export function validateRow<T extends TableName>(table: T, data: unknown): Row<T> {
  const result = (schemas[table] as z.ZodType).safeParse(data);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "_");
      if (!fields[key]) fields[key] = issue.message;
    }
    throw new ValidationError(fields);
  }
  return result.data as Row<T>;
}

const TX_TABLES = [...TABLE_NAMES, "sync_operations", "audit_logs"];

function tx<R>(fn: () => Promise<R>): Promise<R> {
  const db = getDb();
  // Вложенные вызовы переиспользуют внешнюю транзакцию.
  return db.transaction("rw", TX_TABLES, fn);
}

async function enqueue(type: SyncOperation["operation_type"], table: TableName, row: { id: string; version?: number }, payload: Record<string, unknown> | null) {
  const db = getDb();
  const existing = await db.sync_operations.where("[entity_type+entity_id]").equals([table, row.id]).toArray();
  let baseVersion = row.version ?? 0;
  let neverSynced = false;
  for (const op of existing) {
    // Операцию «в полёте» не трогаем: её судьбу решит ответ сервера.
    if (op.status === "in_flight") continue;
    if (op.status === "conflict") continue;
    baseVersion = Math.min(baseVersion, op.base_version);
    if (op.operation_type === "upsert" && op.base_version === 0) neverSynced = true;
    await db.sync_operations.delete(op.seq!);
  }
  const inFlight = existing.some((op) => op.status === "in_flight");
  // Запись создана и удалена до первой синхронизации — серверу о ней знать не нужно.
  if (type === "delete" && neverSynced && !inFlight && (row.version ?? 0) === 0) return;
  await db.sync_operations.add({
    id: newId(),
    operation_type: type,
    entity_type: table,
    entity_id: row.id,
    operation_payload: payload,
    base_version: baseVersion,
    status: "pending",
    retry_count: 0,
    last_error: null,
    created_at: nowIso(),
    processed_at: null,
  });
}

async function audit(action: AuditLog["action"], table: string, id: string, summary: string) {
  await getDb().audit_logs.add({ id: newId(), entity_type: table, entity_id: id, action, changed_at: nowIso(), change_summary: summary.slice(0, 500) });
}

function label(row: Record<string, unknown>): string {
  return String(row.title ?? row.name ?? row.id ?? "");
}

async function assertRules<T extends TableName>(table: T, row: Row<T>): Promise<void> {
  const db = getDb();
  if (table === "time_entries") {
    const entry = row as Row<"time_entries">;
    if (!entry.ended_at && !entry.deleted_at) {
      const active = await db.time_entries.filter((e) => !e.ended_at && !e.deleted_at && e.id !== entry.id).count();
      if (active > 0) throw new BusinessRuleError("Уже есть запущенный таймер. Остановите его, прежде чем запускать новый.");
    }
  }
  if (table === "habit_logs") {
    const log = row as Row<"habit_logs">;
    const dup = await db.habit_logs.where("[habit_id+log_date]").equals([log.habit_id, log.log_date]).first();
    if (dup && dup.id !== log.id) throw new BusinessRuleError("Запись за этот день уже существует.");
  }
  if (table === "life_balance") {
    const item = row as Row<"life_balance">;
    const dup = await db.life_balance.where("category_id").equals(item.category_id).filter((x) => x.assessment_date === item.assessment_date && x.id !== item.id).first();
    if (dup) throw new BusinessRuleError("Оценка этой сферы за выбранную дату уже существует.");
  }
  if (table === "goals" || table === "tasks" || table === "skills" || table === "categories") {
    const field = { goals: "parent_goal_id", tasks: "parent_task_id", skills: "parent_skill_id", categories: "parent_id" }[table as string]!;
    let cursor = (row as Record<string, unknown>)[field] as string | null;
    const seen = new Set<string>([row.id]);
    while (cursor) {
      if (seen.has(cursor)) throw new ValidationError({ [field]: "Обнаружена циклическая вложенность" });
      seen.add(cursor);
      const parent = (await db.table(table).get(cursor)) as Record<string, unknown> | undefined;
      cursor = (parent?.[field] as string | null) ?? null;
    }
  }
}

export interface CreateOptions {
  /** Заранее выданный id (защита от двойного сохранения одной формы). */
  id?: string;
}

/**
 * Создаёт запись. Повторный вызов с тем же id не создаёт дубль, а возвращает
 * уже сохранённую запись — так двойное нажатие «Сохранить» безопасно.
 */
export async function createRecord<T extends TableName>(table: T, input: NewRow<T>, opts: CreateOptions = {}): Promise<Row<T>> {
  const now = nowIso();
  const row = validateRow(table, { ...input, id: opts.id ?? newId(), created_at: now, updated_at: now, deleted_at: null, archived_at: null, version: 0 });
  return tx(async () => {
    const db = getDb();
    const existing = await db.rows(table).get(row.id);
    if (existing) return existing;
    await assertRules(table, row);
    await db.rows(table).add(row);
    await enqueue("upsert", table, row, row as Record<string, unknown>);
    await audit("create", table, row.id, `Создано: ${label(row as Record<string, unknown>)}`);
    return row;
  });
}

async function mutate<T extends TableName>(table: T, id: string, action: AuditLog["action"], change: (row: Row<T>) => Record<string, unknown>): Promise<Row<T>> {
  return tx(async () => {
    const db = getDb();
    const current = await db.rows(table).get(id);
    if (!current) throw new NotFoundError();
    const patch = change(current);
    const next = validateRow(table, { ...current, ...patch, id: current.id, created_at: current.created_at, version: current.version, updated_at: nowIso() });
    await assertRules(table, next);
    await db.rows(table).put(next);
    await enqueue("upsert", table, next, next as Record<string, unknown>);
    const changed = Object.keys(patch).filter((k) => JSON.stringify((current as Record<string, unknown>)[k]) !== JSON.stringify((next as Record<string, unknown>)[k]));
    await audit(action, table, id, `${label(next as Record<string, unknown>)}: ${changed.join(", ") || "без изменений"}`);
    return next;
  });
}

export function updateRecord<T extends TableName>(table: T, id: string, patch: Patch<T>): Promise<Row<T>> {
  return mutate(table, id, "update", () => patch as Record<string, unknown>);
}

export function archiveRecord<T extends TableName>(table: T, id: string): Promise<Row<T>> {
  return mutate(table, id, "archive", (row) => ({ archived_at: row.archived_at ?? nowIso() }));
}

export function unarchiveRecord<T extends TableName>(table: T, id: string): Promise<Row<T>> {
  return mutate(table, id, "unarchive", () => ({ archived_at: null }));
}

/** Перемещает запись в корзину (мягкое удаление с возможностью восстановления). */
export function trashRecord<T extends TableName>(table: T, id: string): Promise<Row<T>> {
  return mutate(table, id, "trash", (row) => ({ deleted_at: row.deleted_at ?? nowIso() }));
}

export function restoreRecord<T extends TableName>(table: T, id: string): Promise<Row<T>> {
  return mutate(table, id, "restore", () => ({ deleted_at: null }));
}

/** Окончательное удаление записи вместе с зависимыми данными. */
export async function purgeRecord<T extends TableName>(table: T, id: string): Promise<void> {
  await tx(async () => {
    const db = getDb();
    const current = await db.rows(table).get(id);
    if (!current) return;
    if (table === "accounts") {
      const used = await db.transactions.filter((t) => t.account_id === id || t.to_account_id === id).count();
      if (used > 0) throw new BusinessRuleError("По счёту есть операции. Сначала удалите их окончательно или переместите счёт в архив.");
    }
    if (table === "categories") {
      const scores = await db.life_balance.where("category_id").equals(id).toArray();
      for (const s of scores) await purgeRecord("life_balance", s.id);
    }
    for (const child of CASCADES[table] ?? []) {
      const rows = (await db.table(child.table).where(child.field).equals(id).toArray()) as { id: string }[];
      for (const r of rows) await purgeRecord(child.table, r.id);
    }
    for (const dep of NULLIFY[table] ?? []) {
      const rows = (await db.table(dep.table).filter((r: Record<string, unknown>) => r[dep.field] === id).toArray()) as { id: string }[];
      for (const r of rows) await mutate(dep.table, r.id, "update", () => ({ [dep.field]: null }));
    }
    if (table !== "entity_links") {
      const links = await db.entity_links.filter((l) => l.from_id === id || l.to_id === id).toArray();
      for (const l of links) await purgeRecord("entity_links", l.id);
    }
    await db.rows(table).delete(id);
    await enqueue("delete", table, current, null);
    await audit("delete", table, id, `Удалено окончательно: ${label(current as Record<string, unknown>)}`);
  });
}

export async function getRecord<T extends TableName>(table: T, id: string): Promise<Row<T> | undefined> {
  return getDb().rows(table).get(id);
}

export type Scope = "active" | "archived" | "trash" | "all";

export function inScope(row: { deleted_at: string | null; archived_at: string | null }, scope: Scope): boolean {
  switch (scope) {
    case "active":
      return !row.deleted_at && !row.archived_at;
    case "archived":
      return !row.deleted_at && !!row.archived_at;
    case "trash":
      return !!row.deleted_at;
    case "all":
      return true;
  }
}

export async function listRecords<T extends TableName>(table: T, scope: Scope = "active"): Promise<Row<T>[]> {
  const rows = await getDb().rows(table).toArray();
  return rows.filter((r) => inScope(r, scope));
}

export { Dexie };
