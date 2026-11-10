import { describe, expect, it } from "vitest";
import { addAmounts, compareAmounts, formatMoney, fromMinor, MoneyError, normalizeAmount, percentOf, subAmounts, sumAmounts, toMinor } from "./money";

describe("денежная арифметика", () => {
  it("не теряет точность там, где ошибается плавающая точка", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(addAmounts("0.10", "0.20")).toBe("0.30");
    expect(sumAmounts(Array(10).fill("0.10"))).toBe("1.00");
    expect(subAmounts("1.00", "0.90")).toBe("0.10");
  });

  it("разбирает разные формы записи", () => {
    expect(toMinor("1500")).toBe(150000n);
    expect(toMinor("1500,5")).toBe(150050n);
    expect(toMinor("1 500.50")).toBe(150050n);
    expect(toMinor("-0.01")).toBe(-1n);
    expect(toMinor("007.10")).toBe(710n);
    expect(normalizeAmount("12.5")).toBe("12.50");
    expect(normalizeAmount("12.500")).toBe("12.50");
    expect(normalizeAmount("1500.00", 0)).toBe("1500");
  });

  it("отклоняет некорректный ввод", () => {
    for (const bad of ["", "abc", "1.2.3", "1e5", "NaN", "Infinity", "--1", "1,234,567", " ", "12.345"]) {
      expect(() => toMinor(bad), bad).toThrow(MoneyError);
    }
    expect(() => toMinor("1.5", 0)).toThrow(MoneyError);
  });

  it("работает с нулём и отрицательными значениями", () => {
    expect(normalizeAmount("0")).toBe("0.00");
    expect(normalizeAmount("-0")).toBe("0.00");
    expect(fromMinor(-5n)).toBe("-0.05");
    expect(compareAmounts("0.00", "0")).toBe(0);
    expect(compareAmounts("-1", "1")).toBe(-1);
    expect(percentOf("50", "0")).toBe(0);
    expect(percentOf("25", "200")).toBe(12.5);
  });

  it("точно считает очень большие числа", () => {
    const big = "99999999999999999999.99";
    expect(normalizeAmount(big)).toBe(big);
    expect(addAmounts(big, "0.01")).toBe("100000000000000000000.00");
    expect(subAmounts("9007199254740993.00", "0.01")).toBe("9007199254740992.99");
    expect(() => toMinor("999999999999999999999")).toThrow(MoneyError);
  });

  it("поддерживает валюты с другой точностью", () => {
    expect(toMinor("0.00000001", 8)).toBe(1n);
    expect(addAmounts("0.00000001", "0.00000002", 8)).toBe("0.00000003");
    expect(fromMinor(1234n, 0)).toBe("1234");
  });

  it("форматирует для отображения", () => {
    expect(formatMoney("1234567.5", "KZT")).toBe("1 234 567,50 ₸");
    expect(formatMoney("-10", "USD")).toBe("−10,00 $");
    expect(formatMoney("5", "XXX")).toBe("5,00 XXX");
    expect(formatMoney("1500.50000000", "EUR")).toBe("1 500,50 €");
  });
});
