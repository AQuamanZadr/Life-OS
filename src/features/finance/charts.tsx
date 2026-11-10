"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/money";
import { categoryLabel } from "./schema";
import { formatMonth, type Totals } from "./stats";

const compact = new Intl.NumberFormat("ru-RU", { notation: "compact" });

// Доходы и расходы по месяцам: две серии, одна ось.
export function MonthlyChart({ data }: { data: ({ month: string } & Totals)[] }) {
  const rows = data.map((d) => ({
    month: formatMonth(d.month, "short"),
    full: formatMonth(d.month),
    income: d.income,
    expense: d.expense,
  }));
  return (
    <>
      <div className="h-56" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <YAxis
              width={44}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickFormatter={(v: number) => compact.format(v / 100)}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              separator=": "
              formatter={(value) => formatMoney(Number(value))}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ""}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontSize: 13,
                color: "var(--foreground)",
              }}
              itemStyle={{ color: "var(--foreground)" }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span style={{ color: "var(--muted-foreground)", fontSize: 13 }}>{value}</span>
              )}
            />
            <Bar
              dataKey="income"
              name="Доходы"
              fill="var(--chart-1)"
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="expense"
              name="Расходы"
              fill="var(--chart-2)"
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Те же данные таблицей — для программ чтения с экрана. */}
      <table className="sr-only">
        <caption>Доходы и расходы по месяцам</caption>
        <thead>
          <tr>
            <th>Месяц</th>
            <th>Доходы</th>
            <th>Расходы</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.full}>
              <td>{r.full}</td>
              <td>{formatMoney(r.income)}</td>
              <td>{formatMoney(r.expense)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// Расходы по категориям: одна серия, поэтому один цвет; значения подписаны.
export function CategoryBars({ data }: { data: { category: string; amount: number }[] }) {
  const max = data[0]?.amount ?? 0;
  const sum = data.reduce((s, d) => s + d.amount, 0);
  return (
    <ul className="flex flex-col gap-3">
      {data.map(({ category, amount }) => (
        <li key={category}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{categoryLabel("expense", category)}</span>
            <span className="shrink-0 tabular-nums">
              {formatMoney(amount)}
              <span className="ml-2 text-muted-foreground">
                {Math.round((amount / sum) * 100)}%
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-chart-1"
              style={{ width: `${Math.max(1, (amount / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
