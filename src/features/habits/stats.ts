import { addDays, isoWeekday } from "@/lib/dates";

// Серия: сколько запланированных дней подряд привычка выполнена.
// Невыполненный сегодняшний день серию не обрывает — день ещё не закончился.
export function currentStreak(
  weekdays: number[],
  doneDates: ReadonlySet<string>,
  today: string,
): number {
  let streak = 0;
  let day = today;
  if (!doneDates.has(day)) day = addDays(day, -1);
  // Ограничение — защита от бесконечного цикла при пустом расписании.
  for (let i = 0; i < 3660; i++) {
    if (weekdays.includes(isoWeekday(day))) {
      if (!doneDates.has(day)) break;
      streak++;
    }
    day = addDays(day, -1);
  }
  return streak;
}

// Выполнено и запланировано за последние `days` дней, но не раньше даты `since`.
export function completion(
  weekdays: number[],
  doneDates: ReadonlySet<string>,
  today: string,
  since: string,
  days = 30,
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (let i = 0; i < days; i++) {
    const day = addDays(today, -i);
    if (day < since) break;
    if (!weekdays.includes(isoWeekday(day))) continue;
    total++;
    if (doneDates.has(day)) done++;
  }
  return { done, total };
}
