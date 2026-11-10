// Преобразование записей между локальным (camelCase) и облачным (snake_case) видом.

const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

// Служебные столбцы облака, которых нет в локальных записях.
const remoteOnly = new Set(["user_id", "server_updated_at"]);

export function toRemote(row: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [toSnake(key), value]),
  );
}

export function fromRemote(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (remoteOnly.has(key)) continue;
    // Postgres отдаёт время как 2026-01-01T10:00:00.123456+00:00 — приводим к ISO UTC.
    result[toCamel(key)] =
      key.endsWith("_at") && typeof value === "string"
        ? new Date(value).toISOString()
        : value;
  }
  return result;
}
