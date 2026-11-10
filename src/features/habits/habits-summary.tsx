"use client";

import { isoWeekday } from "@/lib/dates";
import { useToday } from "@/lib/use-today";
import { doneDatesByHabit, useHabitLogs, useHabits } from "./use-habits";

export function HabitsSummary() {
  const habits = useHabits();
  const logs = useHabitLogs();
  const today = useToday();
  if (habits === undefined || logs === undefined || today === "") return <>&nbsp;</>;
  const active = habits.filter((h) => h.status === "active");
  if (active.length === 0) return <>Пока нет данных</>;
  const planned = active.filter((h) => h.weekdays.includes(isoWeekday(today)));
  const done = doneDatesByHabit(logs);
  const completed = planned.filter((h) => done.get(h.id)?.has(today)).length;
  return (
    <span>
      Сегодня:{" "}
      <b className="font-semibold text-foreground">
        {completed} из {planned.length}
      </b>
    </span>
  );
}
