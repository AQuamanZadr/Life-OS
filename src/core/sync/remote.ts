import type { TableName } from "../db/schema";

/** Строка в облачной базе: данные сущности + служебные поля сервера. */
export interface RemoteRow extends Record<string, unknown> {
  id: string;
  version: number;
  /** id последней применённой операции — для идемпотентной повторной отправки. */
  last_op_id: string | null;
  /** Серверное время изменения — курсор для загрузки изменений. */
  server_updated_at: string;
}

export interface Tombstone {
  entity_type: string;
  entity_id: string;
  deleted_at: string;
}

export type RemoteErrorKind = "network" | "auth" | "dependency" | "validation" | "unknown";

export class RemoteError extends Error {
  kind: RemoteErrorKind;
  constructor(kind: RemoteErrorKind, message: string) {
    super(message);
    this.name = "RemoteError";
    this.kind = kind;
  }
}

/**
 * Интерфейс облачного хранилища. Движок синхронизации зависит только от него,
 * поэтому покрыт тестами без реального сервера.
 */
export interface RemoteAdapter {
  /** Вставка новой строки. `duplicate` — строка с таким id уже существует. */
  insert(table: TableName, row: Record<string, unknown>, opId: string): Promise<{ ok: true; row: RemoteRow } | { ok: false; reason: "duplicate" }>;
  /** Обновление, только если версия на сервере равна baseVersion. null — версия не совпала или строки нет. */
  update(table: TableName, row: Record<string, unknown>, opId: string, baseVersion: number): Promise<RemoteRow | null>;
  get(table: TableName, id: string): Promise<RemoteRow | null>;
  /** Идемпотентное удаление. */
  remove(table: TableName, id: string): Promise<void>;
  /** Строки, изменённые после курсора, по возрастанию (server_updated_at, id). */
  listChanged(table: TableName, since: string | null, limit: number, offset: number): Promise<RemoteRow[]>;
  listTombstones(since: string | null): Promise<Tombstone[]>;
}
