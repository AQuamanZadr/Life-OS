import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { schemas, SETTINGS_ID, type TableName } from "../db/schema";
import { RemoteError, type RemoteAdapter, type RemoteRow, type Tombstone } from "./remote";

let client: SupabaseClient | null | undefined;

export function isCloudConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

/** Клиент Supabase. В браузер попадает только публичный anon-ключ; доступ ограничивает RLS. */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  client = isCloudConfigured()
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null;
  return client;
}

/** Денежные колонки читаются как текст, чтобы NUMERIC не превращался в число с плавающей точкой. */
const MONEY_COLUMNS: Partial<Record<TableName, string[]>> = {
  accounts: ["opening_balance", "target_amount"],
  transactions: ["amount", "to_amount"],
  budgets: ["amount"],
};

const SERVER_COLUMNS = ["last_op_id", "server_updated_at"];

function selectList(table: TableName): string {
  const money = new Set(MONEY_COLUMNS[table] ?? []);
  const cols = [...Object.keys(schemas[table].shape), ...SERVER_COLUMNS];
  return cols.map((c) => (money.has(c) ? `${c}:${c}::text` : c)).join(",");
}

interface PgError {
  code?: string;
  message: string;
  details?: string | null;
}

function toRemoteError(error: PgError, status?: number): RemoteError {
  const code = error.code ?? "";
  const msg = error.message || "Ошибка сервера";
  if (!code && /fetch|network|load failed/i.test(msg)) return new RemoteError("network", "Нет соединения с сервером");
  if (status === 401 || code === "PGRST301" || code === "PGRST303" || /jwt/i.test(msg)) return new RemoteError("auth", "Сессия истекла: войдите заново");
  if (code === "23503") return new RemoteError("dependency", msg);
  if (code.startsWith("22") || code.startsWith("23") || code === "42501" || code === "P0001") return new RemoteError("validation", msg);
  if (status !== undefined && status >= 500) return new RemoteError("network", "Сервер временно недоступен");
  return new RemoteError("unknown", msg);
}

export class SupabaseRemote implements RemoteAdapter {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly userId: string,
  ) {}

  private remoteId(table: TableName, id: string): string {
    return table === "user_settings" ? this.userId : id;
  }

  private outgoing(table: TableName, row: Record<string, unknown>, opId: string): Record<string, unknown> {
    // version и user_id выставляет сервер; клиент не может их подделать.
    const { version: _v, user_id: _u, ...rest } = row;
    void _v;
    void _u;
    return { ...rest, id: this.remoteId(table, String(row.id)), last_op_id: opId };
  }

  private incoming(table: TableName, row: Record<string, unknown>): RemoteRow {
    return (table === "user_settings" ? { ...row, id: SETTINGS_ID } : row) as RemoteRow;
  }

  async insert(table: TableName, row: Record<string, unknown>, opId: string) {
    const { data, error, status } = await this.supabase.from(table).insert(this.outgoing(table, row, opId)).select(selectList(table)).single();
    if (error) {
      if (error.code === "23505" && /_pkey/.test(`${error.message} ${error.details ?? ""}`)) return { ok: false as const, reason: "duplicate" as const };
      throw toRemoteError(error, status);
    }
    return { ok: true as const, row: this.incoming(table, data as unknown as Record<string, unknown>) };
  }

  async update(table: TableName, row: Record<string, unknown>, opId: string, baseVersion: number) {
    const { data, error, status } = await this.supabase
      .from(table)
      .update(this.outgoing(table, row, opId))
      .eq("id", this.remoteId(table, String(row.id)))
      .eq("version", baseVersion)
      .select(selectList(table));
    if (error) throw toRemoteError(error, status);
    const rows = data as unknown as Record<string, unknown>[];
    return rows.length ? this.incoming(table, rows[0]) : null;
  }

  async get(table: TableName, id: string) {
    const { data, error, status } = await this.supabase.from(table).select(selectList(table)).eq("id", this.remoteId(table, id)).maybeSingle();
    if (error) throw toRemoteError(error, status);
    return data ? this.incoming(table, data as unknown as Record<string, unknown>) : null;
  }

  async remove(table: TableName, id: string) {
    const { error, status } = await this.supabase.from(table).delete().eq("id", this.remoteId(table, id));
    if (error) throw toRemoteError(error, status);
  }

  async listChanged(table: TableName, since: string | null, limit: number, offset: number) {
    let q = this.supabase.from(table).select(selectList(table)).order("server_updated_at", { ascending: true }).order("id", { ascending: true }).range(offset, offset + limit - 1);
    if (since) q = q.gt("server_updated_at", since);
    const { data, error, status } = await q;
    if (error) throw toRemoteError(error, status);
    return (data as unknown as Record<string, unknown>[]).map((r) => this.incoming(table, r));
  }

  async listTombstones(since: string | null): Promise<Tombstone[]> {
    let q = this.supabase.from("tombstones").select("entity_type,entity_id,deleted_at").order("deleted_at", { ascending: true }).limit(5000);
    if (since) q = q.gt("deleted_at", since);
    const { data, error, status } = await q;
    if (error) throw toRemoteError(error, status);
    return (data ?? []) as Tombstone[];
  }
}
