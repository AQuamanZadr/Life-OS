"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { EntityForm } from "@/components/entity-form";
import { BackLink, History, LinkPicker, NotFound, Row2, useRecord, useRouteId } from "@/components/shared";
import { Badge, Button, Card, CardTitle, Modal, PageHeader, Stat, useToast } from "@/components/ui";
import { getDb } from "@/core/db/db";
import { HABIT_TYPE_LABELS } from "@/core/labels";
import { addDays, formatDate, isoWeekday, startOfWeek, weekdayShort } from "@/core/lib/dates";
import { useSettings, useToday } from "@/core/settings";
import { logHabit } from "@/modules/actions";
import { habitTransform, useHabitFields } from "@/modules/fields";
import { computeStreaks, describeSchedule, habitStats, isScheduledOn, isSuccess } from "@/modules/habits/domain";
import { HabitCheck } from "@/modules/habits/HabitCheck";
import { cn } from "@/lib/cn";

const WEEKS = 16;

export default function HabitPage() {
  const id = useRouteId();
  const habit = useRecord("habits", id);
  const today = useToday();
  const settings = useSettings();
  const toast = useToast();
  const fields = useHabitFields();
  const [editing, setEditing] = useState(false);
  const logsRaw = useLiveQuery(() => getDb().habit_logs.where("habit_id").equals(id).toArray(), [id]);
  const logs = useMemo(() => (logsRaw ?? []).filter((l) => !l.deleted_at), [logsRaw]);
  const byDate = useMemo(() => new Map(logs.map((l) => [l.log_date, l])), [logs]);

  if (habit === undefined) return <p className="text-sm text-muted">Загрузка…</p>;
  if (habit === null) return <NotFound backHref="/habits" backLabel="Привычки" />;

  const streak = computeStreaks(habit, logs, today, settings.week_start);
  const month = habitStats(habit, logs, addDays(today, -29), today, settings.week_start);
  const total = habitStats(habit, logs, habit.start_date, today, settings.week_start);
  const gridStart = addDays(startOfWeek(today, 1), -(WEEKS - 1) * 7);
  const unit = streak.unit === "day" ? "дн." : "нед.";

  return (
    <>
      <BackLink href="/habits" label="Привычки" />
      <PageHeader
        title={habit.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge>{HABIT_TYPE_LABELS[habit.habit_type]}</Badge>
            <Badge>{describeSchedule(habit)}</Badge>
            {habit.habit_type !== "boolean" && (
              <Badge tone="primary">
                {habit.habit_type === "limit" ? "не более" : "цель"}: {habit.target_value} {habit.unit}
              </Badge>
            )}
            {!habit.is_active && <Badge tone="warning">приостановлена</Badge>}
          </span>
        }
        actions={
          <Button onClick={() => setEditing(true)}>
            <Pencil size={15} /> Изменить
          </Button>
        }
      />
      <div className="flex flex-col gap-4">
        <Card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Текущая серия" value={`${streak.current} ${unit}`} />
            <Stat label="Лучшая серия" value={`${streak.best} ${unit}`} />
            <Stat label="Регулярность за 30 дней" value={`${month.rate}%`} hint={`${month.completed} из ${month.scheduled}`} />
            <Stat label="За всё время" value={`${total.rate}%`} hint={`${total.completed} из ${total.scheduled}`} />
          </div>
          {isScheduledOn(habit, today) && (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-sm font-medium">Сегодня</span>
              <HabitCheck habit={habit} date={today} log={byDate.get(today)} />
            </div>
          )}
          {habit.description && <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{habit.description}</p>}
        </Card>

        <Card>
          <CardTitle>Календарь активности</CardTitle>
          <div className="overflow-x-auto">
            <div className="inline-grid grid-flow-col grid-rows-7 gap-1" role="grid" aria-label="Календарь выполнения за 16 недель">
              {Array.from({ length: WEEKS * 7 }, (_, i) => {
                const d = addDays(gridStart, i);
                const log = byDate.get(d);
                const future = d > today;
                const planned = isScheduledOn(habit, d);
                const ok = isSuccess(habit, log);
                const label = `${formatDate(d)}: ${ok ? "выполнено" : log?.status === "skipped" ? "пропуск" : log ? `частично (${log.value})` : planned ? "не выполнено" : "не запланировано"}`;
                return (
                  <button
                    key={d}
                    type="button"
                    role="gridcell"
                    title={label}
                    aria-label={label}
                    disabled={future || d < habit.start_date || habit.habit_type !== "boolean"}
                    onClick={() => void logHabit(habit, d, ok ? null : 1).catch((e) => toast(String(e.message ?? e), "error"))}
                    className={cn(
                      "h-5 w-5 rounded-[5px] text-[9px] leading-5",
                      future || d < habit.start_date ? "bg-transparent" : ok ? "bg-success" : log?.status === "skipped" ? "bg-border" : log ? "bg-warning/60" : planned ? "bg-subtle" : "bg-subtle/40",
                      d === today && "ring-2 ring-primary",
                    )}
                  >
                    {i < 7 && <span className="sr-only">{weekdayShort(isoWeekday(d))}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">Зелёный — выполнено, жёлтый — частично, серый — пропуск. {habit.habit_type === "boolean" && "Нажмите на день, чтобы изменить отметку."}</p>
        </Card>

        <Row2>
          <Card>
            <CardTitle>История выполнения</CardTitle>
            {logs.length === 0 ? (
              <p className="text-sm text-muted">Отметок пока нет.</p>
            ) : (
              <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto text-sm">
                {[...logs].sort((a, b) => b.log_date.localeCompare(a.log_date)).slice(0, 60).map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2">
                    <span>{formatDate(l.log_date)}</span>
                    <span className="text-muted">{l.status === "skipped" ? "пропуск" : habit.habit_type === "boolean" ? "выполнено" : `${l.value} ${habit.unit}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <LinkPicker title="Связанные цели" fromType="habit" fromId={habit.id} toType="goal" hrefBase="/goals" reverse />
        </Row2>
        <History table="habits" id={habit.id} />
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Изменить привычку">
        <EntityForm table="habits" fields={fields} row={habit} transform={habitTransform} onCancel={() => setEditing(false)} onDone={() => setEditing(false)} />
      </Modal>
    </>
  );
}
