"use client";

import { useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  FolderKanban,
  Pencil,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { ListToolbar } from "@/components/list-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useGoals } from "@/features/goals/use-goals";
import { useProjects } from "@/features/projects/use-projects";
import { formatDuration, msByTask } from "@/features/time/stats";
import { useTimeEntries } from "@/features/time/use-time";
import { formatDateKey } from "@/lib/dates";
import { useToday } from "@/lib/use-today";
import { cn } from "@/lib/utils";
import {
  defaultTaskFilter,
  filterTasks,
  isOverdue,
  type TaskFilter,
} from "./filter";
import { deleteTask, setTaskDone } from "./repo";
import {
  priorityLabels,
  statusLabels,
  taskPriorities,
  taskStatuses,
  type Task,
} from "./schema";
import { TaskDialog } from "./task-dialog";
import { useTasks } from "./use-tasks";

export function TasksView() {
  const tasks = useTasks();
  const projects = useProjects();
  const goals = useGoals();
  const titles = new Map(
    [...(projects ?? []), ...(goals ?? [])].map((r) => [r.id, r.title]),
  );
  const tracked = msByTask(useTimeEntries() ?? []);
  const [filter, setFilter] = useState<TaskFilter>(defaultTaskFilter);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);

  const today = useToday();
  const visible = tasks ? filterTasks(tasks, filter) : [];
  const filtered =
    filter.query.trim() !== "" ||
    filter.status !== defaultTaskFilter.status ||
    filter.priority !== defaultTaskFilter.priority;

  return (
    <>
      <PageHeader title="Задачи" description="Список дел">
        <Button onClick={() => setCreating(true)}>
          <Plus />
          Новая задача
        </Button>
      </PageHeader>

      <ListToolbar
        query={filter.query}
        onQueryChange={(query) => setFilter({ ...filter, query })}
        placeholder="Поиск по задачам"
      >
          <Select
            aria-label="Статус"
            className="sm:w-44"
            value={filter.status}
            onChange={(e) =>
              setFilter({
                ...filter,
                status: e.target.value as TaskFilter["status"],
              })
            }
          >
            <option value="active">Активные</option>
            <option value="all">Все статусы</option>
            {taskStatuses.map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Приоритет"
            className="sm:w-44"
            value={filter.priority}
            onChange={(e) =>
              setFilter({
                ...filter,
                priority: e.target.value as TaskFilter["priority"],
              })
            }
          >
            <option value="all">Любой приоритет</option>
            {taskPriorities.map((p) => (
              <option key={p} value={p}>
                {priorityLabels[p]}
              </option>
            ))}
          </Select>
      </ListToolbar>

      <Card>
        {tasks === undefined ? (
          <p className="p-5 text-sm text-muted-foreground">Загрузка…</p>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
            <p className="text-sm text-muted-foreground">
              {tasks.length === 0
                ? "Задач пока нет"
                : filtered
                  ? "Ничего не найдено"
                  : "Активных задач нет"}
            </p>
            {filtered && tasks.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilter(defaultTaskFilter)}
              >
                Сбросить фильтры
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
                <Plus />
                Добавить задачу
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                today={today}
                project={task.projectId ? titles.get(task.projectId) : undefined}
                goal={task.goalId ? titles.get(task.goalId) : undefined}
                trackedMs={tracked.get(task.id) ?? 0}
                onEdit={() => setEditing(task)}
                onDelete={() => setDeleting(task)}
              />
            ))}
          </ul>
        )}
      </Card>

      <TaskDialog open={creating} onOpenChange={setCreating} />
      <TaskDialog
        key={editing?.id}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        task={editing ?? undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Удалить задачу?"
        description={deleting ? `«${deleting.title}» будет удалена.` : undefined}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await deleteTask(deleting.id);
          setDeleting(null);
        }}
      />
    </>
  );
}

function TaskRow({
  task,
  today,
  project,
  goal,
  trackedMs,
  onEdit,
  onDelete,
}: {
  task: Task;
  today: string;
  project?: string;
  goal?: string;
  trackedMs: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const done = task.status === "done";
  const overdue = isOverdue(task, today);
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? "Вернуть в работу" : "Отметить выполненной"}
        onClick={() => setTaskDone(task.id, !done)}
        className="mt-0.5 rounded-full text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {done ? (
          <CheckCircle2 className="size-5 text-success" />
        ) : (
          <Circle className="size-5" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium break-words",
            done && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </p>
        {task.notes && (
          <p className="mt-0.5 line-clamp-2 text-sm break-words text-muted-foreground">
            {task.notes}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {task.status === "in_progress" && (
            <Badge variant="primary">{statusLabels.in_progress}</Badge>
          )}
          {task.priority !== "medium" && (
            <Badge variant={task.priority === "high" ? "destructive" : "default"}>
              {priorityLabels[task.priority]} приоритет
            </Badge>
          )}
          {task.dueDate && (
            <Badge variant={overdue ? "destructive" : "default"}>
              <CalendarDays />
              {formatDateKey(task.dueDate, today)}
              {overdue && " · просрочено"}
            </Badge>
          )}
          {trackedMs >= 60_000 && (
            <Badge>
              <Clock />
              {formatDuration(trackedMs)}
            </Badge>
          )}
          {project && (
            <Badge className="max-w-full">
              <FolderKanban />
              <span className="truncate">{project}</span>
            </Badge>
          )}
          {goal && (
            <Badge className="max-w-full">
              <Target />
              <span className="truncate">{goal}</span>
            </Badge>
          )}
        </div>
      </div>
      <div className="flex shrink-0">
        <Button variant="ghost" size="icon" aria-label="Изменить" onClick={onEdit}>
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Удалить" onClick={onDelete}>
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}
