import { describe, expect, it } from "vitest";
import { addDays, addMonths, addYears, diffDays, eachDay, endOfMonth, formatDuration, isoWeekday, isValidDateStr, periodRange, previousRange, shiftPeriod, splitByDay, startOfWeek, toDateStr, zonedToUtc } from "./dates";

describe("календарные даты", () => {
  it("отклоняет несуществующие даты", () => {
    expect(isValidDateStr("2026-02-29")).toBe(false);
    expect(isValidDateStr("2028-02-29")).toBe(true);
    expect(isValidDateStr("2026-13-01")).toBe(false);
    expect(isValidDateStr("2026-04-31")).toBe(false);
    expect(isValidDateStr("26-04-01")).toBe(false);
    expect(isValidDateStr("")).toBe(false);
    expect(isValidDateStr(null)).toBe(false);
  });

  it("переходит через границу месяца", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("переходит через границу года", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(diffDays("2026-12-25", "2027-01-05")).toBe(11);
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonths("2027-01-15", -2)).toBe("2026-11-15");
  });

  it("прижимает день к концу месяца", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
  });

  it("считает дни недели и начало недели", () => {
    expect(isoWeekday("2026-11-09")).toBe(1);
    expect(isoWeekday("2026-11-15")).toBe(7);
    expect(startOfWeek("2026-11-12", 1)).toBe("2026-11-09");
    expect(startOfWeek("2026-11-12", 7)).toBe("2026-11-08");
    expect(startOfWeek("2026-11-08", 7)).toBe("2026-11-08");
    expect(startOfWeek("2027-01-01", 1)).toBe("2026-12-28");
  });

  it("строит периоды и предыдущие периоды", () => {
    expect(periodRange("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("quarter", "2026-11-10")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(periodRange("year", "2026-11-10")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(periodRange("week", "2027-01-01")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
    expect(shiftPeriod("month", "2026-01-31", -1)).toBe("2025-12-31");
    expect(previousRange({ from: "2026-03-01", to: "2026-03-10" })).toEqual({ from: "2026-02-19", to: "2026-02-28" });
    expect(eachDay("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });
});

describe("часовые пояса", () => {
  it("определяет локальную дату момента в разных поясах", () => {
    const instant = "2026-12-31T20:30:00Z";
    expect(toDateStr(instant, "UTC")).toBe("2026-12-31");
    expect(toDateStr(instant, "Asia/Almaty")).toBe("2027-01-01");
    expect(toDateStr(instant, "America/Los_Angeles")).toBe("2026-12-31");
    expect(toDateStr("2026-06-01T02:00:00Z", "America/New_York")).toBe("2026-05-31");
  });

  it("переводит локальное время в UTC", () => {
    expect(zonedToUtc("2026-11-10", "09:00", "Asia/Almaty").toISOString()).toBe("2026-11-10T04:00:00.000Z");
    expect(zonedToUtc("2026-07-01", "12:00", "Europe/Berlin").toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(zonedToUtc("2026-01-01", "12:00", "Europe/Berlin").toISOString()).toBe("2026-01-01T11:00:00.000Z");
  });

  it("обрабатывает переход на летнее время (несуществующий час)", () => {
    // Берлин, 29 марта 2026: 02:00 → 03:00, времени 02:30 не существует.
    const t = zonedToUtc("2026-03-29", "02:30", "Europe/Berlin");
    expect(toDateStr(t, "Europe/Berlin")).toBe("2026-03-29");
    expect(t.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("обрабатывает переход на зимнее время (повторяющийся час)", () => {
    // Берлин, 25 октября 2026: 03:00 → 02:00, 02:30 бывает дважды — берётся первое.
    expect(zonedToUtc("2026-10-25", "02:30", "Europe/Berlin").toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  it("делит интервал по суткам с учётом суток в 23 и 25 часов", () => {
    const spring = splitByDay(zonedToUtc("2026-03-28", "22:00", "Europe/Berlin").toISOString(), zonedToUtc("2026-03-30", "01:00", "Europe/Berlin").toISOString(), "Europe/Berlin");
    expect(Object.fromEntries(spring)).toEqual({ "2026-03-28": 2 * 3600, "2026-03-29": 23 * 3600, "2026-03-30": 3600 });
    const autumn = splitByDay(zonedToUtc("2026-10-25", "00:00", "Europe/Berlin").toISOString(), zonedToUtc("2026-10-26", "00:00", "Europe/Berlin").toISOString(), "Europe/Berlin");
    expect(Object.fromEntries(autumn)).toEqual({ "2026-10-25": 25 * 3600 });
  });

  it("делит интервал через границу года", () => {
    const m = splitByDay("2026-12-31T22:00:00Z", "2027-01-01T03:00:00Z", "UTC");
    expect(Object.fromEntries(m)).toEqual({ "2026-12-31": 7200, "2027-01-01": 10800 });
    expect(splitByDay("2026-01-01T10:00:00Z", "2026-01-01T10:00:00Z", "UTC").size).toBe(0);
    expect(splitByDay("2026-01-02T10:00:00Z", "2026-01-01T10:00:00Z", "UTC").size).toBe(0);
  });

  it("форматирует продолжительность", () => {
    expect(formatDuration(0)).toBe("0 мин");
    expect(formatDuration(45)).toBe("45 с");
    expect(formatDuration(3900)).toBe("1 ч 05 мин");
    expect(formatDuration(-5)).toBe("0 мин");
  });
});
