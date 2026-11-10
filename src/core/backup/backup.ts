/**
 * Резервные копии: экспорт всей базы в JSON, шифрование, проверка целостности,
 * восстановление и тестовое восстановление во временную базу.
 */
import { getDb, LifeOsDb, setDb, type AuditLog, type BackupRecord } from "../db/db";
import { schemas, TABLE_NAMES, type TableName } from "../db/schema";
import { decryptText, encryptText, sha256Hex, type EncryptedEnvelope } from "../lib/crypto";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/dates";
import { sameContent } from "../sync/engine";

export const BACKUP_FORMAT = "life-os-backup";
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  created_at: string;
  app_version: string;
  /** SHA-256 канонического JSON поля tables. */
  checksum: string;
  counts: Record<string, number>;
  tables: Record<string, Record<string, unknown>[]>;
  audit_logs: AuditLog[];
}

function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

export async function tablesChecksum(tables: BackupFile["tables"]): Promise<string> {
  const sorted: Record<string, unknown> = {};
  for (const name of Object.keys(tables).sort()) {
    sorted[name] = [...tables[name]].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }
  return sha256Hex(canonical(sorted));
}

/** Собирает полную копию данных (включая архив и корзину). */
export async function buildBackup(): Promise<BackupFile> {
  const db = getDb();
  const tables: BackupFile["tables"] = {};
  const counts: Record<string, number> = {};
  await db.transaction("r", [...TABLE_NAMES, "audit_logs"], async () => {
    for (const name of TABLE_NAMES) {
      tables[name] = (await db.table(name).toArray()) as Record<string, unknown>[];
      counts[name] = tables[name].length;
    }
  });
  const audit_logs = await db.audit_logs.orderBy("changed_at").reverse().limit(5000).toArray();
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, created_at: nowIso(), app_version: "0.1.0", checksum: await tablesChecksum(tables), counts, tables, audit_logs };
}

