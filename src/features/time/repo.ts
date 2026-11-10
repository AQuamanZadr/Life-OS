import { db } from "@/lib/db";
import { insertRow, patchRow, removeRow } from "@/lib/repo";
import { timeEntryInputSchema, type TimeEntry, type TimeEntryInput } from "./schema";

export const createEntry = (input: TimeEntryInput) =>
  insertRow<TimeEntry>("time_entries", timeEntryInputSchema.parse(input));

export function updateEntry(id: string, input: TimeEntryInput): Promise<void> {
  const data = timeEntryInputSchema.parse(input);
  return patchRow<TimeEntry>("time_entries", id, () => data);
}

export const deleteEntry = (id: string) => removeRow("time_entries", id);

function stopAt(entry: TimeEntry, now: number): string {
  // Конец всегда позже начала, даже если остановили сразу.
  return new Date(Math.max(now, Date.parse(entry.startedAt) + 1000)).toISOString();
}

export function stopTimer(id: string): Promise<void> {
  return patchRow<TimeEntry>("time_entries", id, (current) =>
    current.endedAt ? {} : { endedAt: stopAt(current, Date.now()) },
  );
}

// Запускает таймер. Одновременно идёт только один: предыдущий останавливается.
export function startTimer(input: {
  taskId: string | null;
  projectId: string | null;
  note: string;
}): Promise<TimeEntry> {
  return db.transaction("rw", db.time_entries, db.outbox, async () => {
    const now = Date.now();
    for (const entry of await db.time_entries.toArray()) {
      if (!entry.deletedAt && entry.endedAt === null)
        await patchRow<TimeEntry>("time_entries", entry.id, (e) => ({ endedAt: stopAt(e, now) }));
    }
    return createEntry({ ...input, startedAt: new Date(now).toISOString(), endedAt: null });
  });
}
