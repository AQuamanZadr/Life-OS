"use client";

import { useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Поиск по задачам"
            placeholder="Поиск по задачам…"
            className="pl-9"
            value={filter.query}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
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
        </div>
      </div>

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
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <DialogContent
          title="Удалить задачу?"
          description={deleting ? `«${deleting.title}» будет удалена.` : undefined}
        >
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (deleting) await deleteTask(deleting.id);
                setDeleting(null);
              }}
            >
              Удалить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TaskRow({
  task,
  today,
  onEdit,
  onDelete,
}: {
  task: Task;
  today: string;
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
