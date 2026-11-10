"use client";

import { useState } from "react";
import { Check, Flame, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ListToolbar } from "@/components/list-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { addDays, formatDateKey, isoWeekday, toDateKey } from "@/lib/dates";
import { matchesQuery } from "@/lib/schema";
import { useToday } from "@/lib/use-today";
import { cn } from "@/lib/utils";
import { HabitDialog } from "./habit-dialog";
import { deleteHabit, setHabitDone } from "./repo";
import {
  habitStatusLabels,
  habitStatuses,
  scheduleLabel,
  weekdayLabels,
  type Habit,
  type HabitStatus,
} from "./schema";
import { completion, currentStreak } from "./stats";
import { doneDatesByHabit, useHabitLogs, useHabits } from "./use-habits";

const noDates: ReadonlySet<string> = new Set();

export function HabitsView() {
  const habits = useHabits();
  const logs = useHabitLogs();
  const today = useToday();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<HabitStatus>("active");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [deleting, setDeleting] = useState<Habit | null>(null);

  const done = doneDatesByHabit(logs ?? []);
  const visible = (habits ?? [])
    .filter((h) => h.status === status && matchesQuery(query, h.title, h.notes))
    .sort((a, b) => a.title.localeCompare(b.title, "ru"));
  const filtered = query.trim() !== "" || status !== "active";
  const loading = habits === undefined || logs === undefined || today === "";

  return (
    <>
      <PageHeader title="Привычки" description="Ежедневные привычки">
        <Button onClick={() => setCreating(true)}>
          <Plus />
          Новая привычка
        </Button>
      </PageHeader>

      <ListToolbar query={query} onQueryChange={setQuery} placeholder="Поиск по привычкам">
        <Select
          aria-label="Статус"
          className="col-span-2 sm:w-44"
          value={status}
          onChange={(e) => setStatus(e.target.value as HabitStatus)}
        >
          {habitStatuses.map((s) => (
            <option key={s} value={s}>
              {s === "active" ? "Активные" : habitStatusLabels[s]}
            </option>
          ))}
        </Select>
      </ListToolbar>

      <Card>
        {loading ? (
          <p className="p-5 text-sm text-muted-foreground">Загрузка…</p>
        ) : visible.length === 0 ? (
          habits.length === 0 ? (
            <EmptyState text="Привычек пока нет">
              <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
                <Plus />
                Добавить привычку
              </Button>
            </EmptyState>
          ) : filtered ? (
            <EmptyState text="Ничего не найдено">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setStatus("active");
                }}
              >
                Сбросить фильтры
              </Button>
            </EmptyState>
          ) : (
            <EmptyState text="Активных привычек нет" />
          )
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((habit) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                today={today}
                doneDates={done.get(habit.id) ?? noDates}
                onEdit={() => setEditing(habit)}
                onDelete={() => setDeleting(habit)}
              />
            ))}
          </ul>
        )}
      </Card>

      <HabitDialog open={creating} onOpenChange={setCreating} />
      <HabitDialog
        key={editing?.id}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        habit={editing ?? undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Удалить привычку?"
        description={
          deleting
            ? `«${deleting.title}» и её отметки будут удалены. Чтобы сохранить историю, переведите привычку в архив.`
            : undefined
        }
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await deleteHabit(deleting.id);
          setDeleting(null);
        }}
      />
    </>
  );
}

function HabitRow({
  habit,
  today,
  doneDates,
  onEdit,
  onDelete,
}: {
  habit: Habit;
  today: string;
  doneDates: ReadonlySet<string>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const streak = currentStreak(habit.weekdays, doneDates, today);
  const month = completion(
    habit.weekdays,
    doneDates,
    today,
    toDateKey(new Date(habit.createdAt)),
  );
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium break-words">{habit.title}</p>
          {habit.notes && (
            <p className="mt-0.5 line-clamp-2 text-sm break-words text-muted-foreground">
              {habit.notes}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge>{scheduleLabel(habit.weekdays)}</Badge>
            <Badge variant={streak > 0 ? "primary" : "default"}>
              <Flame />
              Серия: {streak} дн.
            </Badge>
            {month.total > 0 && (
              <Badge>
                За 30 дней: {Math.round((month.done / month.total) * 100)}%
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 sm:order-last">
          <Button variant="ghost" size="icon" aria-label="Изменить" onClick={onEdit}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Удалить" onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5 sm:order-last" role="group" aria-label="Последние 7 дней">
        {week.map((day) => {
          const weekday = isoWeekday(day);
          const scheduled = habit.weekdays.includes(weekday);
          const checked = doneDates.has(day);
          const isToday = day === today;
          return (
            <div key={day} className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "text-[11px] leading-none",
                  isToday ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {weekdayLabels[weekday - 1]}
              </span>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                aria-label={`${habit.title}, ${isToday ? "сегодня" : formatDateKey(day, today)}`}
                disabled={!scheduled && !checked}
                onClick={() => setHabitDone(habit.id, day, !checked)}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : scheduled
                      ? "border-border bg-card hover:border-primary"
                      : "border-transparent bg-muted opacity-50",
                  isToday && !checked && scheduled && "border-primary",
                )}
              >
                {checked && <Check className="size-4" />}
              </button>
            </div>
          );
        })}
      </div>
    </li>
  );
}