/** Сериализует копию; при наличии пароля — шифрует (AES-256-GCM). */
export async function serializeBackup(backup: BackupFile, password?: string): Promise<string> {
  const json = JSON.stringify(backup);
  if (!password) return json;
  return JSON.stringify(await encryptText(json, password));
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

export function isEncryptedBackup(text: string): boolean {
  try {
    return (JSON.parse(text) as { format?: string }).format === "life-os-encrypted";
  } catch {
    return false;
  }
}

export interface VerifyReport {
  ok: boolean;
  encrypted: boolean;
  created_at: string | null;
  total: number;
  counts: Record<string, number>;
  errors: string[];
  backup: BackupFile | null;
}

/** Проверяет целостность копии: формат, контрольную сумму и каждую запись по схеме. */
export async function verifyBackup(text: string, password?: string): Promise<VerifyReport> {
  const report: VerifyReport = { ok: false, encrypted: false, created_at: null, total: 0, counts: {}, errors: [], backup: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    report.errors.push("Файл не является корректным JSON");
    return report;
  }
  if ((parsed as { format?: string })?.format === "life-os-encrypted") {
    report.encrypted = true;
    if (!password) {
      report.errors.push("Копия зашифрована: введите пароль");
      return report;
    }
    try {
      parsed = JSON.parse(await decryptText(parsed as EncryptedEnvelope, password));
    } catch (e) {
      report.errors.push(e instanceof Error ? e.message : "Не удалось расшифровать");
      return report;
    }
  }
  const backup = parsed as BackupFile;
  if (!backup || backup.format !== BACKUP_FORMAT || typeof backup.tables !== "object" || backup.tables === null) {
    report.errors.push("Это не резервная копия Life OS");
    return report;
  }
  if (backup.version > BACKUP_VERSION) {
    report.errors.push("Копия создана более новой версией приложения");
    return report;
  }
  report.created_at = backup.created_at ?? null;
  const actual = await tablesChecksum(backup.tables);
  if (actual !== backup.checksum) report.errors.push("Контрольная сумма не совпадает: файл повреждён или изменён");
  for (const name of Object.keys(backup.tables)) {
    if (!TABLE_NAMES.includes(name as TableName)) {
      report.errors.push(`Неизвестная таблица: ${name}`);
      continue;
    }
    const rows = backup.tables[name];
    if (!Array.isArray(rows)) {
      report.errors.push(`Таблица ${name} повреждена`);
      continue;
    }
    report.counts[name] = rows.length;
    report.total += rows.length;
    const seen = new Set<string>();
    for (const row of rows) {
      const res = schemas[name as TableName].safeParse(row);
      if (!res.success) {
        if (report.errors.length < 20) report.errors.push(`${name}/${String((row as { id?: string })?.id)}: ${res.error.issues[0]?.message}`);
        continue;
      }
      if (seen.has(res.data.id)) report.errors.push(`${name}: повторяющийся id ${res.data.id}`);
      seen.add(res.data.id);
    }
  }
  report.ok = report.errors.length === 0;
  report.backup = report.ok ? backup : null;
  return report;
}

export interface RestoreResult {
  created: number;
  updated: number;
  removed: number;
  unchanged: number;
}

/**
 * Восстанавливает данные из проверенной копии.
 *  - replace: состояние базы становится таким же, как в копии;
 *  - merge: записи копии добавляются и обновляют существующие, лишнее не удаляется.
 * Все изменения попадают в очередь синхронизации, поэтому облако придёт
 * к тому же состоянию без дублей.
 */
export async function restoreBackup(backup: BackupFile, mode: "replace" | "merge"): Promise<RestoreResult> {
  const db = getDb();
  const result: RestoreResult = { created: 0, updated: 0, removed: 0, unchanged: 0 };
  const now = nowIso();
  await db.transaction("rw", [...TABLE_NAMES, "sync_operations", "sync_conflicts", "audit_logs"], async () => {
    const queue = async (table: TableName, id: string, type: "upsert" | "delete", payload: Record<string, unknown> | null, baseVersion: number) => {
      await db.sync_operations.where("[entity_type+entity_id]").equals([table, id]).delete();
      await db.sync_conflicts.where("[entity_type+entity_id]").equals([table, id]).delete();
      await db.sync_operations.add({ id: newId(), operation_type: type, entity_type: table, entity_id: id, operation_payload: payload, base_version: baseVersion, status: "pending", retry_count: 0, last_error: null, created_at: now, processed_at: null });
    };
    for (const table of TABLE_NAMES) {
      const incoming = (backup.tables[table] ?? []).map((r) => schemas[table].parse(r));
      const existing = new Map(((await db.table(table).toArray()) as { id: string; version: number }[]).map((r) => [r.id, r]));
      const keep = new Set<string>();
      for (const row of incoming) {
        keep.add(row.id);
        const local = existing.get(row.id);
        if (local && sameContent(local as Record<string, unknown>, row as Record<string, unknown>)) {
          result.unchanged++;
          continue;
        }
        // Версия берётся из текущей локальной записи: именно её знает сервер.
        const next = { ...row, version: local?.version ?? 0, updated_at: now };
        await db.table(table).put(next);
        await queue(table, row.id, "upsert", next, next.version);
        if (local) result.updated++;
        else result.created++;
      }
      if (mode === "replace") {
        for (const [id, local] of existing) {
          if (keep.has(id)) continue;
          await db.table(table).delete(id);
          await queue(table, id, "delete", null, local.version);
          result.removed++;
        }
      }
    }
    await db.audit_logs.add({ id: newId(), entity_type: "backup", entity_id: backup.checksum.slice(0, 36), action: "import", changed_at: now, change_summary: `Восстановление (${mode}): +${result.created}, ~${result.updated}, −${result.removed}` });
  });
  return result;
}

/**
 * Тестовое восстановление: копия разворачивается во временную базу, после чего
 * её содержимое сверяется с контрольной суммой. Рабочие данные не затрагиваются.
 */
export async function testRestore(backup: BackupFile): Promise<{ ok: boolean; records: number; message: string }> {
  const name = `life-os-restore-test-${Date.now()}`;
  const temp = new LifeOsDb(name);
  const original = getDb();
  try {
    await temp.open();
    setDb(temp);
    const res = await restoreBackup(backup, "replace");
    const roundTrip = await buildBackup();
    // updated_at и version при восстановлении обновляются — сверяем содержимое записей.
    let mismatches = 0;
    for (const table of TABLE_NAMES) {
      const restored = new Map(roundTrip.tables[table].map((r) => [String(r.id), r]));
      for (const row of backup.tables[table] ?? []) {
        const got = restored.get(String(row.id));
        if (!got || !sameContent(schemas[table].parse(row) as Record<string, unknown>, got)) mismatches++;
      }
      if ((backup.tables[table] ?? []).length !== roundTrip.tables[table].length) mismatches++;
    }
    return mismatches === 0
      ? { ok: true, records: res.created, message: `Восстановлено и сверено записей: ${res.created}` }
      : { ok: false, records: res.created, message: `Расхождений после восстановления: ${mismatches}` };
  } catch (e) {
    return { ok: false, records: 0, message: e instanceof Error ? e.message : String(e) };
  } finally {
    setDb(original);
    temp.close();
    await LifeOsDb.delete(name);
  }
}

export async function recordBackup(kind: BackupRecord["kind"], backup: BackupFile, encrypted: boolean, content?: string): Promise<void> {
  const total = Object.values(backup.counts).reduce((a, b) => a + b, 0);
  await getDb().backup_history.add({ id: newId(), created_at: nowIso(), kind, encrypted, records: total, checksum: backup.checksum, content });
}

const AUTO_KEEP = 5;
const AUTO_INTERVAL_MS = 24 * 3600 * 1000;

/** Автоматическая локальная копия раз в сутки; хранятся последние 5. */
export async function runAutoBackup(force = false): Promise<boolean> {
  const db = getDb();
  const autos = (await db.backup_history.orderBy("created_at").toArray()).filter((b) => b.kind === "auto");
  const last = autos[autos.length - 1];
  if (!force && last && Date.now() - Date.parse(last.created_at) < AUTO_INTERVAL_MS) return false;
  const backup = await buildBackup();
  if (Object.values(backup.counts).reduce((a, b) => a + b, 0) === 0) return false;
  if (!force && last && last.checksum === backup.checksum) return false;
  await recordBackup("auto", backup, false, JSON.stringify(backup));
  const stale = autos.slice(0, Math.max(0, autos.length + 1 - AUTO_KEEP));
  await db.backup_history.bulkDelete(stale.map((b) => b.id));
  return true;
}

/** CSV с экранированием и защитой от формул в табличных редакторах. */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? Array.from(rows.reduce((s, r) => (Object.keys(r).forEach((k) => s.add(k)), s), new Set<string>()));
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    let s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}

export function downloadFile(name: string, content: string | Blob, mime = "application/json"): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
