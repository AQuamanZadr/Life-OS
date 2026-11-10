/**
 * Работа с датами.
 *
 * Правила:
 *  - моменты времени хранятся как ISO-строки в UTC;
 *  - «календарные» даты (дедлайн, дата привычки, дата операции) хранятся как
 *    строки YYYY-MM-DD и не зависят от часового пояса и перехода на летнее время;
 *  - арифметика календарных дат выполняется в UTC, поэтому переход на летнее
 *    время не может «съесть» или продублировать день.
 */

export type DateStr = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isValidDateStr(value: unknown): value is DateStr {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2200) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function toUtcMs(date: DateStr): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Некорректная дата: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtcMs(ms: number): DateStr {
  const d = new Date(ms);
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export function parts(date: DateStr): { year: number; month: number; day: number } {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Некорректная дата: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function makeDate(year: number, month: number, day: number): DateStr {
  return fromUtcMs(Date.UTC(year, month - 1, day));
}

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(instant: Date | string | number, timeZone: string = localTimeZone()): ZonedParts {
  const d = instant instanceof Date ? instant : new Date(instant);
  const out: Record<string, number> = {};
  for (const p of zonedFormatter(timeZone).formatToParts(d)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour, minute: out.minute, second: out.second };
}

/** Календарная дата момента времени в указанном часовом поясе. */
export function toDateStr(instant: Date | string | number, timeZone: string = localTimeZone()): DateStr {
  const p = zonedParts(instant, timeZone);
  return makeDate(p.year, p.month, p.day);
}

export function todayStr(timeZone: string = localTimeZone(), now: Date = new Date()): DateStr {
  return toDateStr(now, timeZone);
}

/** Смещение часового пояса (мс) относительно UTC в данный момент. */
export function tzOffsetMs(instantMs: number, timeZone: string): number {
  const p = zonedParts(instantMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * Момент UTC, соответствующий локальным дате и времени в часовом поясе.
 * Несуществующее время (весенний переход) сдвигается вперёд, для
 * повторяющегося (осенний переход) берётся первое вхождение.
 */
export function zonedToUtc(date: DateStr, time: string = "00:00", timeZone: string = localTimeZone()): Date {
  const [h, mi] = time.split(":").map(Number);
  const wall = toUtcMs(date) + (h || 0) * 3_600_000 + (mi || 0) * 60_000;
  const o1 = tzOffsetMs(wall, timeZone);
  let guess = wall - o1;
  const o2 = tzOffsetMs(guess, timeZone);
  if (o2 !== o1) {
    guess = wall - o2;
    // Несуществующее локальное время: берём момент сразу после перехода.
    if (tzOffsetMs(guess, timeZone) !== o2) guess = wall - Math.min(o1, o2);
  } else {
    // Повторяющееся локальное время: предпочитаем более раннее вхождение.
    const earlier = wall - tzOffsetMs(guess - 3_600_000, timeZone);
    if (earlier < guess && tzOffsetMs(earlier, timeZone) === wall - earlier) guess = earlier;
  }
  return new Date(guess);
}

export function addDays(date: DateStr, days: number): DateStr {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Прибавляет месяцы; день «прижимается» к концу месяца (31 янв + 1 мес = 28/29 фев). */
export function addMonths(date: DateStr, months: number): DateStr {
  const { year, month, day } = parts(date);
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return makeDate(y, m, Math.min(day, daysInMonth(y, m)));
}

export function addYears(date: DateStr, years: number): DateStr {
  return addMonths(date, years * 12);
}

/** Количество дней от a до b (b - a). */
export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

/** День недели ISO: 1 — понедельник … 7 — воскресенье. */
export function isoWeekday(date: DateStr): number {
  const d = new Date(toUtcMs(date)).getUTCDay();
  return d === 0 ? 7 : d;
}

export type WeekStart = 1 | 7;

export function startOfWeek(date: DateStr, weekStart: WeekStart = 1): DateStr {
  const wd = isoWeekday(date);
  const back = weekStart === 1 ? wd - 1 : wd % 7;
  return addDays(date, -back);
}

export function startOfMonth(date: DateStr): DateStr {
  const { year, month } = parts(date);
  return makeDate(year, month, 1);
}

export function endOfMonth(date: DateStr): DateStr {
  const { year, month } = parts(date);
  return makeDate(year, month, daysInMonth(year, month));
}

export function startOfQuarter(date: DateStr): DateStr {
  const { year, month } = parts(date);
  return makeDate(year, Math.floor((month - 1) / 3) * 3 + 1, 1);
}

export function startOfYear(date: DateStr): DateStr {
  return makeDate(parts(date).year, 1, 1);
}

export function endOfYear(date: DateStr): DateStr {
  return makeDate(parts(date).year, 12, 31);
}

export function eachDay(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = [];
  const n = diffDays(from, to);
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

export interface DateRange {
  from: DateStr;
  to: DateStr;
}

export type PeriodType = "day" | "week" | "month" | "quarter" | "year";

/** Границы периода (включительно), содержащего дату. */
export function periodRange(type: PeriodType, anchor: DateStr, weekStart: WeekStart = 1): DateRange {
  switch (type) {
    case "day":
      return { from: anchor, to: anchor };
    case "week": {
      const from = startOfWeek(anchor, weekStart);
      return { from, to: addDays(from, 6) };
    }
    case "month":
      return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    case "quarter": {
      const from = startOfQuarter(anchor);
      return { from, to: endOfMonth(addMonths(from, 2)) };
    }
    case "year":
      return { from: startOfYear(anchor), to: endOfYear(anchor) };
  }
}

/** Сдвиг периода на n шагов (для сравнения периодов и навигации). */
export function shiftPeriod(type: PeriodType, anchor: DateStr, steps: number): DateStr {
  switch (type) {
    case "day":
      return addDays(anchor, steps);
    case "week":
      return addDays(anchor, steps * 7);
    case "month":
      return addMonths(anchor, steps);
    case "quarter":
      return addMonths(anchor, steps * 3);
    case "year":
      return addYears(anchor, steps);
  }
}

/** Предыдущий диапазон той же длины (для произвольных периодов). */
export function previousRange(range: DateRange): DateRange {
  const len = diffDays(range.from, range.to) + 1;
  return { from: addDays(range.from, -len), to: addDays(range.from, -1) };
}

export function inRange(date: DateStr | null | undefined, range: DateRange): boolean {
  return !!date && date >= range.from && date <= range.to;
}

/**
 * Делит интервал времени по локальным суткам: возвращает секунды на каждую дату.
 * Корректно обрабатывает сутки длиной 23 и 25 часов.
 */
export function splitByDay(startIso: string, endIso: string, timeZone: string = localTimeZone()): Map<DateStr, number> {
  const out = new Map<DateStr, number>();
  let cursor = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!(end > cursor)) return out;
  let guard = 0;
  while (cursor < end && guard++ < 4000) {
    const day = toDateStr(cursor, timeZone);
    const nextMidnight = zonedToUtc(addDays(day, 1), "00:00", timeZone).getTime();
    const sliceEnd = Math.min(end, nextMidnight > cursor ? nextMidnight : cursor + DAY_MS);
    out.set(day, (out.get(day) ?? 0) + Math.round((sliceEnd - cursor) / 1000));
    cursor = sliceEnd;
  }
  return out;
}

const MONTHS_RU = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTHS_GEN_RU = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WEEKDAYS_SHORT_RU = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const WEEKDAYS_RU = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];

export function monthName(month: number): string {
  return MONTHS_RU[month - 1];
}

export function weekdayShort(iso: number): string {
  return WEEKDAYS_SHORT_RU[iso - 1];
}

export function weekdayName(iso: number): string {
  return WEEKDAYS_RU[iso - 1];
}

export function formatDate(date: DateStr | null | undefined, opts: { year?: boolean; weekday?: boolean } = {}): string {
  if (!date || !isValidDateStr(date)) return "—";
  const { year, month, day } = parts(date);
  let s = `${day} ${MONTHS_GEN_RU[month - 1]}`;
  if (opts.year !== false) s += ` ${year}`;
  if (opts.weekday) s = `${WEEKDAYS_RU[isoWeekday(date) - 1]}, ${s}`;
  return s;
}

export function formatDateShort(date: DateStr | null | undefined): string {
  if (!date || !isValidDateStr(date)) return "—";
  const { year, month, day } = parts(date);
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
}

export function formatDateTime(iso: string | null | undefined, timeZone: string = localTimeZone()): string {
  if (!iso) return "—";
  const p = zonedParts(iso, timeZone);
  return `${formatDateShort(makeDate(p.year, p.month, p.day))} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function formatTime(iso: string | null | undefined, timeZone: string = localTimeZone()): string {
  if (!iso) return "—";
  const p = zonedParts(iso, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function formatRange(range: DateRange): string {
  return range.from === range.to ? formatDate(range.from) : `${formatDateShort(range.from)} — ${formatDateShort(range.to)}`;
}

/** Продолжительность в секундах → «1 ч 05 мин». */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0 && m === 0) return s === 0 ? "0 мин" : `${s} с`;
  if (h === 0) return `${m} мин`;
  return `${h} ч ${String(m).padStart(2, "0")} мин`;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
