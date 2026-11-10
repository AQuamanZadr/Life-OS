import { describe, expect, it } from "vitest";
import { timeEntryInputSchema, type TimeEntry } from "./schema";
import {
  dayOf,
  durationMs,
  formatClock,
  formatDuration,
  localTime,
  msByTask,
  toRange,
  totalsByDay,
} from "./stats";

let n = 0;
function entry(startLocal: Date, minutes: number | null, over: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: String(++n),
    startedAt: startLocal.toISOString(),
    endedAt: minutes === null ? null : new Date(startLocal.getTime() + minutes * 60_000).toISOString(),
    taskId: null,
    projectId: null,
    note: "",
    createdAt: startLocal.toISOString(),
    updatedAt: startLocal.toISOString(),
    deletedAt: null,
    ...over,
  };
}

describe("длительность", () => {
  it("завершённая запись и идущий таймер", () => {
    const start = new Date(2026, 10, 10, 9, 0);
    expect(durationMs(entry(start, 90), 0)).toBe(90 * 60_000);
    expect(durationMs(entry(start, null), start.getTime() + 5000)).toBe(5000);
  });

  it("форматирование", () => {
    expect(formatDuration(0)).toBe("0 мин");
    expect(formatDuration(59 * 60_000)).toBe("59 мин");
    expect(formatDuration(60 * 60_000)).toBe("1 ч");
    expect(formatDuration(65 * 60_000)).toBe("1 ч 05 мин");
    expect(formatClock(3_725_000)).toBe("1:02:05");
  });
});

describe("по дням", () => {
  it("запись относится к местному дню начала, даже поздно вечером", () => {
    const late = entry(new Date(2026, 10, 10, 23, 30), 60);
    expect(dayOf(late)).toBe("2026-11-10");
    const rows = totalsByDay(
      [late, entry(new Date(2026, 10, 10, 8, 0), 30), entry(new Date(2026, 10, 9, 8, 0), 15)],
      ["2026-11-08", "2026-11-09", "2026-11-10"],
      0,
    );
    expect(rows.map((r) => r.ms / 60_000)).toEqual([0, 15, 90]);
  });

  it("время по задачам считает только завершённые записи", () => {
    const start = new Date(2026, 10, 10, 9, 0);
    const map = msByTask([
      entry(start, 30, { taskId: "t1" }),
      entry(start, 45, { taskId: "t1" }),
      entry(start, null, { taskId: "t1" }),
      entry(start, 10),
    ]);
    expect(map.get("t1")).toBe(75 * 60_000);
    expect(map.size).toBe(1);
  });
});

describe("ввод вручную", () => {
  it("toRange строит интервал в местном времени и обратно", () => {
    const range = toRange("2026-11-10", "09:15", 90)!;
    expect(localTime(range.startedAt)).toBe("09:15");
    expect(localTime(range.endedAt)).toBe("10:45");
    expect(toRange("2026-11-10", "9:15", 90)).toBeNull();
  });

  it("схема: от 1 минуты до 24 часов", () => {
    const make = (minutes: number) => ({
      ...toRange("2026-11-10", "09:00", minutes)!,
      taskId: null,
      projectId: null,
      note: "",
    });
    expect(timeEntryInputSchema.safeParse(make(1)).success).toBe(true);
    expect(timeEntryInputSchema.safeParse(make(0)).success).toBe(false);
    expect(timeEntryInputSchema.safeParse(make(24 * 60 + 1)).success).toBe(false);
  });
});
