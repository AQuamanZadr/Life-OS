"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { Repeat } from "lucide-react";
import { useMemo, useState } from "react";
import { CrudList } from "@/components/crud-list";
import { DueBadge, PriorityBadge } from "@/components/shared";
import { Badge, Card, PageHeader, Select, Tabs, useToast } from "@/components/ui";
import { getDb } from "@/core/db/db";
import type { Task } from "@/core/db/schema";
import { options, PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/core/labels";
import { useCategories, useToday } from "@/core/settings";
import { setTaskStatus } from "@/modules/actions";
import { TASK_DEFAULTS, useTaskFields } from "@/modules/fields";
import { compareTasks, isTaskOverdue, matchesView, type TaskView } from "@/modules/tasks/domain";
import { cn } from "@/lib/cn";

type View = TaskView | "kanban";

const VIEWS: { value: View; label: string }[] = [
  { value: "all", label: "Список" },
  { value: "kanban", label: "Kanban" },
  { value: "today", label: "Сегодня" },
  { value: "upcoming", label: "Предстоящие" },
  { value: "overdue", label: "Просроченные" },
  { value: "done", label: "Завершённые" },
];

function Kanban({ tasks, today }: { tasks: Task[]; today: string }) {
  const toast = useToast();
  const [dragId, setDragId] = useState<string | null>(null);
  const move = (task: Task, status: Task["status"]) => setTaskStatus(task, status).catch((e) => toast(e instanceof Error ? e.message : "Ошибка", "error"));
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-4" aria-label="Kanban-доска">
      {(Object.keys(TASK_STATUS_LABELS) as Task["status"][]).map((status) => {
        const column = tasks.filter((t) => t.status === status).sort(compareTasks);
        return (
          <section
            key={status}
            aria-label={TASK_STATUS_LABELS[status]}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              const task = tasks.find((t) => t.id === dragId);
              if (task && task.status !== status) void move(task, status);
              setDragId(null);
            }}
            className="flex min-h-32 flex-col gap-2 rounded-xl bg-subtle p-2"
          >
            <h3 className="flex items-center justify-between px-1 text-sm font-semibold">
              {TASK_STATUS_LABELS[status]} <span className="text-xs text-muted">{column.length}</span>
            </h3>
            {column.slice(0, 100).map((t) => (
              <Card key={t.id} draggable onDragStart={() => setDragId(t.id)} className="cursor-grab p-3">
                <Link href={`/tasks/${t.id}`} className="text-sm font-medium hover:underline">
                  {t.title}
                </Link>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <PriorityBadge priority={t.priority} />
                  <DueBadge date={t.due_date} today={today} done={status === "done" || status === "cancelled"} />
                </div>
                <Select aria-label={`Статус задачи ${t.title}`} className="mt-2 h-8 text-xs" value={t.status} onChange={(e) => void move(t, e.target.value as Task["status"])}>
                  {options(TASK_STATUS_LABELS).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Card>
            ))}
          </section>
        );
      })}
    </div>
  );
}

export default function TasksPage() {
  const today = useToday();
  const toast = useToast();
  const fields = useTaskFields();
  const [view, setView] = useState<View>("all");
  const tasks = useLiveQuery(() => getDb().tasks.toArray(), []);
  const projects = useLiveQuery(() => getDb().projects.toArray(), []);
  const categories = useCategories("task");
  const live = useMemo(() => (tasks ?? []).filter((t) => !t.deleted_at && !t.archived_at), [tasks]);
  const count = (v: TaskView) => live.filter((t) => matchesView(t, v, today)).length;
  const projectName = (id: string | null) => projects?.find((p) => p.id === id)?.title;

  return (
    <>
      <PageHeader title="Задачи" subtitle="Повседневные дела, сроки и приоритеты" />
      <div className="mb-4">
        <Tabs label="Представление задач" value={view} onChange={setView} options={VIEWS.map((v) => ({ ...v, count: v.value === "today" || v.value === "overdue" ? count(v.value) : undefined }))} />
      </div>
      {view === "kanban" ? (
        <Kanban tasks={live} today={today} />
      ) : (
        <CrudList
          key={view}
          table="tasks"
          module="tasks"
          fields={fields}
          defaults={{ ...TASK_DEFAULTS, due_date: view === "today" ? today : null }}
          where={(t) => !!t.deleted_at || !!t.archived_at || matchesView(t, view, today)}
          href={(t) => `/tasks/${t.id}`}
          labels={{ create: "Добавить задачу", edit: "Изменить задачу", empty: view === "all" ? "Задач пока нет" : "Здесь пусто", emptyHint: view === "all" ? "Добавьте первую задачу." : undefined }}
          filters={[
            { key: "priority", label: "Приоритет", options: options(PRIORITY_LABELS) },
            { key: "status", label: "Статус", options: options(TASK_STATUS_LABELS) },
            { key: "project_id", label: "Проект", options: (projects ?? []).filter((p) => !p.deleted_at).map((p) => ({ value: p.id, label: p.title })) },
            { key: "category_id", label: "Категория", options: categories.map((c) => ({ value: c.id, label: c.name })) },
          ]}
          dateKey="due_date"
          sorts={[
            { key: "due", label: "По сроку", compare: compareTasks },
            { key: "created", label: "Сначала новые", compare: (a, b) => b.created_at.localeCompare(a.created_at) },
            { key: "title", label: "По названию", compare: (a, b) => a.title.localeCompare(b.title, "ru") },
          ]}
          leading={(t) => (
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-primary"
              aria-label={`${t.status === "done" ? "Вернуть в работу" : "Выполнить"}: ${t.title}`}
              checked={t.status === "done"}
              onChange={() => void setTaskStatus(t, t.status === "done" ? "todo" : "done").catch((e) => toast(e instanceof Error ? e.message : "Ошибка", "error"))}
            />
          )}
          render={(t) => (
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("font-medium", t.status === "done" && "text-muted line-through")}>{t.title}</span>
              {t.status === "in_progress" && <Badge tone="primary">в работе</Badge>}
              {t.status === "cancelled" && <Badge>отменена</Badge>}
              <PriorityBadge priority={t.priority} />
              <DueBadge date={t.due_date} today={today} done={t.status === "done" || t.status === "cancelled"} />
              {t.due_time && <span className="text-xs text-muted">{t.due_time}</span>}
              {t.recurrence_rule && <Repeat size={13} className="text-muted" aria-label="Повторяющаяся задача" />}
              {projectName(t.project_id) && <Badge>{projectName(t.project_id)}</Badge>}
              {isTaskOverdue(t, today) && <span className="sr-only">просрочена</span>}
            </div>
          )}
        />
      )}
    </>
  );
}
