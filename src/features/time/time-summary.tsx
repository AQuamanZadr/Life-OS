"use client";

import { useToday } from "@/lib/use-today";
import { dayOf, formatDuration, totalMs } from "./stats";
import { useNow, useTimeEntries } from "./use-time";

export function TimeSummary() {
  const entries = useTimeEntries();
  const today = useToday();
  const now = useNow();
  if (entries === undefined || today === "" || now === 0) return <>&nbsp;</>;
  if (entries.length === 0) return <>Пока нет данных</>;
  const running = entries.some((e) => e.endedAt === null);
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1">
      <span>
        Сегодня:{" "}
        <b className="font-semibold text-foreground">
          {formatDuration(totalMs(entries.filter((e) => dayOf(e) === today), now))}
        </b>
      </span>
      {running && <span className="text-primary">Идёт таймер</span>}
    </span>
  );
}
