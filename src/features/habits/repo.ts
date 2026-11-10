import { db, markDirty } from "@/lib/db";
import { insertRow, patchRow, removeRow } from "@/lib/repo";
import { requestSync } from "@/lib/sync/engine";
import { habitInputSchema, type Habit, type HabitInput } from "./schema";

export const createHabit = (input: HabitInput) =>
  insertRow<Habit>("habits", habitInputSchema.parse(input));

export function updateHabit(id: string, input: HabitInput): Promise<void> {
  const data = habitInputSchema.parse(input);
  return patchRow<Habit>("habits", id, () => data);
}

export const deleteHabit = (id: string) => removeRow("habits", id);

// Постоянный id отметки для пары (привычка, дата) — UUID версии 5.
export async function habitLogId(habitId: string, date: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${habitId}:${date}`)),
  ).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function setHabitDone(
  habitId: string,
  date: string,
  done: boolean,
): Promise<void> {
  // id считаем до транзакции: ожидание crypto внутри неё закрыло бы транзакцию.
  const id = await habitLogId(habitId, date);
  const now = new Date().toISOString();
  await db.transaction("rw", db.habit_logs, db.outbox, async () => {
    const current = await db.habit_logs.get(id);
    await db.habit_logs.put({
      id,
      habitId,
      date,
      done,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    });
    await markDirty("habit_logs", id, now);
  });
  requestSync();
}
