import { schemas, type Row, type TableName } from "@/core/db/schema";
import { newId } from "@/core/lib/ids";

/** Собирает валидную запись для тестов доменной логики (без обращения к базе). */
export function make<T extends TableName>(table: T, data: Record<string, unknown>): Row<T> {
  const now = "2026-01-01T00:00:00.000Z";
  return schemas[table].parse({ id: newId(), created_at: now, updated_at: now, ...data }) as Row<T>;
}
