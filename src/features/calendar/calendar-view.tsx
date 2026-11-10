"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  FolderKanban,
  Pencil,
  Plus,
  Target,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ListToolbar } from "@/components/list-toolbar";
import { MonthNav } from "@/components/month-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useGoals } from "@/features/goals/use-goals";
import { weekdayLabels } from "@/features/habits/schema";
import { useProjects } from "@/features/projects/use-projects";
import { setTaskDone } from "@/features/tasks/repo";
import { useTasks } from "@/features/tasks/use-tasks";
import { formatDateKey, isoWeekday } from "@/lib/dates";
import { monthOf } from "@/lib/months";
import { matchesQuery } from "@/lib/schema";
import { useToday } from "@/lib/use-today";
import { cn } from "@/lib/utils";
import { EventDialog } from "./event-dialog";
import {
  buildItems,
  groupByDate,
  kindLabels,
  monthGrid,
  type CalendarItem,
  type ItemKind,
} from "./items";
import { deleteEvent } from "./repo";
import type { CalendarEvent } from "./schema";
import { useEvents } from "./use-events";

const kindIcons: Record<ItemKind, LucideIcon> = {
  event: CalendarDays,
  task: Circle,
  project: FolderKanban,
  goal: Target,
};
const kindLinks: Partial<Record<ItemKind, string>> = {
  task: "/tasks",
  project: "/projects",
  goal: "/goals",
};

type KindFilter = "all" | "event" | "deadline";

function dayTitle(day: string, today: string): string {
  const text = `${weekdayLabels[isoWeekday(day) - 1]}, ${formatDateKey(day, today)}`;
  return day === today ? `Сегодня, ${formatDateKey(day, today)}` : text;
}

function timeLabel(item: CalendarItem): string {
  if (item.kind !== "event") return kindLabels[item.kind];
  if (!item.time) return "Весь день";
  return item.endTime ? `${item.time}–${item.endTime}` : item.time;
}

