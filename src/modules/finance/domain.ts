import { addDays, addMonths, addYears, inRange, type DateRange, type DateStr } from "@/core/lib/dates";
import { fromMinor, MAX_DECIMALS, toMinor } from "@/core/lib/money";
import type { Account, Budget, Transaction } from "@/core/db/schema";

// Все суммы считаются в BigInt с максимальной точностью (8 знаков), затем
// форматируются под конкретную валюту.
const D = MAX_DECIMALS;
const m = (amount: string) => toMinor(amount, D);

function live(t: Transaction): boolean {
  return !t.deleted_at;
}

/** Влияние операции на счёт в минимальных единицах. */
function effect(t: Transaction, accountId: string): bigint {
  let delta = 0n;
  if (t.account_id === accountId) {
    if (t.transaction_type === "income") delta += m(t.amount);
    else delta -= m(t.amount);
  }
  if (t.transaction_type === "transfer" && t.to_account_id === accountId) delta += m(t.to_amount ?? t.amount);
  return delta;
}

/** Баланс счёта: начальный остаток + все неудалённые операции (на дату включительно). */
export function accountBalance(account: Pick<Account, "id" | "opening_balance">, transactions: Transaction[], asOf?: DateStr): string {
  let total = m(account.opening_balance);
  for (const t of transactions) {
    if (!live(t)) continue;
    if (asOf && t.transaction_date > asOf) continue;
    total += effect(t, account.id);
  }
  return fromMinor(total, D);
}

export interface CurrencyTotals {
  income: string;
  expense: string;
  /** income − expense */
  net: string;
}

/** Доходы и расходы за период по валютам. Переводы между счетами не учитываются. */
export function totalsByCurrency(transactions: Transaction[], range: DateRange): Map<string, CurrencyTotals> {
  const acc = new Map<string, { income: bigint; expense: bigint }>();
  for (const t of transactions) {
    if (!live(t) || t.transaction_type === "transfer" || !inRange(t.transaction_date, range)) continue;
    const cur = acc.get(t.currency) ?? { income: 0n, expense: 0n };
    if (t.transaction_type === "income") cur.income += m(t.amount);
    else cur.expense += m(t.amount);
    acc.set(t.currency, cur);
  }
  const out = new Map<string, CurrencyTotals>();
  for (const [code, v] of acc) out.set(code, { income: fromMinor(v.income, D), expense: fromMinor(v.expense, D), net: fromMinor(v.income - v.expense, D) });
  return out;
}

/** Сумма по категориям за период для одного типа операций и одной валюты. */
export function sumByCategory(transactions: Transaction[], range: DateRange, type: "income" | "expense", currency: string): Map<string, string> {
  const acc = new Map<string, bigint>();
  for (const t of transactions) {
    if (!live(t) || t.transaction_type !== type || t.currency !== currency || !inRange(t.transaction_date, range)) continue;
    const key = t.category_id ?? "";
    acc.set(key, (acc.get(key) ?? 0n) + m(t.amount));
  }
  return new Map([...acc].map(([k, v]) => [k, fromMinor(v, D)]));
}

/** Текущий период бюджета, содержащий дату. null — бюджет в эту дату не действует. */
export function budgetPeriod(budget: Pick<Budget, "period_type" | "start_date" | "end_date">, date: DateStr): DateRange | null {
  if (date < budget.start_date) return null;
  if (budget.end_date && date > budget.end_date) return null;
  if (budget.period_type === "custom") return { from: budget.start_date, to: budget.end_date ?? date };
  const step = (from: DateStr, k: number): DateStr =>
    budget.period_type === "weekly" ? addDays(from, 7 * k) : budget.period_type === "monthly" ? addMonths(from, k) : addYears(from, k);
  // Периоды отсчитываются от даты начала бюджета, чтобы не накапливать сдвиг на концах месяцев.
  let k = 0;
  while (step(budget.start_date, k + 1) <= date && k < 5000) k++;
  const from = step(budget.start_date, k);
  let to = addDays(step(budget.start_date, k + 1), -1);
  if (budget.end_date && to > budget.end_date) to = budget.end_date;
  return { from, to };
}

export interface BudgetUsage {
  period: DateRange;
  spent: string;
  remaining: string;
  /** Процент использования (может превышать 100). */
  percent: number;
  exceeded: boolean;
}

export function budgetUsage(budget: Budget, transactions: Transaction[], date: DateStr): BudgetUsage | null {
  const period = budgetPeriod(budget, date);
  if (!period) return null;
  let spent = 0n;
  for (const t of transactions) {
    if (!live(t) || t.transaction_type !== "expense" || t.currency !== budget.currency) continue;
    if (budget.category_id && t.category_id !== budget.category_id) continue;
    if (!inRange(t.transaction_date, period)) continue;
    spent += m(t.amount);
  }
  const limit = m(budget.amount);
  return {
    period,
    spent: fromMinor(spent, D),
    remaining: fromMinor(limit - spent, D),
    percent: limit === 0n ? 0 : Number((spent * 10000n) / limit) / 100,
    exceeded: spent > limit,
  };
}
