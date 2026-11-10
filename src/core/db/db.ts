import Dexie, { type Table } from "dexie";
import type { Row, TableName } from "./schema";

/** Операция в очереди синхронизации (outbox). */
export interface SyncOperation {
  /** Порядок применения. */
  seq?: number;
  /** Уникальный id операции — основа идемпотентности на сервере. */
  id: string;
  operation_type: "upsert" | "delete";
  entity_type: TableName;
  entity_id: string;
  /** Полный снимок записи после изменения (для delete — null). */
  operation_payload: Record<string, unknown> | null;
  /** Версия сервера, на которой основано изменение (0 — запись ещё не была на сервере). */
  base_version: number;
  status: "pending" | "in_flight" | "failed" | "conflict";
  retry_count: number;
  last_error: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface SyncConflict {
  id: string;
  op_id: string;
  entity_type: TableName;
  entity_id: string;
  local: Record<string, unknown> | null;
  remote: Record<string, unknown> | null;
  detected_at: string;
}

export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: "create" | "update" | "archive" | "unarchive" | "trash" | "restore" | "delete" | "import" | "sync";
  changed_at: string;
  change_summary: string;
}

export interface BackupRecord {
  id: string;
  created_at: string;
  kind: "manual" | "auto" | "restore";
  encrypted: boolean;
  records: number;
  checksum: string;
  /** Для автоматических копий — содержимое файла (хранится локально). */
  content?: string;
}

export interface ErrorLog {
  id: string;
  occurred_at: string;
  source: string;
  message: string;
  stack: string | null;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

const DATA_STORES: Record<TableName, string> = {
  categories: "id, type, parent_id",
  goals: "id, status, category_id, parent_goal_id, deadline",
  goal_milestones: "id, goal_id",
  habits: "id, is_active",
  habit_logs: "id, &[habit_id+log_date], habit_id, log_date",
  tasks: "id, status, project_id, goal_id, parent_task_id, due_date",
  projects: "id, status, goal_id",
  courses: "id, status",
  course_lessons: "id, course_id",
  books: "id, status",
  skills: "id, parent_skill_id",
  time_entries: "id, started_at, project_id, task_id, category_id",
  accounts: "id",
  transactions: "id, account_id, to_account_id, transaction_date, category_id",
  budgets: "id, category_id",
  health_records: "id, metric_type, recorded_at",
  custom_metrics: "id",
  notes: "id, category_id",
  tags: "id",
  journal_entries: "id, entry_date",
  life_balance: "id, category_id, assessment_date",
  events: "id, start_date",
  entity_links: "id, [from_type+from_id], [to_type+to_id]",
  saved_filters: "id, module",
  user_settings: "id",
};

type DataTables = { [K in TableName]: Table<Row<K>, string> };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface LifeOsDb extends DataTables {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class LifeOsDb extends Dexie {
  sync_operations!: Table<SyncOperation, number>;
  sync_conflicts!: Table<SyncConflict, string>;
  audit_logs!: Table<AuditLog, string>;
  backup_history!: Table<BackupRecord, string>;
  error_logs!: Table<ErrorLog, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = "life-os") {
    super(name);
    // Версии схемы только добавляются: изменение существующей версии запрещено,
    // чтобы обновление приложения не приводило к потере локальных данных.
    this.version(1).stores({
      ...DATA_STORES,
      sync_operations: "++seq, &id, status, [entity_type+entity_id]",
      sync_conflicts: "id, op_id, [entity_type+entity_id]",
      audit_logs: "id, changed_at, [entity_type+entity_id]",
      backup_history: "id, created_at",
      error_logs: "id, occurred_at",
      meta: "key",
    });
  }

  rows<T extends TableName>(table: T): Table<Row<T>, string> {
    return this.table(table) as Table<Row<T>, string>;
  }
}

let instance: LifeOsDb | null = null;

export function getDb(): LifeOsDb {
  if (!instance) instance = new LifeOsDb();
  return instance;
}

/** Только для тестов: подменяет экземпляр базы. */
export function setDb(db: LifeOsDb | null): void {
  instance = db;
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await getDb().meta.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await getDb().meta.put({ key, value });
}
