"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { weekdayLabels } from "@/features/habits/schema";
import { formatDateKey, isoWeekday } from "@/lib/dates";
import { formatDuration } from "./stats";

// Часы по дням: одна серия — один цвет, без легенды.
export function DailyChart({
  data,
  today,
}: {
  data: { day: string; ms: number }[];
  today: string;
}) {
  const rows = data.map((d) => ({
    label: weekdayLabels[isoWeekday(d.day) - 1],
    full: d.day === today ? "Сегодня" : formatDateKey(d.day, today),
    hours: d.ms / 3_600_000,
    ms: d.ms,
  }));
  return (
    <>
      <div className="h-48" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <YAxis
              width={36}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickFormatter={(v: number) => `${v} ч`}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              separator=": "
              formatter={(_, __, item) => [formatDuration(item.payload.ms), "Записано"]}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ""}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontSize: 13,
                color: "var(--foreground)",
              }}
              itemStyle={{ color: "var(--foreground)" }}
            />
            <Bar
              dataKey="hours"
              fill="var(--chart-1)"
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Записанное время по дням</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.full}>
              <th>{r.full}</th>
              <td>{formatDuration(r.ms)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
