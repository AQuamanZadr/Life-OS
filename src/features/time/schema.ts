import { z } from "zod";
import { isoDateTime, rowFields } from "@/lib/schema";

export const MAX_ENTRY_MS = 24 * 60 * 60 * 1000;

const fields = {
  startedAt: isoDateTime,
  // null — таймер ещё идёт.
  endedAt: isoDateTime.nullable(),
  taskId: z.uuid().nullable(),
  projectId: z.uuid().nullable(),
  note: z.string().trim().max(500, "Не длиннее 500 символов"),
};

function validRange(e: { startedAt: string; endedAt: string | null }) {
  if (e.endedAt === null) return true;
  const ms = Date.parse(e.endedAt) - Date.parse(e.startedAt);
  return ms > 0 && ms <= MAX_ENTRY_MS;
}
const rangeError = { path: ["duration"], message: "Длительность — от 1 минуты до 24 часов" };

export const timeEntryInputSchema = z.object(fields).refine(validRange, rangeError);
export type TimeEntryInput = z.infer<typeof timeEntryInputSchema>;

export const timeEntrySchema = z.object({ ...fields, ...rowFields });
export type TimeEntry = z.infer<typeof timeEntrySchema>;
