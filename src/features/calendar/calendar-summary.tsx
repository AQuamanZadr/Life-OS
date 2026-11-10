"use client";

import { useToday } from "@/lib/use-today";
import { useEvents } from "./use-events";

export function CalendarSummary() {
  const events = useEvents();
  const today = useToday();
  if (events === undefined || today === "") return <>&nbsp;</>;
  if (events.length === 0) return <>Пока нет данных</>;
  const todays = events.filter((e) => e.date === today).length;
  const next = events
    .filter((e) => e.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1">
      <span>
        Сегодня событий: <b className="font-semibold text-foreground">{todays}</b>
      </span>
      {next && <span className="truncate">Дальше: {next.title}</span>}
    </span>
  );
}
