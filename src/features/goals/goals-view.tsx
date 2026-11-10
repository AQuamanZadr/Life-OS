"use client";

import { useState } from "react";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ListToolbar } from "@/components/list-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { useProjects } from "@/features/projects/use-projects";
import { useTasks } from "@/features/tasks/use-tasks";
import { formatDateKey } from "@/lib/dates";
import { matchesQuery } from "@/lib/schema";
import { useToday } from "@/lib/use-today";
import { GoalDialog } from "./goal-dialog";
import { deleteGoal } from "./repo";
import { goalStatusLabels, goalStatuses, type Goal, type GoalStatus } from "./schema";
import { useGoals } from "./use-goals";

type StatusFilter = GoalStatus | "all";

export function GoalsView() {
  const goals = useGoals();
  const projects = useProjects() ?? [];
  const tasks = useTasks() ?? [];
  const today = useToday();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState<Goal | null>(null);

  const visible = (goals ?? [])
    .filter(
      (g) =>
        (status === "all" || g.status === status) &&
        matchesQuery(query, g.title, g.notes),
    )
    .sort((a, b) => a.title.localeCompare(b.title, "ru"));
  const filtered = query.trim() !== "" || status !== "active";

  return (
    <>
      <PageHeader title="Цели" description="Цели и прогресс">
        <Button onClick={() => setCreating(true)}>
          <Plus />
          Новая цель
        </Button>
      </PageHeader>

      <ListToolbar query={query} onQueryChange={setQuery} placeholder="Поиск по целям">
        <Select
          aria-label="Статус"
          className="col-span-2 sm:w-44"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="all">Все статусы</option>
          {goalStatuses.map((s) => (
            <option key={s} value={s}>
              {goalStatusLabels[s]}
            </option>
          ))}
        </Select>
      </ListToolbar>

      <Card>
        {goals === undefined ? (
          <p className="p-5 text-sm text-muted-foreground">Загрузка…</p>
        ) : visible.length === 0 ? (
          goals.length === 0 ? (
            <EmptyState text="Целей пока нет">
              <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
                <Plus />
                Добавить цель
              </Button>
            </EmptyState>
          ) : (
            <EmptyState text={filtered ? "Ничего не найдено" : "Целей в работе нет"}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setStatus(filtered ? "active" : "all");
                }}
              >
                {filtered ? "Сбросить фильтры" : "Показать все"}
              </Button>
            </EmptyState>
          )
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((goal) => {
              const projectCount = projects.filter((p) => p.goalId === goal.id).length;
              const taskCount = tasks.filter((t) => t.goalId === goal.id).length;
              const overdue =
                goal.status === "active" &&
                goal.targetDate !== null &&
                today !== "" &&
                goal.targetDate < today;
              return (
                <li key={goal.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">{goal.title}</p>
                    {goal.notes && (
                      <p className="mt-0.5 line-clamp-2 text-sm break-words text-muted-foreground">
                        {goal.notes}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge
                        variant={
                          goal.status === "done"
                            ? "success"
                            : goal.status === "active"
                              ? "primary"
                              : "default"
                        }
                      >
                        {goalStatusLabels[goal.status]}
                      </Badge>
                      {goal.targetDate && (
                        <Badge variant={overdue ? "destructive" : "default"}>
                          <CalendarDays />
                          {formatDateKey(goal.targetDate, today)}
                          {overdue && " · просрочено"}
                        </Badge>
                      )}
                      {projectCount > 0 && <Badge>Проектов: {projectCount}</Badge>}
                      {taskCount > 0 && <Badge>Задач: {taskCount}</Badge>}
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="w-9 text-xs text-muted-foreground tabular-nums">
                        {goal.progress}%
                      </span>
                      <Progress
                        value={goal.progress}
                        label="Прогресс цели"
                        className="max-w-48 flex-1"
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Изменить"
                      onClick={() => setEditing(goal)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Удалить"
                      onClick={() => setDeleting(goal)}
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

      <GoalDialog open={creating} onOpenChange={setCreating} />
      <GoalDialog
        key={editing?.id}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        goal={editing ?? undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Удалить цель?"
        description={
          deleting
            ? `«${deleting.title}» будет удалена. Её проекты и задачи останутся, но без цели.`
            : undefined
        }
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await deleteGoal(deleting.id);
          setDeleting(null);
        }}
      />
    </>
  );
}
