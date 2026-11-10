import { describe, expect, it } from "vitest";
import { make } from "@/test/factories";
import { normalizeAmount } from "@/core/lib/money";
import { accountBalance, budgetPeriod, budgetUsage, sumByCategory, totalsByCurrency } from "./domain";

const acc = make("accounts", { name: "Карта", currency: "KZT", opening_balance: "1000.00" });
const acc2 = make("accounts", { name: "USD", currency: "USD", opening_balance: "0" });
const food = "22222222-2222-4222-8222-222222222222";
const tx = (data: Record<string, unknown>) => make("transactions", { account_id: acc.id, currency: "KZT", transaction_date: "2026-11-10", ...data });
const n = (s: string) => normalizeAmount(s, 2);

describe("финансы: баланс", () => {
  it("учитывает доходы, расходы и переводы ровно один раз", () => {
    const list = [
      tx({ transaction_type: "income", amount: "500.10" }),
      tx({ transaction_type: "expense", amount: "0.20" }),
      tx({ transaction_type: "expense", amount: "0.10" }),
      tx({ transaction_type: "transfer", amount: "470", to_account_id: acc2.id, to_amount: "1.00", currency: "KZT" }),
      tx({ transaction_type: "expense", amount: "999", deleted_at: "2026-11-10T00:00:00Z" }),
    ];
    expect(n(accountBalance(acc, list))).toBe("1029.80");
    expect(n(accountBalance(acc2, list))).toBe("1.00");
  });

  it("баланс на дату", () => {
    const list = [tx({ transaction_type: "expense", amount: "100", transaction_date: "2026-12-31" }), tx({ transaction_type: "expense", amount: "50", transaction_date: "2027-01-01" })];
    expect(n(accountBalance(acc, list, "2026-12-31"))).toBe("900.00");
    expect(n(accountBalance(acc, list, "2027-01-01"))).toBe("850.00");
    expect(n(accountBalance(acc, []))).toBe("1000.00");
  });

  it("очень большие суммы без потери точности", () => {
    const list = [tx({ transaction_type: "income", amount: "9007199254740993.01" }), tx({ transaction_type: "expense", amount: "0.02" })];
    expect(n(accountBalance({ id: acc.id, opening_balance: "0" }, list))).toBe("9007199254740992.99");
  });

  it("отклоняет нулевые и отрицательные суммы операций", () => {
    expect(() => tx({ transaction_type: "expense", amount: "0" })).toThrow();
    expect(() => tx({ transaction_type: "expense", amount: "0.00" })).toThrow();
    expect(() => tx({ transaction_type: "expense", amount: "-5" })).toThrow();
    expect(() => tx({ transaction_type: "expense", amount: "abc" })).toThrow();
    expect(() => tx({ transaction_type: "transfer", amount: "5" })).toThrow();
    expect(() => tx({ transaction_type: "transfer", amount: "5", to_account_id: acc.id })).toThrow();
    expect(() => tx({ transaction_type: "expense", amount: "5", transaction_date: "2026-02-30" })).toThrow();
  });
});

describe("финансы: статистика", () => {
  const list = [
    tx({ transaction_type: "income", amount: "1000" }),
    tx({ transaction_type: "expense", amount: "300.50", category_id: food }),
    tx({ transaction_type: "expense", amount: "99.50", category_id: food, transaction_date: "2026-11-30" }),
    tx({ transaction_type: "expense", amount: "10", transaction_date: "2026-12-01" }),
    tx({ transaction_type: "expense", amount: "7", currency: "USD", account_id: acc2.id }),
    tx({ transaction_type: "transfer", amount: "100", to_account_id: acc2.id }),
  ];
  const november = { from: "2026-11-01", to: "2026-11-30" };

  it("итоги по валютам за период, переводы не считаются расходом", () => {
    const totals = totalsByCurrency(list, november);
    expect(n(totals.get("KZT")!.income)).toBe("1000.00");
    expect(n(totals.get("KZT")!.expense)).toBe("400.00");
    expect(n(totals.get("KZT")!.net)).toBe("600.00");
    expect(n(totals.get("USD")!.expense)).toBe("7.00");
    expect(totalsByCurrency([], november).size).toBe(0);
  });

  it("суммы по категориям", () => {
    const m = sumByCategory(list, november, "expense", "KZT");
    expect(n(m.get(food)!)).toBe("400.00");
    expect(m.size).toBe(1);
  });

  it("бюджет: период от даты начала, использование и превышение", () => {
    const b = make("budgets", { category_id: food, amount: "350", currency: "KZT", period_type: "monthly", start_date: "2026-01-31" });
    expect(budgetPeriod(b, "2026-02-27")).toEqual({ from: "2026-01-31", to: "2026-02-27" });
    expect(budgetPeriod(b, "2026-02-28")).toEqual({ from: "2026-02-28", to: "2026-03-30" });
    expect(budgetPeriod(b, "2026-01-01")).toBeNull();
    const b2 = make("budgets", { category_id: food, amount: "350", currency: "KZT", period_type: "monthly", start_date: "2026-11-01" });
    const usage = budgetUsage(b2, list, "2026-11-15")!;
    expect(n(usage.spent)).toBe("400.00");
    expect(n(usage.remaining)).toBe("-50.00");
    expect(usage.exceeded).toBe(true);
    expect(usage.percent).toBeCloseTo(114.28, 1);
    const yearly = make("budgets", { amount: "1", currency: "KZT", period_type: "yearly", start_date: "2026-03-01" });
    expect(budgetPeriod(yearly, "2027-02-28")).toEqual({ from: "2026-03-01", to: "2027-02-28" });
  });
});
