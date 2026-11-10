// Календарные даты хранятся строкой YYYY-MM-DD в местном времени пользователя,
// моменты времени — в ISO 8601 (UTC).

export function toDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isValidDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
  );
}

export function formatDateKey(value: string, today: string): string {
  const [y, m, d] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: value.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
  }).format(new Date(y, m - 1, d));
}

export function parseDateKey(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(value: string, days: number): string {
  const date = parseDateKey(value);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

// День недели по ISO: 1 — понедельник, 7 — воскресенье.
export function isoWeekday(value: string): number {
  return parseDateKey(value).getDay() || 7;
}
