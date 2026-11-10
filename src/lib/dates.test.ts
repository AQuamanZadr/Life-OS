import { describe, expect, it } from "vitest";
import { isValidDateKey, toDateKey } from "./dates";

describe("toDateKey", () => {
  it("берёт местную дату, а не UTC", () => {
    expect(toDateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(toDateKey(new Date(2026, 11, 31, 0, 1))).toBe("2026-12-31");
  });
});

describe("isValidDateKey", () => {
  it("проверяет формат и существование даты", () => {
    expect(isValidDateKey("2028-02-29")).toBe(true);
    expect(isValidDateKey("2026-02-29")).toBe(false);
    expect(isValidDateKey("2026-13-01")).toBe(false);
    expect(isValidDateKey("26-01-01")).toBe(false);
  });
});
