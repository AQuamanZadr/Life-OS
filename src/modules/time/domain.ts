import { splitByDay, type DateRange, type DateStr } from "@/core/lib/dates";
import type { TimeEntry } from "@/core/db/schema";

/** Продолжительность интервала в целых секундах. */
export function durationSeconds(startedAt: string, endedAt: string): number {
  const d = Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 1000);
  if (!Number.isFinite(d) || d < 0) throw new Error("Окончание не может быть раньше начала");
  return d;
}

/** Секунды записи (для идущего таймера — до текущего момента). */
export function entrySeconds(entry: Pick<TimeEntry, "started_at" | "ended_at" | "duration_seconds">, now: Date = new Date()): number {
  if (entry.ended_at) return entry.duration_seconds;
  return Math.max(0, Math.floor((now.getTime() - Date.parse(entry.started_at)) / 1000));
}

/** Пересекаются ли два интервала (касание границами пересечением не считается). */
export function overlaps(a: { started_at: string; ended_at: string | null }, b: { started_at: string; ended_at: string | null }, now: Date = new Date()): boolean {
  const aEnd = a.ended_at ? Date.parse(a.ended_at) : now.getTime();
  const bEnd = b.ended_at ? Date.parse(b.ended_at) : now.getTime();
  return Date.parse(a.started_at) < bEnd && Date.parse(b.started_at) < aEnd;
}

/**
 * Секунды по локальным датам. Запись, переходящая через полночь, делится между
 * днями, поэтому дневная, недельная и месячная статистика сходятся.
 */
export function secondsByDay(entries: TimeEntry[], timeZone: string, now: Date = new Date()): Map<DateStr, number> {
  const out = new Map<DateStr, number>();
  for (const e of entries) {
    if (e.deleted_at) continue;
    const end = e.ended_at ?? now.toISOString();
    for (const [day, sec] of splitByDay(e.started_at, end, timeZone)) out.set(day, (out.get(day) ?? 0) + sec);
  }
  return out;
}

/** Секунды за период в разрезе произвольного ключа (категория, проект). */
export function secondsByKey(entries: TimeEntry[], range: DateRange, timeZone: string, key: (e: TimeEntry) => string | null, now: Date = new Date()): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) {
    if (e.deleted_at) continue;
    const end = e.ended_at ?? now.toISOString();
    let sec = 0;
    for (const [day, s] of splitByDay(e.started_at, end, timeZone)) if (day >= range.from && day <= range.to) sec += s;
    if (sec > 0) {
      const k = key(e) ?? "";
      out.set(k, (out.get(k) ?? 0) + sec);
    }
  }
  return out;
}

export function totalSeconds(entries: TimeEntry[], range: DateRange, timeZone: string, now: Date = new Date()): number {
  let total = 0;
  for (const [day, sec] of secondsByDay(entries, timeZone, now)) if (day >= range.from && day <= range.to) total += sec;
  return total;
}
