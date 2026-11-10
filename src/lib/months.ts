// Месяц — строка YYYY-MM.

export function monthOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function formatMonth(month: string, style: "long" | "short" = "long"): string {
  const [y, m] = month.split("-").map(Number);
  const text = new Intl.DateTimeFormat(
    "ru-RU",
    style === "long" ? { month: "long", year: "numeric" } : { month: "short" },
  ).format(new Date(y, m - 1, 1));
  return (text.charAt(0).toUpperCase() + text.slice(1)).replace(/\s+г\.$/, "").replace(/\.$/, "");
}
