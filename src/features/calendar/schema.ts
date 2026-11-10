import { z } from "zod";
import { dateKeyField, notesField, rowFields, titleField } from "@/lib/schema";

const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Некорректное время");

// Событие календаря. Дата и время — «как на часах» у пользователя, без часового пояса:
// встреча в 10:00 остаётся в 10:00, где бы ни открыли календарь.
const fields = {
  title: titleField,
  notes: notesField,
  date: dateKeyField,
  // null — событие на весь день.
  startTime: timeField.nullable(),
  endTime: timeField.nullable(),
};

function validTimes(e: { startTime: string | null; endTime: string | null }) {
  if (e.endTime === null) return true;
  return e.startTime !== null && e.endTime > e.startTime;
}
const timesError = { path: ["endTime"], message: "Окончание должно быть позже начала" };

export const eventInputSchema = z.object(fields).refine(validTimes, timesError);
export type EventInput = z.infer<typeof eventInputSchema>;

export const eventSchema = z.object({ ...fields, ...rowFields });
export type CalendarEvent = z.infer<typeof eventSchema>;
