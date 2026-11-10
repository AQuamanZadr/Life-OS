import { addDays, diffDays, isoWeekday, startOfWeek, type DateStr, type WeekStart } from "@/core/lib/dates";
import type { Habit, HabitLog } from "@/core/db/schema";

type HabitRule = Pick<Habit, "habit_type" | "target_value" | "frequency" | "schedule_config" | "start_date" | "end_date">;

/** Действует ли привычка в эту дату (с учётом дат начала и окончания). */
export function isWithinLifetime(habit: HabitRule, date: DateStr): boolean {
  return date >= habit.start_date && (!habit.end_date || date <= habit.end_date);
}

/** Запланирована ли привычка на конкретный день. */
export function isScheduledOn(habit: HabitRule, date: DateStr): boolean {
  if (!isWithinLifetime(habit, date)) return false;
  switch (habit.frequency) {
    case "daily":
    case "weekly_count":
      return true;
    case "weekdays":
      return (habit.schedule_config.weekdays ?? []).includes(isoWeekday(date));
    case "interval":
      return diffDays(habit.start_date, date) % Math.max(1, habit.schedule_config.interval_days ?? 1) === 0;
  }
}

/** Засчитывается ли запись как выполнение привычки. */
export function isSuccess(habit: Pick<Habit, "habit_type" | "target_value">, log: Pick<HabitLog, "value" | "status"> | undefined): boolean {
  if (!log || log.status === "skipped" || log.status === "missed") return false;
  const target = habit.target_value ?? 0;
  switch (habit.habit_type) {
    case "boolean":
      return log.value >= 1;
    case "limit":
      // Ограничение: успех — не превысить лимит.
      return log.value <= target;
    default:
      return log.value >= target;
  }
}

/** Статус записи по введённому значению. */
export function statusForValue(habit: Pick<Habit, "habit_type" | "target_value">, value: number): HabitLog["status"] {
  if (isSuccess(habit, { value, status: "done" })) return "done";
  if (habit.habit_type === "limit") return "missed";
  return value > 0 ? "partial" : "missed";
}

function logMap(logs: HabitLog[]): Map<DateStr, HabitLog> {
  const m = new Map<DateStr, HabitLog>();
  for (const l of logs) if (!l.deleted_at) m.set(l.log_date, l);
  return m;
}

function weeklySuccesses(habit: HabitRule, byDate: Map<DateStr, HabitLog>, weekFrom: DateStr): number {
  let n = 0;
  for (let i = 0; i < 7; i++) if (isSuccess(habit, byDate.get(addDays(weekFrom, i)))) n++;
  return n;
}

export interface StreakInfo {
  current: number;
  best: number;
  /** Единица серии: дни или недели (для привычек «N раз в неделю»). */
  unit: "day" | "week";
}

/**
 * Серии выполнения. Пропуск (status = skipped) серию не прерывает и не
 * увеличивает; сегодняшний ещё не отмеченный день серию не обнуляет.
 */
export function computeStreaks(habit: HabitRule, logs: HabitLog[], today: DateStr, weekStart: WeekStart = 1): StreakInfo {
  const byDate = logMap(logs);
  if (habit.frequency === "weekly_count") {
    const need = habit.schedule_config.times_per_week ?? 1;
    const firstWeek = startOfWeek(habit.start_date, weekStart);
    const thisWeek = startOfWeek(today, weekStart);
    let best = 0;
    let run = 0;
    let current = 0;
    for (let w = firstWeek; w <= thisWeek; w = addDays(w, 7)) {
      const ok = weeklySuccesses(habit, byDate, w) >= need;
      if (ok) run++;
      else if (w !== thisWeek) run = 0;
      best = Math.max(best, run);
      current = run;
    }
    return { current, best, unit: "week" };
  }

  let best = 0;
  let run = 0;
  const last = habit.end_date && habit.end_date < today ? habit.end_date : today;
  for (let d = habit.start_date; d <= last; d = addDays(d, 1)) {
    if (!isScheduledOn(habit, d)) continue;
    const log = byDate.get(d);
    if (log?.status === "skipped") continue;
    if (isSuccess(habit, log)) run++;
    else if (d === today && !log) {
      /* день ещё не закончился */
    } else run = 0;
    best = Math.max(best, run);
  }
  return { current: run, best, unit: "day" };
}

export interface HabitStats {
  scheduled: number;
  completed: number;
  skipped: number;
  /** Доля выполненных от запланированных, 0–100. */
  rate: number;
}

/** Регулярность за период [from, to]. */
export function habitStats(habit: HabitRule, logs: HabitLog[], from: DateStr, to: DateStr, weekStart: WeekStart = 1): HabitStats {
  const byDate = logMap(logs);
  let scheduled = 0;
  let completed = 0;
  let skipped = 0;
  if (habit.frequency === "weekly_count") {
    const need = habit.schedule_config.times_per_week ?? 1;
    for (let w = startOfWeek(from, weekStart); w <= to; w = addDays(w, 7)) {
      if (addDays(w, 6) < habit.start_date || (habit.end_date && w > habit.end_date)) continue;
      scheduled += need;
      completed += Math.min(need, weeklySuccesses(habit, byDate, w));
    }
  } else {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!isScheduledOn(habit, d)) continue;
      const log = byDate.get(d);
      if (log?.status === "skipped") {
        skipped++;
        continue;
      }
      scheduled++;
      if (isSuccess(habit, log)) completed++;
    }
  }
  return { scheduled, completed, skipped, rate: scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100) };
}

export function describeSchedule(habit: Pick<Habit, "frequency" | "schedule_config">): string {
  const names = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
  switch (habit.frequency) {
    case "daily":
      return "Каждый день";
    case "weekdays":
      return (habit.schedule_config.weekdays ?? []).slice().sort().map((d) => names[d - 1]).join(", ") || "Дни не выбраны";
    case "weekly_count":
      return `${habit.schedule_config.times_per_week ?? 1} раз(а) в неделю`;
    case "interval":
      return `Каждые ${habit.schedule_config.interval_days ?? 1} дн.`;
  }
}
