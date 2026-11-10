"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Flame } from "lucide-react";
import { useMemo, useState } from "react";
import { CrudList } from "@/components/crud-list";
import { Badge, Button, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { getDb } from "@/core/db/db";
import { HABIT_TYPE_LABELS } from "@/core/labels";
import { addDays, formatDate } from "@/core/lib/dates";
import { useSettings, useToday } from "@/core/settings";
import { habitTransform, useHabitFields } from "@/modules/fields";
import { computeStreaks, describeSchedule, isScheduledOn } from "@/modules/habits/domain";
import { HabitCheck } from "@/modules/habits/HabitCheck";

export default function HabitsPage() {
  const today = useToday();
  const settings = useSettings();
  const fields = useHabitFields();
  const [offset, setOffset] = useState(0);
  const date = addDays(today, offset);
  const habits = useLiveQuery(() => getDb().habits.toArray(), []);
  const logs = useLiveQuery(() => getDb().habit_logs.toArray(), []);
  const byHabit = useMemo(() => {
    const m = new Map<string, NonNullable<typeof logs>>();
    for (const l of logs ?? []) m.set(l.habit_id, [...(m.get(l.habit_id) ?? []), l]);
    return m;
  }, [logs]);
  const scheduled = (habits ?? []).filter((h) => !h.deleted_at && !h.archived_at && h.is_active && isScheduledOn(h, date)).sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <>
      <PageHeader title="Привычки" subtitle="Ежедневные отметки, серии и регулярность" />
      <Card className="mb-5">
        <CardTitle
          action={
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Предыдущий день" onClick={() => setOffset(offset - 1)}>
                <ChevronLeft size={18} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOffset(0)} disabled={offset === 0}>
                Сегодня
              </Button>
              <Button variant="ghost" size="icon" aria-label="Следующий день" onClick={() => setOffset(offset + 1)} disabled={offset >= 0}>
                <ChevronRight size={18} />
              </Button>
            </div>
          }
        >
          {offset === 0 ? "Сегодня" : formatDate(date, { weekday: true })}
        </CardTitle>
        {habits && scheduled.length === 0 ? (
          <EmptyState title="На этот день привычек нет" hint="Создайте привычку — она появится здесь в дни по расписанию." />
        ) : (
          <ul className="flex flex-col divide-y divide-border" aria-label="Привычки на день">
            {scheduled.map((h) => {
              const own = byHabit.get(h.id) ?? [];
              const log = own.find((l) => l.log_date === date && !l.deleted_at);
              const streak = computeStreaks(h, own, today, settings.week_start);
              return (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2.5" data-testid="habit-today">
                  <div className="min-w-0">
                    <Link href={`/habits/${h.id}`} className="font-medium hover:underline">
                      {h.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span>{describeSchedule(h)}</span>
                      {log && h.habit_type !== "boolean" && (
                        <span>
                          сегодня: {log.value} {h.unit}
                        </span>
                      )}
                      {log?.status === "skipped" && <Badge>пропуск</Badge>}
                      {streak.current > 0 && (
                        <span className="flex items-center gap-0.5 text-warning" title="Текущая серия">
                          <Flame size={13} /> {streak.current} {streak.unit === "day" ? "дн." : "нед."}
                        </span>
                      )}
                    </div>
                  </div>
                  <HabitCheck habit={h} date={date} log={log} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <h2 className="mb-2 text-lg font-semibold">Все привычки</h2>
      <CrudList
        table="habits"
        module="habits"
        fields={fields}
        transform={habitTransform}
        defaults={{ habit_type: "boolean", frequency: "daily", start_date: today, is_active: true, schedule_config: {} }}
        newHref="/habits/new"
        href={(h) => `/habits/${h.id}`}
        labels={{ create: "Создать привычку", edit: "Изменить привычку", empty: "Привычек пока нет", emptyHint: "Начните с одной простой привычки." }}
        filters={[{ key: "habit_type", label: "Тип", options: Object.entries(HABIT_TYPE_LABELS).map(([value, label]) => ({ value, label })) }]}
        sorts={[
          { key: "created", label: "По дате создания", compare: (a, b) => a.created_at.localeCompare(b.created_at) },
          { key: "title", label: "По названию", compare: (a, b) => a.title.localeCompare(b.title, "ru") },
        ]}
        render={(h) => (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{h.title}</span>
            <Badge>{describeSchedule(h)}</Badge>
            {!h.is_active && <Badge tone="warning">приостановлена</Badge>}
          </div>
        )}
      />
    </>
  );
}
