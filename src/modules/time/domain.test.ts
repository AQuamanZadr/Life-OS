import { describe, expect, it } from "vitest";
import { make } from "@/test/factories";
import { durationSeconds, entrySeconds, overlaps, secondsByDay, secondsByKey, totalSeconds } from "./domain";

const entry = (started_at: string, ended_at: string | null, extra: Record<string, unknown> = {}) =>
  make("time_entries", { started_at, ended_at, duration_seconds: ended_at ? durationSeconds(started_at, ended_at) : 0, ...extra });

describe("учёт времени", () => {
  it("считает продолжительность и отклоняет отрицательную", () => {
    expect(durationSeconds("2026-11-10T10:00:00Z", "2026-11-10T11:30:00Z")).toBe(5400);
    expect(durationSeconds("2026-11-10T10:00:00Z", "2026-11-10T10:00:00Z")).toBe(0);
    expect(() => durationSeconds("2026-11-10T10:00:00Z", "2026-11-10T09:00:00Z")).toThrow();
    expect(() => entry("2026-11-10T10:00:00Z", "2026-11-10T09:00:00Z")).toThrow();
  });

  it("идущий таймер считается до текущего момента", () => {
    const e = entry("2026-11-10T10:00:00Z", null);
    expect(entrySeconds(e, new Date("2026-11-10T10:00:42Z"))).toBe(42);
  });

  it("определяет пересечения", () => {
    const a = { started_at: "2026-11-10T10:00:00Z", ended_at: "2026-11-10T11:00:00Z" };
    expect(overlaps(a, { started_at: "2026-11-10T10:30:00Z", ended_at: "2026-11-10T12:00:00Z" })).toBe(true);
    expect(overlaps(a, { started_at: "2026-11-10T11:00:00Z", ended_at: "2026-11-10T12:00:00Z" })).toBe(false);
  });

  it("делит запись через полночь и границу года между днями", () => {
    const e = entry("2026-12-31T17:00:00Z", "2026-12-31T21:00:00Z");
    // В Алматы (UTC+5) это 22:00 31 декабря — 02:00 1 января.
    expect(Object.fromEntries(secondsByDay([e], "Asia/Almaty"))).toEqual({ "2026-12-31": 7200, "2027-01-01": 7200 });
    expect(totalSeconds([e], { from: "2027-01-01", to: "2027-01-31" }, "Asia/Almaty")).toBe(7200);
    expect(totalSeconds([e], { from: "2026-12-01", to: "2027-01-31" }, "Asia/Almaty")).toBe(14400);
  });

  it("группирует по категории и игнорирует удалённые", () => {
    const a = entry("2026-11-10T10:00:00Z", "2026-11-10T11:00:00Z", { category_id: "11111111-1111-4111-8111-111111111111" });
    const b = entry("2026-11-10T12:00:00Z", "2026-11-10T12:30:00Z");
    const c = entry("2026-11-10T13:00:00Z", "2026-11-10T14:00:00Z", { deleted_at: "2026-11-11T00:00:00Z" });
    const m = secondsByKey([a, b, c], { from: "2026-11-10", to: "2026-11-10" }, "UTC", (e) => e.category_id);
    expect(Object.fromEntries(m)).toEqual({ "11111111-1111-4111-8111-111111111111": 3600, "": 1800 });
  });
});
