import { describe, expect, it } from "vitest";
import { transactionInputSchema, type Transaction } from "./schema";
import {
  expensesByCategory,
  formatMonth,
  inMonth,
  monthlyTotals,
  shiftMonth,
  totals,
} from "./stats";

let n = 0;
function tx(over: Partial<Transaction>): Transaction {
  return {
    id: String(++n),
    type: "expense",
    amountMinor: 100,
    date: "2026-11-10",
    category: "food",
    note: "",
    createdAt: "2026-11-10T10:00:00.000Z",
    updatedAt: "2026-11-10T10:00:00.000Z",
    deletedAt: null,
    ...over,
  };
}

describe("месяцы", () => {
  it("shiftMonth переходит через год", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-11", -5)).toBe("2026-06");
  });
  it("formatMonth", () => {
    expect(formatMonth("2026-11")).toBe("Ноябрь 2026");
    expect(formatMonth("2026-08", "short")).toBe("Авг");
  });
});

describe("итоги", () => {
  const list = [
    tx({ type: "income", amountMinor: 10_000_000, category: "salary" }),
    tx({ amountMinor: 10 }), // 0,10
    tx({ amountMinor: 20 }), // 0,20
    tx({ amountMinor: 150_000, category: "transport" }),
    tx({ amountMinor: 99_999, date: "2026-10-31" }),
  ];

  it("считает доходы, расходы и баланс за месяц точно", () => {
    expect(totals(inMonth(list, "2026-11"))).toEqual({
      income: 10_000_000,
      expense: 150_030,
      balance: 9_849_970,
    });
  });

  it("группирует расходы по категориям по убыванию", () => {
    expect(expensesByCategory(inMonth(list, "2026-11"))).toEqual([
      { category: "transport", amount: 150_000 },
      { category: "food", amount: 30 },
    ]);
  });

  it("строит ряд по месяцам, включая пустые", () => {
    const rows = monthlyTotals(list, "2026-11", 3);
    expect(rows.map((r) => r.month)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(rows[0]).toMatchObject({ income: 0, expense: 0, balance: 0 });
    expect(rows[1].expense).toBe(99_999);
  });
});

describe("схема операции", () => {
  const base = { type: "expense", amountMinor: 100, date: "2026-11-10", category: "food", note: "" };
  it("категория должна соответствовать типу", () => {
    expect(transactionInputSchema.safeParse(base).success).toBe(true);
    expect(transactionInputSchema.safeParse({ ...base, category: "salary" }).success).toBe(false);
    expect(
      transactionInputSchema.safeParse({ ...base, type: "income", category: "salary" }).success,
    ).toBe(true);
  });
  it("сумма — положительное целое число копеек", () => {
    for (const amountMinor of [0, -1, 1.5]) {
      expect(transactionInputSchema.safeParse({ ...base, amountMinor }).success).toBe(false);
    }
  });
});
