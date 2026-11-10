import { describe, expect, it } from "vitest";
import { make } from "@/test/factories";
import { computeStreaks, habitStats, isScheduledOn, isSuccess, statusForValue } from "./domain";
import type { HabitLog } from "@/core/db/schema";

const daily = make("habits", { title: "Зарядка", start_date: "2026-12-25" });
const log = (habit_id: string, log_date: string, value = 1, status: HabitLog["status"] = "done") => make("habit_logs", { habit_id, log_date, value, status });

describe("привычки: расписание", () => {
  it("учитывает даты начала и окончания", () => {
    const h = make("habits", { title: "x", start_date: "2026-01-10", end_date: "2026-01-20" });
    expect(isScheduledOn(h, "2026-01-09")).toBe(false);
    expect(isScheduledOn(h, "2026-01-10")).toBe(true);
    expect(isScheduledOn(h, "2026-01-21")).toBe(false);
  });

  it("дни недели и интервал", () => {
    const wd = make("habits", { title: "x", start_date: "2026-11-01", frequency: "weekdays", schedule_config: { weekdays: [1, 3] } });
    expect(isScheduledOn(wd, "2026-11-09")).toBe(true);
    expect(isScheduledOn(wd, "2026-11-10")).toBe(false);
    const iv = make("habits", { title: "x", start_date: "2026-12-30", frequency: "interval", schedule_config: { interval_days: 2 } });
    expect(isScheduledOn(iv, "2026-12-31")).toBe(false);
    expect(isScheduledOn(iv, "2027-01-01")).toBe(true);
  });
});

describe("привычки: засчитывание результата", () => {
  it("по типам измерения", () => {
    const numeric = make("habits", { title: "Вода", start_date: "2026-01-01", habit_type: "numeric", target_value: 2000 });
    expect(isSuccess(numeric, { value: 2000, status: "done" })).toBe(true);
    expect(isSuccess(numeric, { value: 1999, status: "done" })).toBe(false);
    expect(statusForValue(numeric, 500)).toBe("partial");
    expect(statusForValue(numeric, 0)).toBe("missed");
    const limit = make("habits", { title: "Кофе", start_date: "2026-01-01", habit_type: "limit", target_value: 2 });
    expect(isSuccess(limit, { value: 0, status: "done" })).toBe(true);
    expect(isSuccess(limit, { value: 2, status: "done" })).toBe(true);
    expect(statusForValue(limit, 3)).toBe("missed");
    expect(isSuccess(daily, undefined)).toBe(false);
    expect(isSuccess(daily, { value: 1, status: "skipped" })).toBe(false);
  });
});

describe("привычки: серии", () => {
  it("серия продолжается через границу года", () => {
    const logs = ["2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"].map((d) => log(daily.id, d));
    expect(computeStreaks(daily, logs, "2027-01-02")).toEqual({ current: 5, best: 5, unit: "day" });
  });

  it("сегодняшний неотмеченный день серию не обнуляет, вчерашний пропуск — обнуляет", () => {
    const logs = ["2026-12-30", "2026-12-31"].map((d) => log(daily.id, d));
    expect(computeStreaks(daily, logs, "2027-01-01").current).toBe(2);
    expect(computeStreaks(daily, logs, "2027-01-02").current).toBe(0);
    expect(computeStreaks(daily, logs, "2027-01-02").best).toBe(2);
  });

  it("пропуск не прерывает серию", () => {
    const logs = [log(daily.id, "2026-12-25"), log(daily.id, "2026-12-26", 0, "skipped"), log(daily.id, "2026-12-27")];
    expect(computeStreaks(daily, logs, "2026-12-27").current).toBe(2);
  });

  it("серия по неделям для привычки «N раз в неделю»", () => {
    const h = make("habits", { title: "Бег", start_date: "2026-11-02", frequency: "weekly_count", schedule_config: { times_per_week: 2 } });
    const logs = ["2026-11-02", "2026-11-04", "2026-11-10", "2026-11-14", "2026-11-17"].map((d) => log(h.id, d));
    expect(computeStreaks(h, logs, "2026-11-18")).toEqual({ current: 2, best: 2, unit: "week" });
  });

  it("пустая история", () => {
    expect(computeStreaks(daily, [], "2027-01-10")).toEqual({ current: 0, best: 0, unit: "day" });
  });
});

describe("привычки: статистика", () => {
  it("считает регулярность за период через границу месяца", () => {
    const logs = ["2026-12-30", "2026-12-31", "2027-01-02"].map((d) => log(daily.id, d));
    expect(habitStats(daily, logs, "2026-12-29", "2027-01-02")).toEqual({ scheduled: 5, completed: 3, skipped: 0, rate: 60 });
  });

  it("не делит на ноль, если ничего не запланировано", () => {
    expect(habitStats(daily, [], "2026-01-01", "2026-01-31").rate).toBe(0);
  });
});
