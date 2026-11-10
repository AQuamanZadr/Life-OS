import { z } from "zod";
import { dateKeyField, notesField, rowFields, titleField } from "@/lib/schema";

export const habitStatuses = ["active", "archived"] as const;
export type HabitStatus = (typeof habitStatuses)[number];

export const habitStatusLabels: Record<HabitStatus, string> = {
  active: "Активная",
  archived: "В архиве",
};

// Индекс 0 — понедельник (день недели по ISO минус 1).
export const weekdayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;
export const allWeekdays = [1, 2, 3, 4, 5, 6, 7];

export const habitInputSchema = z.object({
  title: titleField,
  notes: notesField,
  status: z.enum(habitStatuses),
  // Дни недели по ISO (1 — понедельник), в которые привычка запланирована.
  weekdays: z
    .array(z.number().int().min(1).max(7))
    .min(1, "Выберите хотя бы один день")
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
});

export type HabitInput = z.infer<typeof habitInputSchema>;

export const habitSchema = habitInputSchema.extend(rowFields);
export type Habit = z.infer<typeof habitSchema>;

// Отметка привычки за день. Одна запись на пару (привычка, дата):
// её id вычисляется из этой пары, поэтому отметки с разных устройств не дублируются.
export const habitLogSchema = z.object({
  ...rowFields,
  habitId: z.uuid(),
  date: dateKeyField,
  done: z.boolean(),
});

export type HabitLog = z.infer<typeof habitLogSchema>;

export function scheduleLabel(weekdays: number[]): string {
  if (weekdays.length === 7) return "Каждый день";
  if (weekdays.join() === "1,2,3,4,5") return "По будням";
  if (weekdays.join() === "6,7") return "По выходным";
  return weekdays.map((d) => weekdayLabels[d - 1]).join(", ");
}