export function CalendarView() {
  const events = useEvents();
  const tasks = useTasks();
  const projects = useProjects();
  const goals = useGoals();
  const today = useToday();
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [deleting, setDeleting] = useState<CalendarEvent | null>(null);

  if (!events || !tasks || !projects || !goals || today === "") {
    return (
      <>
        <PageHeader title="Календарь" description="События и планы" />
        <Card>
          <p className="p-5 text-sm text-muted-foreground">Загрузка…</p>
        </Card>
      </>
    );
  }

  const month = pickedMonth ?? monthOf(today);
  const selected = pickedDay ?? today;
  const eventById = new Map(events.map((e) => [e.id, e]));
  const items = buildItems({ events, tasks, projects, goals }).filter(
    (i) => kind === "all" || (kind === "event" ? i.kind === "event" : i.kind !== "event"),
  );
  const byDate = groupByDate(items);
  const searching = query.trim() !== "";
  // При поиске показываем совпадения за всё время, иначе — выбранный день.
  const list = searching
    ? items.filter((i) => matchesQuery(query, i.title, eventById.get(i.id)?.notes ?? ""))
    : (byDate.get(selected) ?? []);

  return (
    <>
      <PageHeader title="Календарь" description="События и планы">
        <Button onClick={() => setCreating(true)}>
          <Plus />
          Новое событие
        </Button>
      </PageHeader>

      <MonthNav
        month={month}
        currentMonth={monthOf(today)}
        onChange={(next) => {
          setPickedMonth(next);
          if (next === null) setPickedDay(null);
        }}
      />

      <Card className="mb-4 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border text-center text-xs text-muted-foreground">
          {weekdayLabels.map((label) => (
            <div key={label} className="py-2">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {monthGrid(month).flat().map((day, index) => {
            const dayItems = byDate.get(day) ?? [];
            const outside = monthOf(day) !== month;
            return (
              <button
                key={day}
                type="button"
                aria-pressed={day === selected}
                aria-label={`${formatDateKey(day, today)}, записей: ${dayItems.length}`}
                onClick={() => {
                  setPickedDay(day);
                  if (outside) setPickedMonth(monthOf(day));
                }}
                className={cn(
                  "flex min-h-14 flex-col items-stretch gap-1 border-border p-1 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent sm:min-h-20 sm:p-1.5",
                  index % 7 !== 6 && "border-r",
                  index >= 7 && "border-t",
                  day === selected && "bg-accent",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center self-center rounded-full text-xs sm:self-start",
                    day === today && "bg-primary font-semibold text-primary-foreground",
                    outside && day !== today && "text-muted-foreground/60",
                  )}
                >
                  {Number(day.slice(8))}
                </span>
                {/* На смартфоне — точки, на широком экране — названия. */}
                <span className="flex justify-center gap-0.5 sm:hidden">
                  {dayItems.slice(0, 3).map((i) => (
                    <span
                      key={i.kind + i.id}
                      className={cn(
                        "size-1.5 rounded-full",
                        i.kind === "event" ? "bg-primary" : "bg-muted-foreground/50",
                      )}
                    />
                  ))}
                </span>
                <span className="hidden flex-col gap-0.5 sm:flex">
                  {dayItems.slice(0, 2).map((i) => (
                    <span
                      key={i.kind + i.id}
                      className={cn(
                        "truncate rounded px-1 text-[11px] leading-4",
                        i.kind === "event" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                        i.done && "line-through",
                      )}
                    >
                      {i.time && `${i.time} `}
                      {i.title}
                    </span>
                  ))}
                  {dayItems.length > 2 && (
                    <span className="px-1 text-[11px] leading-4 text-muted-foreground">
                      ещё {dayItems.length - 2}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <ListToolbar query={query} onQueryChange={setQuery} placeholder="Поиск по календарю">
        <Select
          aria-label="Показывать"
          className="col-span-2 sm:w-44"
          value={kind}
          onChange={(e) => setKind(e.target.value as KindFilter)}
        >
          <option value="all">Всё</option>
          <option value="event">Только события</option>
          <option value="deadline">Только сроки</option>
        </Select>
      </ListToolbar>

      <h2 className="mb-2 text-sm font-semibold">
        {searching ? `Найдено: ${list.length}` : dayTitle(selected, today)}
      </h2>
      <Card>
        {list.length === 0 ? (
          <EmptyState text={searching ? "Ничего не найдено" : "На этот день ничего нет"}>
            {!searching && (
              <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
                <Plus />
                Добавить событие
              </Button>
            )}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((item) => {
              const Icon = kindIcons[item.kind];
              const event = item.kind === "event" ? eventById.get(item.id) : undefined;
              const link = kindLinks[item.kind];
              return (
                <li key={item.kind + item.id} className="flex items-center gap-3 px-4 py-3">
                  {item.kind === "task" ? (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={item.done}
                      aria-label={item.done ? "Вернуть в работу" : "Отметить выполненной"}
                      onClick={() => setTaskDone(item.id, !item.done)}
                      className="rounded-full text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      {item.done ? (
                        <CheckCircle2 className="size-5 text-success" />
                      ) : (
                        <Circle className="size-5" />
                      )}
                    </button>
                  ) : (
                    <Icon
                      className={cn(
                        "size-5 shrink-0",
                        item.kind === "event" ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-sm font-medium",
                        item.done && "text-muted-foreground line-through",
                      )}
                    >
                      {item.title}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {searching && `${formatDateKey(item.date, today)} · `}
                      {timeLabel(item)}
                      {event?.notes && ` · ${event.notes}`}
                    </p>
                  </div>
                  {event ? (
                    <div className="flex shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Изменить"
                        onClick={() => setEditing(event)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Удалить"
                        onClick={() => setDeleting(event)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ) : (
                    link && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={link}>Открыть</Link>
                      </Button>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <EventDialog
        key={`new-${selected}`}
        open={creating}
        onOpenChange={setCreating}
        date={selected}
      />
      <EventDialog
        key={editing?.id}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        event={editing ?? undefined}
        date={selected}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Удалить событие?"
        description={deleting ? `«${deleting.title}» будет удалено.` : undefined}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await deleteEvent(deleting.id);
          setDeleting(null);
        }}
      />
    </>
  );
}
