"use client";

import { formatMoney } from "@/lib/money";
import { useToday } from "@/lib/use-today";
import { inMonth, monthOf, totals } from "./stats";
import { useTransactions } from "./use-transactions";

export function FinanceSummary() {
  const all = useTransactions();
  const today = useToday();
  if (all === undefined || today === "") return <>&nbsp;</>;
  if (all.length === 0) return <>Пока нет данных</>;
  const sum = totals(inMonth(all, monthOf(today)));
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1">
      <span>
        Баланс за месяц:{" "}
        <b className="font-semibold text-foreground">
          {formatMoney(sum.balance, { sign: true })}
        </b>
      </span>
      <span>Расходы: {formatMoney(sum.expense)}</span>
    </span>
  );
}
