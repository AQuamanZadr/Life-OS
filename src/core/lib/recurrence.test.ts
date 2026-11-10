import { describe, expect, it } from "vitest";
import { isValidRule, nextOccurrence, occurrencesBetween, occursOn } from "./recurrence";
import { deterministicId, UUID_RE } from "./ids";

describe("повторяющиеся события", () => {
  it("ежедневно и каждые N дней", () => {
    expect(nextOccurrence({ freq: "daily", interval: 1 }, "2026-12-30", "2026-12-31")).toBe("2027-01-01");
    expect(occurrencesBetween({ freq: "daily", interval: 3 }, "2026-12-28", "2026-12-28", "2027-01-06")).toEqual(["2026-12-28", "2026-12-31", "2027-01-03", "2027-01-06"]);
  });

  it("еженедельно по выбранным дням", () => {
    const rule = { freq: "weekly" as const, interval: 1, weekdays: [1, 5] };
    expect(occurrencesBetween(rule, "2026-11-09", "2026-11-09", "2026-11-22")).toEqual(["2026-11-09", "2026-11-13", "2026-11-16", "2026-11-20"]);
    expect(nextOccurrence({ freq: "weekly", interval: 2 }, "2026-11-10", "2026-11-10")).toBe("2026-11-24");
  });

  it("ежемесячно: 31-е число не сползает", () => {
    const rule = { freq: "monthly" as const, interval: 1 };
    expect(occurrencesBetween(rule, "2026-01-31", "2026-01-31", "2026-05-31")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
    expect(nextOccurrence(rule, "2026-01-31", "2026-02-28")).toBe("2026-03-31");
    expect(nextOccurrence(rule, "2026-11-15", "2026-12-15")).toBe("2027-01-15");
  });

  it("ежегодно: 29 февраля", () => {
    const rule = { freq: "yearly" as const, interval: 1 };
    expect(occurrencesBetween(rule, "2028-02-29", "2028-02-29", "2032-12-31")).toEqual(["2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
  });

  it("не возвращает вхождения до якорной даты", () => {
    expect(occursOn({ freq: "daily", interval: 1 }, "2026-05-10", "2026-05-09")).toBe(false);
    expect(nextOccurrence({ freq: "daily", interval: 1 }, "2026-05-10", "2026-01-01")).toBe("2026-05-10");
  });

  it("проверяет правило", () => {
    expect(isValidRule({ freq: "daily", interval: 1 })).toBe(true);
    expect(isValidRule({ freq: "daily", interval: 0 })).toBe(false);
    expect(isValidRule({ freq: "hourly", interval: 1 })).toBe(false);
    expect(isValidRule({ freq: "weekly", interval: 1, weekdays: [8] })).toBe(false);
    expect(isValidRule(null)).toBe(false);
  });
});

describe("детерминированные идентификаторы", () => {
  it("одинаковы для одинакового ключа и различны для разных", () => {
    const a = deterministicId("habit-log", "h1", "2026-11-10");
    expect(a).toMatch(UUID_RE);
    expect(a[14]).toBe("5");
    expect(deterministicId("habit-log", "h1", "2026-11-10")).toBe(a);
    expect(deterministicId("habit-log", "h1", "2026-11-11")).not.toBe(a);
    expect(deterministicId("ab", "c")).not.toBe(deterministicId("a", "bc"));
  });

  it("совпадает с эталонным UUID v5", () => {
    // Проверка реализации SHA-1: uuidv5("hello", NAMESPACE) вычислен эталонной библиотекой node:crypto.
    const expected = (() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createHash } = require("node:crypto") as typeof import("node:crypto");
      const ns = Buffer.from("6f1d7c0a5b0e4a539d7e2c7a1e0b9a11", "hex");
      const h = createHash("sha1").update(ns).update("hello").digest().subarray(0, 16);
      h[6] = (h[6] & 0x0f) | 0x50;
      h[8] = (h[8] & 0x3f) | 0x80;
      const x = h.toString("hex");
      return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
    })();
    expect(deterministicId("hello")).toBe(expected);
    const long = "я".repeat(500);
    expect(deterministicId(long)).toMatch(UUID_RE);
  });
});
