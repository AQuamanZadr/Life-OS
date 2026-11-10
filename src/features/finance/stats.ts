import type { Transaction } from "./schema";
import { monthOf, shiftMonth } from "@/lib/months";

export { formatMonth, monthOf, shiftMonth } from "@/lib/months";

export type Totals = { income: number; expense: number; balance: number };

export function totals(transactions: Transaction[]): Totals {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.type === "income") income += t.amountMinor;
    else expense += t.amountMinor;
  }
  return { income, expense, balance: income - expense };
}

export const inMonth = (transactions: Transaction[], month: string) =>
  transactions.filter((t) => monthOf(t.date) === month);

// Расходы по категориям, от больших к меньшим.
export function expensesByCategory(
  transactions: Transaction[],
): { category: string; amount: number }[] {
  const sums = new Map<string, number>();
  for (const t of transactions) {
    if (t.type === "expense")
      sums.set(t.category, (sums.get(t.category) ?? 0) + t.amountMinor);
  }
  return [...sums]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

// Итоги по месяцам: `count` месяцев, заканчивая `lastMonth`.
export function monthlyTotals(
  transactions: Transaction[],
  lastMonth: string,
  count: number,
): ({ month: string } & Totals)[] {
  return Array.from({ length: count }, (_, i) => {
    const month = shiftMonth(lastMonth, i - count + 1);
    return { month, ...totals(inMonth(transactions, month)) };
  });
}
