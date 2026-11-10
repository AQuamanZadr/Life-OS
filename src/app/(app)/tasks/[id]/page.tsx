"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { Pencil, Play, Plus } from "lucide-react";
import { useState } from "react";
import { EntityForm } from "@/components/entity-form";
import { BackLink, DueBadge, History, NotFound, PriorityBadge, Row2, useRecord, useRouteId } from "@/components/shared";
import { Badge, Button, Card, CardTitle, Input, Modal, PageHeader, Progress, Select, useToast } from "@/components/ui";
import { getDb } from "@/core/db/db";
import { createRecord } from "@/core/db/repo";
import type { Task } from "@/core/db/schema";
import { options, TASK_STATUS_LABELS } from "@/core/labels";
import { formatDateTime, formatDuration } from "@/core/lib/dates";
import { describeRule } from "@/core/lib/recurrence";
import { useTimeZone, useToday } from "@/core/settings";
import { setTaskStatus, startTimer } from "@/modules/actions";
import { useTaskFields } from "@/modules/fields";
import { completionPercent } from "@/modules/tasks/domain";
import { entrySeconds } from "@/modules/time/domain";

export default function TaskPage() {
  const id = useRouteId();
  const task = useRecord("tasks", id);
  const today = useToday();
  const tz = useTimeZone();
  const toast = useToast();
  const fields = useTaskFields();
  const [editing, setEditing] = useState(false);
  const [sub, setSub] = useState("");
  const subtasks = (useLiveQuery(() => getDb().tasks.where("parent_task_id").equals(id).toArray(), [id]) ?? []).filter((t) => !t.deleted_at);
  const entries = (useLiveQuery(() => getDb().time_entries.where("task_id").equals(id).toArray(), [id]) ?? []).filter((e) => !e.deleted_at);
  const project = useLiveQuery(async () => (task?.project_id ? getDb().projects.get(task.project_id) : undefined), [task?.project_id]);
  const goal = useLiveQuery(async () => (task?.goal_id ? getDb().goals.get(task.goal_id) : undefined), [task?.goal_id]);
  const parent = useLiveQuery(async () => (task?.parent_task_id ? getDb().tasks.get(task.parent_task_id) : undefined), [task?.parent_task_id]);

  if (task === undefined) return <p className="text-sm text-muted">Загрузка…</p>;
  if (task === null) return <NotFound backHref="/tasks" backLabel="Задачи" />;
  const run = (fn: () => Promise<unknown>) => fn().catch((e) => toast(e instanceof Error ? e.message : "Не удалось сохранить", "error"));
  const closed = task.status === "done" || task.status === "cancelled";

  return (
    <>
      <BackLink href={parent ? `/tasks/${parent.id}` : "/tasks"} label={parent ? parent.title : "Задачи"} />
      <PageHeader
        title={task.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={task.status === "done" ? "success" : "primary"}>{TASK_STATUS_LABELS[task.status]}</Badge>
            <PriorityBadge priority={task.priority} />
            <DueBadge date={task.due_date} today={today} done={closed} />
            {task.due_time && <span>{task.due_time}</span>}
            {task.recurrence_rule && <Badge>{describeRule(task.recurrence_rule)}</Badge>}
          </span>
        }
        actions={
          <>
            <Select aria-label="Статус задачи" className="w-auto" value={task.status} onChange={(e) => void run(() => setTaskStatus(task, e.target.value as Task["status"]))}>
              {options(TASK_STATUS_LABELS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Button onClick={() => void run(async () => (await startTimer({ title: task.title, task_id: task.id, project_id: task.project_id }), toast("Таймер запущен", "success")))}>
              <Play size={15} /> Таймер
            </Button>
            <Button onClick={() => setEditing(true)}>
              <Pencil size={15} /> Изменить
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <Row2>
          <Card>
            <CardTitle>Описание и связи</CardTitle>
            <p className="whitespace-pre-wrap text-sm">{task.description || <span className="text-muted">Без описания</span>}</p>
            <dl className="mt-3 flex flex-col gap-1 text-sm">
              {project && (
                <div>
                  <dt className="inline text-muted">Проект: </dt>
                  <dd className="inline">
                    <Link className="hover:underline" href={`/projects/${project.id}`}>
                      {project.title}
                    </Link>
                  </dd>
                </div>
              )}
              {goal && (
                <div>
                  <dt className="inline text-muted">Цель: </dt>
                  <dd className="inline">
                    <Link className="hover:underline" href={`/goals/${goal.id}`}>
                      {goal.title}
                    </Link>
                  </dd>
                </div>
              )}
              {task.reminder_at && (
                <div>
                  <dt className="inline text-muted">Напоминание: </dt>
                  <dd className="inline">{formatDateTime(task.reminder_at, tz)}</dd>
                </div>
              )}
              {task.completed_at && (
                <div>
                  <dt className="inline text-muted">Выполнена: </dt>
                  <dd className="inline">{formatDateTime(task.completed_at, tz)}</dd>
                </div>
              )}
              <div>
                <dt className="inline text-muted">Затрачено времени: </dt>
                <dd className="inline">{formatDuration(entries.reduce((s, e) => s + entrySeconds(e), 0))}</dd>
              </div>
            </dl>
          </Card>
          <Card>
            <CardTitle>Подзадачи</CardTitle>
            {subtasks.length > 0 && (
              <div className="mb-3 flex items-center gap-2">
                <Progress value={completionPercent(subtasks)} label="Выполнение подзадач" />
                <span className="text-xs text-muted">{completionPercent(subtasks)}%</span>
              </div>
            )}
            <ul className="flex flex-col gap-1.5">
              {subtasks.sort((a, b) => a.created_at.localeCompare(b.created_at)).map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-primary" aria-label={`Подзадача выполнена: ${s.title}`} checked={s.status === "done"} onChange={() => void run(() => setTaskStatus(s, s.status === "done" ? "todo" : "done"))} />
                  <Link href={`/tasks/${s.id}`} className={s.status === "done" ? "text-muted line-through" : "hover:underline"}>
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!sub.trim()) return;
                void run(async () => {
                  await createRecord("tasks", { title: sub, parent_task_id: task.id, project_id: task.project_id, goal_id: task.goal_id });
                  setSub("");
                });
              }}
            >
              <Input aria-label="Новая подзадача" placeholder="Новая подзадача" value={sub} onChange={(e) => setSub(e.target.value)} />
              <Button type="submit" aria-label="Добавить подзадачу">
                <Plus size={16} />
              </Button>
            </form>
          </Card>
        </Row2>
        <History table="tasks" id={task.id} />
      </div>
      <Modal open={editing} onClose={() => setEditing(false)} title="Изменить задачу">
        <EntityForm table="tasks" fields={fields} row={task} onCancel={() => setEditing(false)} onDone={() => setEditing(false)} />
      </Modal>
    </>
  );
}
