"use client";

import { useRows } from "@/lib/use-rows";
import type { Habit, HabitLog } from "./schema";

export const useHabits = () => useRows<Habit>("habits");
export const useHabitLogs = () => useRows<HabitLog>("habit_logs");

// Даты выполнения по каждой привычке.
export function doneDatesByHabit(logs: HabitLog[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const log of logs) {
    if (!log.done) continue;
    let dates = result.get(log.habitId);
    if (!dates) result.set(log.habitId, (dates = new Set()));
    dates.add(log.date);
  }
  return result;
}
