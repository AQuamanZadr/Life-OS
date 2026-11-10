import { describe, expect, it } from "vitest";
import { addDays, isoWeekday } from "@/lib/dates";
import { habitInputSchema, scheduleLabel } from "./schema";
import { completion, currentStreak } from "./stats";

const everyDay = [1, 2, 3, 4, 5, 6, 7];
const weekdays = [1, 2, 3, 4, 5];
// 2026-11-13 — пятница
const fri = "2026-11-13";

describe("даты", () => {
  it("addDays переходит через границы месяца и года", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("isoWeekday: понедельник — 1, воскресенье — 7", () => {
    expect(isoWeekday("2026-11-09")).toBe(1);
    expect(isoWeekday("2026-11-15")).toBe(7);
  });
});

describe("currentStreak", () => {
  it("считает дни подряд, включая сегодня", () => {
    const done = new Set(["2026-11-11", "2026-11-12", fri]);
    expect(currentStreak(everyDay, done, fri)).toBe(3);
  });
  it("невыполненное сегодня не обрывает серию", () => {
    const done = new Set(["2026-11-11", "2026-11-12"]);
    expect(currentStreak(everyDay, done, fri)).toBe(2);
  });
  it("пропуск запланированного дня обрывает серию", () => {
    const done = new Set(["2026-11-10", "2026-11-12", fri]);
    expect(currentStreak(everyDay, done, fri)).toBe(2);
  });
  it("незапланированные дни серию не обрывают", () => {
    // пт и пн выполнены, выходные не запланированы
    const done = new Set([fri, "2026-11-16"]);
    expect(currentStreak(weekdays, done, "2026-11-16")).toBe(2);
  });
  it("без отметок серия равна нулю", () => {
    expect(currentStreak(everyDay, new Set(), fri)).toBe(0);
  });
});

describe("completion", () => {
  it("считает только запланированные дни и не раньше даты создания", () => {
    const done = new Set(["2026-11-12", fri]);
    expect(completion(everyDay, done, fri, "2026-11-10")).toEqual({ done: 2, total: 4 });
    // за 7 дней до пятницы: сб и вс не запланированы
    expect(completion(weekdays, done, fri, "2026-01-01", 7)).toEqual({ done: 2, total: 5 });
  });
});

describe("схема привычки", () => {
  it("требует хотя бы один день, убирает повторы и сортирует", () => {
    const base = { title: "Зарядка", notes: "", status: "active" };
    expect(habitInputSchema.safeParse({ ...base, weekdays: [] }).success).toBe(false);
    expect(habitInputSchema.parse({ ...base, weekdays: [5, 1, 5] }).weekdays).toEqual([1, 5]);
  });
  it("подписывает расписание", () => {
    expect(scheduleLabel(everyDay)).toBe("Каждый день");
    expect(scheduleLabel(weekdays)).toBe("По будням");
    expect(scheduleLabel([1, 3])).toBe("Пн, Ср");
  });
});
