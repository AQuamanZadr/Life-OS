import type { TableName } from "../db/schema";
import { RemoteError, type RemoteAdapter, type RemoteRow, type Tombstone } from "./remote";

/**
 * Облачное хранилище в памяти с той же семантикой, что и PostgreSQL-схема:
 * версии строк, last_op_id, tombstones, уникальные ограничения, внешние ключи.
 * Используется в тестах синхронизации, в том числе для имитации сбоев сети.
 */
export class MemoryRemote implements RemoteAdapter {
  tables = new Map<string, Map<string, RemoteRow>>();
  tombstones: Tombstone[] = [];
  /** Сеть «отключена»: любой вызов бросает сетевую ошибку. */
  offline = false;
  /** Операция применяется на сервере, но ответ теряется (n раз). */
  dropResponses = 0;
  calls = 0;
  private clock = Date.parse("2026-01-01T00:00:00Z");
  private foreignKeys: Partial<Record<TableName, { field: string; table: TableName }[]>> = {
    tasks: [{ field: "project_id", table: "projects" }, { field: "goal_id", table: "goals" }],
    goal_milestones: [{ field: "goal_id", table: "goals" }],
    habit_logs: [{ field: "habit_id", table: "habits" }],
    transactions: [{ field: "account_id", table: "accounts" }],
  };

  private t(table: string): Map<string, RemoteRow> {
    let m = this.tables.get(table);
    if (!m) this.tables.set(table, (m = new Map()));
    return m;
  }

  private stamp(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  private guard() {
    this.calls++;
    if (this.offline) throw new RemoteError("network", "Нет соединения с сервером");
  }

  private lose() {
    if (this.dropResponses > 0) {
      this.dropResponses--;
      throw new RemoteError("network", "Ответ сервера потерян");
    }
  }

  private check(table: TableName, row: Record<string, unknown>) {
    for (const fk of this.foreignKeys[table] ?? []) {
      const ref = row[fk.field] as string | null;
      if (ref && !this.t(fk.table).has(ref)) throw new RemoteError("dependency", `Нет связанной записи ${fk.table}/${ref}`);
    }
    if (table === "time_entries" && !row.ended_at && !row.deleted_at) {
      for (const other of this.t(table).values()) {
        if (other.id !== row.id && !other.ended_at && !other.deleted_at) throw new RemoteError("validation", "Уже есть активный таймер");
      }
    }
  }

  async insert(table: TableName, row: Record<string, unknown>, opId: string) {
    this.guard();
    const id = String(row.id);
    if (this.t(table).has(id)) return { ok: false as const, reason: "duplicate" as const };
    this.check(table, row);
    const stored = { ...structuredClone(row), id, version: 1, last_op_id: opId, server_updated_at: this.stamp() } as RemoteRow;
    this.t(table).set(id, stored);
    this.lose();
    return { ok: true as const, row: structuredClone(stored) };
  }

  async update(table: TableName, row: Record<string, unknown>, opId: string, baseVersion: number) {
    this.guard();
    const id = String(row.id);
    const current = this.t(table).get(id);
    if (!current || current.version !== baseVersion) return null;
    this.check(table, row);
    const stored = { ...structuredClone(row), id, version: current.version + 1, last_op_id: opId, server_updated_at: this.stamp() } as RemoteRow;
    this.t(table).set(id, stored);
    this.lose();
    return structuredClone(stored);
  }

  async get(table: TableName, id: string) {
    this.guard();
    const row = this.t(table).get(id);
    return row ? structuredClone(row) : null;
  }

  async remove(table: TableName, id: string) {
    this.guard();
    if (this.t(table).delete(id)) this.tombstones.push({ entity_type: table, entity_id: id, deleted_at: this.stamp() });
    this.lose();
  }

  async listChanged(table: TableName, since: string | null, limit: number, offset: number) {
    this.guard();
    return [...this.t(table).values()]
      .filter((r) => !since || r.server_updated_at > since)
      .sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at) || a.id.localeCompare(b.id))
      .slice(offset, offset + limit)
      .map((r) => structuredClone(r));
  }

  async listTombstones(since: string | null) {
    this.guard();
    return this.tombstones.filter((t) => !since || t.deleted_at > since);
  }

  /** Изменение «с другого устройства» напрямую на сервере. */
  serverEdit(table: TableName, id: string, patch: Record<string, unknown>) {
    const current = this.t(table).get(id);
    if (!current) throw new Error("нет строки");
    this.t(table).set(id, { ...current, ...patch, version: current.version + 1, last_op_id: null, server_updated_at: this.stamp() });
  }

  rows(table: TableName): RemoteRow[] {
    return [...this.t(table).values()];
  }
}
