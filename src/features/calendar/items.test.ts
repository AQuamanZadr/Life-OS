import { describe, expect, it } from "vitest";
import { buildItems, groupByDate, monthGrid } from "./items";
import { eventInputSchema, type CalendarEvent } from "./schema";

const at = "2026-11-10T10:00:00.000Z";
const base = { createdAt: at, updatedAt: at, deletedAt: null };

describe("monthGrid", () => {
  it("начинается с понедельника и покрывает весь месяц", () => {
    const nov = monthGrid("2026-11"); // 1 ноября 2026 — воскресенье
    expect(nov[0][0]).toBe("2026-10-26");
    expect(nov[0][6]).toBe("2026-11-01");
    expect(nov.at(-1)![0]).toBe("2026-11-30");
    expect(nov).toHaveLength(6);
    expect(nov.every((w) => w.length === 7)).toBe(true);
  });
  it("февраль из четырёх ровных недель", () => {
    const feb = monthGrid("2027-02"); // 1 февраля 2027 — понедельник
    expect(feb).toHaveLength(4);
    expect(feb[0][0]).toBe("2027-02-01");
    expect(feb[3][6]).toBe("2027-02-28");
  });
});

describe("buildItems", () => {
  const event = (o: Partial<CalendarEvent>): CalendarEvent => ({
    ...base,
    id: "e" + (o.title ?? ""),
    title: "Событие",
    notes: "",
    date: "2026-11-10",
    startTime: null,
    endTime: null,
    ...o,
  });

  it("собирает события и сроки, сортирует внутри дня", () => {
    const items = buildItems({
      events: [event({ title: "Обед", startTime: "13:00" }), event({ title: "Весь день" }), event({ title: "Утро", startTime: "09:00" })],
      tasks: [
        { ...base, id: "t1", title: "Задача", notes: "", status: "done", priority: "medium", dueDate: "2026-11-10", projectId: null, goalId: null, completedAt: at },
        { ...base, id: "t2", title: "Без срока", notes: "", status: "todo", priority: "medium", dueDate: null, projectId: null, goalId: null, completedAt: null },
      ],
      projects: [{ ...base, id: "p1", title: "Проект", notes: "", status: "active", dueDate: "2026-11-12", goalId: null }],
      goals: [{ ...base, id: "g1", title: "Цель", notes: "", status: "active", targetDate: "2026-11-10", progress: 0 }],
    });
    const day = groupByDate(items).get("2026-11-10")!;
    expect(day.map((i) => i.title)).toEqual(["Весь день", "Утро", "Обед", "Задача", "Цель"]);
    expect(day.find((i) => i.kind === "task")!.done).toBe(true);
    expect(groupByDate(items).get("2026-11-12")!.map((i) => i.kind)).toEqual(["project"]);
    expect(items.some((i) => i.title === "Без срока")).toBe(false);
  });
});

describe("схема события", () => {
  const ok = { title: "Встреча", notes: "", date: "2026-11-10", startTime: "10:00", endTime: "11:00" };
  it("проверяет время", () => {
    expect(eventInputSchema.safeParse(ok).success).toBe(true);
    expect(eventInputSchema.safeParse({ ...ok, startTime: null, endTime: null }).success).toBe(true);
    expect(eventInputSchema.safeParse({ ...ok, endTime: "09:00" }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...ok, startTime: null }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...ok, startTime: "25:00" }).success).toBe(false);
  });
});
