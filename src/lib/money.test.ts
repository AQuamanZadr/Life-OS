import { describe, expect, it } from "vitest";
import { amountToInput, formatMoney, parseAmount } from "./money";

const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("parseAmount", () => {
  it("разбирает рубли и копейки без дробной арифметики", () => {
    expect(parseAmount("0,1")).toBe(10);
    expect(parseAmount("0.07")).toBe(7);
    expect(parseAmount("1 234,56")).toBe(123456);
    expect(parseAmount("19.99")).toBe(1999);
    expect(parseAmount("500")).toBe(50000);
  });
  it("0,1 + 0,2 = 0,3 ровно", () => {
    expect(parseAmount("0,1")! + parseAmount("0,2")!).toBe(parseAmount("0,3"));
  });
  it("отклоняет ноль, отрицательные, лишние знаки и мусор", () => {
    for (const bad of ["", "0", "0,00", "-5", "1,234", "1.2.3", "abc", "1e3", "12 руб"]) {
      expect(parseAmount(bad)).toBeNull();
    }
  });
});

describe("formatMoney", () => {
  it("форматирует с разрядами и копейками", () => {
    expect(plain(formatMoney(123456))).toBe("1 234,56 ₽");
    expect(plain(formatMoney(5))).toBe("0,05 ₽");
    expect(plain(formatMoney(-150000))).toBe("−1 500,00 ₽");
    expect(plain(formatMoney(100, { sign: true }))).toBe("+1,00 ₽");
  });
});

describe("amountToInput", () => {
  it("возвращает значение, которое parseAmount разберёт обратно", () => {
    for (const minor of [1, 10, 99, 100, 123456, 50000]) {
      expect(parseAmount(amountToInput(minor))).toBe(minor);
    }
    expect(amountToInput(50000)).toBe("500");
    expect(amountToInput(1205)).toBe("12,05");
  });
});
