import { addDays, addMonths, diffDays, isoWeekday, isValidDateStr, type DateStr } from "./dates";

export interface RecurrenceRule {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  /** Каждые N периодов (по умолчанию 1). */
  interval: number;
  /** Для weekly: дни недели ISO (1–7). Если не заданы — день недели якорной даты. */
  weekdays?: number[];
}

export function isValidRule(rule: unknown): rule is RecurrenceRule {
  if (!rule || typeof rule !== "object") return false;
  const r = rule as RecurrenceRule;
  if (!["daily", "weekly", "monthly", "yearly"].includes(r.freq)) return false;
  if (!Number.isInteger(r.interval) || r.interval < 1 || r.interval > 365) return false;
  if (r.weekdays !== undefined) {
    if (!Array.isArray(r.weekdays) || r.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return false;
  }
  return true;
}

/** Является ли дата вхождением правила с данной якорной датой. */
export function occursOn(rule: RecurrenceRule, anchor: DateStr, date: DateStr): boolean {
  if (date < anchor) return false;
  const interval = Math.max(1, rule.interval);
  switch (rule.freq) {
    case "daily":
      return diffDays(anchor, date) % interval === 0;
    case "weekly": {
      const days = rule.weekdays?.length ? rule.weekdays : [isoWeekday(anchor)];
      if (!days.includes(isoWeekday(date))) return false;
      const anchorMonday = addDays(anchor, 1 - isoWeekday(anchor));
      const dateMonday = addDays(date, 1 - isoWeekday(date));
      return (diffDays(anchorMonday, dateMonday) / 7) % interval === 0;
    }
    case "monthly":
    case "yearly": {
      const step = rule.freq === "monthly" ? interval : interval * 12;
      // Вхождения считаются от якоря, чтобы 31-е число не «сползало» к 28-му навсегда.
      for (let k = 0; k < 2400; k++) {
        const occ = addMonths(anchor, k * step);
        if (occ === date) return true;
        if (occ > date) return false;
      }
      return false;
    }
  }
}

/** Первое вхождение строго после указанной даты. */
export function nextOccurrence(rule: RecurrenceRule, anchor: DateStr, after: DateStr): DateStr | null {
  if (!isValidRule(rule) || !isValidDateStr(anchor) || !isValidDateStr(after)) return null;
  const interval = Math.max(1, rule.interval);
  if (rule.freq === "monthly" || rule.freq === "yearly") {
    const step = rule.freq === "monthly" ? interval : interval * 12;
    for (let k = 0; k < 2400; k++) {
      const occ = addMonths(anchor, k * step);
      if (occ > after) return occ;
    }
    return null;
  }
  let cursor = after < anchor ? addDays(anchor, -1) : after;
  const limit = rule.freq === "daily" ? interval + 1 : interval * 7 + 7;
  for (let i = 0; i < limit; i++) {
    cursor = addDays(cursor, 1);
    if (occursOn(rule, anchor, cursor)) return cursor;
  }
  return null;
}

/** Все вхождения в диапазоне [from, to]. */
export function occurrencesBetween(rule: RecurrenceRule, anchor: DateStr, from: DateStr, to: DateStr, max = 1000): DateStr[] {
  const out: DateStr[] = [];
  if (!isValidRule(rule) || to < from) return out;
  let cursor = nextOccurrence(rule, anchor, addDays(from < anchor ? anchor : from, -1));
  while (cursor && cursor <= to && out.length < max) {
    out.push(cursor);
    cursor = nextOccurrence(rule, anchor, cursor);
  }
  return out;
}

const FREQ_RU: Record<RecurrenceRule["freq"], [string, string]> = {
  daily: ["Каждый день", "дн."],
  weekly: ["Каждую неделю", "нед."],
  monthly: ["Каждый месяц", "мес."],
  yearly: ["Каждый год", "г."],
};

export function describeRule(rule: RecurrenceRule | null | undefined): string {
  if (!rule || !isValidRule(rule)) return "Не повторяется";
  const [single, unit] = FREQ_RU[rule.freq];
  return rule.interval === 1 ? single : `Каждые ${rule.interval} ${unit}`;
}
