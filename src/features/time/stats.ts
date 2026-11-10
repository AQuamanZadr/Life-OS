import { toDateKey } from "@/lib/dates";
import type { TimeEntry } from "./schema";

// Длительность записи; для идущего таймера — до момента `now`.
export function durationMs(entry: TimeEntry, now: number): number {
  const end = entry.endedAt ? Date.parse(entry.endedAt) : now;
  return Math.max(0, end - Date.parse(entry.startedAt));
}

// День записи — местная дата её начала (запись целиком относится к этому дню).
export function dayOf(entry: TimeEntry): string {
  return toDateKey(new Date(entry.startedAt));
}

export function totalMs(entries: TimeEntry[], now: number): number {
  return entries.reduce((sum, e) => sum + durationMs(e, now), 0);
}

export function totalsByDay(
  entries: TimeEntry[],
  days: string[],
  now: number,
): { day: string; ms: number }[] {
  const sums = new Map<string, number>();
  for (const e of entries) {
    const day = dayOf(e);
    sums.set(day, (sums.get(day) ?? 0) + durationMs(e, now));
  }
  return days.map((day) => ({ day, ms: sums.get(day) ?? 0 }));
}

// Сколько времени записано по каждой задаче (только завершённые записи).
export function msByTask(entries: TimeEntry[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const e of entries) {
    if (!e.taskId || !e.endedAt) continue;
    result.set(e.taskId, (result.get(e.taskId) ?? 0) + durationMs(e, 0));
  }
  return result;
}

// 5400000 → "1 ч 30 мин"
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${String(m).padStart(2, "0")} мин`;
}

// 3725000 → "1:02:05"
export function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

// Местные дата, время начала и длительность → моменты начала и конца в UTC.
export function toRange(
  date: string,
  time: string,
  minutes: number,
): { startedAt: string; endedAt: string } | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t || !Number.isFinite(minutes)) return null;
  const start = new Date(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  if (Number.isNaN(start.getTime())) return null;
  return {
    startedAt: start.toISOString(),
    endedAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
  };
}

export function localTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
