"use client";

import { useState } from "react";
import { FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ListToolbar } from "@/components/list-toolbar";
import { MonthNav } from "@/components/month-nav";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useProjects } from "@/features/projects/use-projects";
import { useTasks } from "@/features/tasks/use-tasks";
import { addDays, formatDateKey, isoWeekday } from "@/lib/dates";
import { monthOf } from "@/lib/months";
import { matchesQuery } from "@/lib/schema";
import { useToday } from "@/lib/use-today";
import { DailyChart } from "./daily-chart";
import { EntryDialog } from "./entry-dialog";
import { deleteEntry } from "./repo";
import type { TimeEntry } from "./schema";
import { dayOf, durationMs, formatDuration, localTime, totalMs, totalsByDay } from "./stats";
import { entryTitle, TimerCard } from "./timer-card";
import { useNow, useTimeEntries } from "./use-time";

export function TimeView() {
  const entries = useTimeEntries();
  const tasks = useTasks();
  const projects = useProjects();
  const today = useToday();
  const now = useNow();
  const [picked, setPicked] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [deleting, setDeleting] = useState<TimeEntry | null>(null);

  if (!entries || !tasks || !projects || today === "" || now === 0) {
    return (
      <>
        <PageHeader title="Время" description="Учёт времени" />
        <Card>
          <p className="p-5 text-sm text-muted-foreground">Загрузка…</p>
        </Card>
      </>
    );
  }

  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const projectTitles = new Map(projects.map((p) => [p.id, p.title]));
  const running = entries.find((e) => e.endedAt === null);
  const month = picked ?? monthOf(today);
  const weekStart = addDays(today, 1 - isoWeekday(today));
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  const monthEntries = entries.filter((e) => monthOf(dayOf(e)) === month);
  const visible = monthEntries
    .filter(
      (e) =>
        (projectFilter === "all" || e.projectId === projectFilter) &&
        matchesQuery(
          query,
          e.note,
          entryTitle(e, taskMap),
          e.projectId ? (projectTitles.get(e.projectId) ?? "") : "",
        ),
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const filtered = query.trim() !== "" || projectFilter !== "all";

  return (
    <>
      <PageHeader title="Время" description="Учёт времени">
        <Button variant="outline" onClick={() => setCreating(true)}>
          <Plus />
          Добавить вручную
        </Button>
      </PageHeader>

      <TimerCard running={running} tasks={tasks} projects={projects} />

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat
          label="Сегодня"
          value={formatDuration(totalMs(entries.filter((e) => dayOf(e) === today), now))}
        />
        <Stat
          label="Эта неделя"
          value={formatDuration(totalMs(entries.filter((e) => dayOf(e) >= weekStart), now))}
        />
        <Stat
          className="col-span-2 sm:col-span-1"
          label="За месяц"
          value={formatDuration(totalMs(monthEntries, now))}
        />
      </div>

      {entries.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Последние 7 дней</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyChart data={totalsByDay(entries, last7, now)} today={today} />
          </CardContent>
        </Card>
      )}

      <MonthNav month={month} currentMonth={monthOf(today)} onChange={setPicked} />

      <ListToolbar query={query} onQueryChange={setQuery} placeholder="Поиск по записям">
        {projects.length > 0 && (
          <Select
            aria-label="Проект"
            className="col-span-2 sm:w-44"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="all">Все проекты</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        )}
      </ListToolbar>

      <Card>
        {visible.length === 0 ? (
          filtered && monthEntries.length > 0 ? (
            <EmptyState text="Ничего не найдено">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setProjectFilter("all");
                }}
              >
                Сбросить фильтры
              </Button>
            </EmptyState>
          ) : (
            <EmptyState
              text={entries.length === 0 ? "Записей пока нет" : "В этом месяце записей нет"}
            />
          )
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((e) => {
              const project = e.projectId ? projectTitles.get(e.projectId) : undefined;
              const day = dayOf(e);
              return (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{entryTitle(e, taskMap)}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {day === today ? "Сегодня" : formatDateKey(day, today)},{" "}
                      {localTime(e.startedAt)}
                      {e.endedAt ? `–${localTime(e.endedAt)}` : " — идёт"}
                      {e.taskId && taskMap.has(e.taskId) && e.note && ` · ${e.note}`}
                    </p>
                    {project && (
                      <Badge className="mt-1 max-w-full">
                        <FolderKanban />
                        <span className="truncate">{project}</span>
                      </Badge>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {formatDuration(durationMs(e, now))}
                  </span>
                  <div className="flex shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Изменить"
                      disabled={e.endedAt === null}
                      title={e.endedAt === null ? "Сначала остановите таймер" : undefined}
                      onClick={() => setEditing(e)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Удалить"
                      onClick={() => setDeleting(e)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <EntryDialog open={creating} onOpenChange={setCreating} tasks={tasks} projects={projects} />
      <EntryDialog
        key={editing?.id}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        entry={editing ?? undefined}
        tasks={tasks}
        projects={projects}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Удалить запись?"
        description={
          deleting
            ? `«${entryTitle(deleting, taskMap)}», ${formatDuration(durationMs(deleting, now))} будет удалена.`
            : undefined
        }
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await deleteEntry(deleting.id);
          setDeleting(null);
        }}
      />
    </>
  );
}
