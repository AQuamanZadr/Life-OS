"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { BackLink, DueBadge, History, LinkPicker, NotFound, PriorityBadge, Row2, useRecord, useRouteId } from "@/components/shared";
import { Badge, Button, Card, CardTitle, Input, PageHeader, Progress, useToast } from "@/components/ui";
import { getDb } from "@/core/db/db";
import { createRecord, purgeRecord, updateRecord } from "@/core/db/repo";
import { GOAL_STATUS_LABELS, GOAL_TYPE_LABELS, TASK_STATUS_LABELS } from "@/core/labels";
import { formatDate, nowIso } from "@/core/lib/dates";
import { useToday } from "@/core/settings";
import { daysLeft, goalProgress } from "@/modules/goals/domain";

export default function GoalPage() {
  const id = useRouteId();
  const goal = useRecord("goals", id);
  const today = useToday();
  const toast = useToast();
  const goals = useLiveQuery(() => getDb().goals.toArray(), []) ?? [];
  const milestones = useLiveQuery(() => getDb().goal_milestones.toArray(), []) ?? [];
  const tasks = useLiveQuery(() => getDb().tasks.where("goal_id").equals(id).toArray(), [id]) ?? [];
  const projects = useLiveQuery(() => getDb().projects.where("goal_id").equals(id).toArray(), [id]) ?? [];
  const [milestone, setMilestone] = useState("");
  const [value, setValue] = useState("");
  const [taskTitle, setTaskTitle] = useState("");

  if (goal === undefined) return <p className="text-sm text-muted">Загрузка…</p>;
  if (goal === null) return <NotFound backHref="/goals" backLabel="Цели" />;

  const own = milestones.filter((m) => m.goal_id === goal.id && !m.deleted_at).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  const children = goals.filter((g) => g.parent_goal_id === goal.id && !g.deleted_at);
  const progress = goalProgress(goal, milestones, goals, today);
  const left = daysLeft(goal, today);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось сохранить", "error");
    }
  };

  return (
    <>
      <BackLink href="/goals" label="Цели" />
      <PageHeader
        title={goal.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={goal.status === "completed" ? "success" : "primary"}>{GOAL_STATUS_LABELS[goal.status]}</Badge>
            <Badge>{GOAL_TYPE_LABELS[goal.goal_type]}</Badge>
            <PriorityBadge priority={goal.priority} />
            <DueBadge date={goal.deadline} today={today} done={goal.status !== "active"} />
          </span>
        }
        actions={
          <>
            {goal.status !== "completed" && (
              <Button onClick={() => run(() => updateRecord("goals", goal.id, { status: "completed" }))}>
                <Check size={16} /> Достигнута
              </Button>
            )}
            <Link href={`/goals/${goal.id}/edit`} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-subtle">
              <Pencil size={15} /> Изменить
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <Card>
          <CardTitle>Прогресс</CardTitle>
          <div className="flex items-center gap-3">
            <Progress value={progress} tone={goal.status === "completed" ? "success" : "primary"} />
            <span className="text-lg font-semibold" data-testid="goal-progress">
              {Math.round(progress)}%
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">
            {goal.goal_type === "numeric" && `${goal.current_value} из ${goal.target_value ?? "—"} ${goal.unit}`}
            {goal.goal_type === "milestones" && `Выполнено этапов: ${own.filter((m) => m.completed_at).length} из ${own.length}`}
            {goal.goal_type === "composite" && `Среднее по вложенным целям: ${children.length}`}
            {goal.goal_type === "date" && `Срок: ${formatDate(goal.deadline)}`}
            {left !== null && goal.status === "active" && ` · ${left >= 0 ? `осталось ${left} дн.` : `просрочено на ${-left} дн.`}`}
          </p>
          {(goal.goal_type === "numeric" || goal.goal_type === "percent") && goal.status === "active" && (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(value.replace(",", "."));
                if (value.trim() === "" || !Number.isFinite(n)) return toast("Введите число", "error");
                void run(async () => {
                  await updateRecord("goals", goal.id, { current_value: n });
                  setValue("");
                });
              }}
            >
              <Input aria-label="Новое текущее значение" inputMode="decimal" placeholder={`Текущее значение: ${goal.current_value}`} value={value} onChange={(e) => setValue(e.target.value)} />
              <Button type="submit" variant="primary">
                Обновить
              </Button>
            </form>
          )}
          {goal.description && <p className="mt-3 whitespace-pre-wrap text-sm">{goal.description}</p>}
        </Card>

        <Row2>
          <Card>
            <CardTitle>Этапы</CardTitle>
            <ul className="flex flex-col gap-1.5">
              {own.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-primary" aria-label={`Этап выполнен: ${m.title}`} checked={!!m.completed_at} onChange={() => run(() => updateRecord("goal_milestones", m.id, { completed_at: m.completed_at ? null : nowIso() }))} />
                  <span className={m.completed_at ? "flex-1 text-muted line-through" : "flex-1"}>{m.title}</span>
                  {m.target_date && <span className="text-xs text-muted">{formatDate(m.target_date, { year: false })}</span>}
                  <Button variant="ghost" size="icon" aria-label={`Удалить этап: ${m.title}`} onClick={() => run(() => purgeRecord("goal_milestones", m.id))}>
                    <Trash2 size={15} />
                  </Button>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!milestone.trim()) return;
                void run(async () => {
                  await createRecord("goal_milestones", { goal_id: goal.id, title: milestone, sort_order: own.length });
                  setMilestone("");
                });
              }}
            >
              <Input aria-label="Новый этап" placeholder="Новый этап" value={milestone} onChange={(e) => setMilestone(e.target.value)} />
              <Button type="submit" aria-label="Добавить этап">
                <Plus size={16} />
              </Button>
            </form>
          </Card>

          <Card>
            <CardTitle>Задачи цели</CardTitle>
            <ul className="flex flex-col gap-1.5 text-sm">
              {tasks.filter((t) => !t.deleted_at).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <Link href={`/tasks/${t.id}`} className={t.status === "done" ? "text-muted line-through" : "hover:underline"}>
                    {t.title}
                  </Link>
                  <Badge>{TASK_STATUS_LABELS[t.status]}</Badge>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!taskTitle.trim()) return;
                void run(async () => {
                  await createRecord("tasks", { title: taskTitle, goal_id: goal.id });
                  setTaskTitle("");
                });
              }}
            >
              <Input aria-label="Новая задача цели" placeholder="Новая задача" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
              <Button type="submit" aria-label="Добавить задачу">
                <Plus size={16} />
              </Button>
            </form>
          </Card>
        </Row2>

        <Row2>
          <LinkPicker title="Связанные привычки" fromType="goal" fromId={goal.id} toType="habit" hrefBase="/habits" />
          <Card>
            <CardTitle>Проекты и вложенные цели</CardTitle>
            {projects.length + children.length === 0 && <p className="text-sm text-muted">Свяжите проект с целью в карточке проекта или укажите эту цель как составную у другой цели.</p>}
            <ul className="flex flex-col gap-1.5 text-sm">
              {projects.filter((p) => !p.deleted_at).map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="hover:underline">
                    Проект: {p.title}
                  </Link>
                </li>
              ))}
              {children.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <Link href={`/goals/${c.id}`} className="hover:underline">
                    Цель: {c.title}
                  </Link>
                  <span className="text-xs text-muted">{Math.round(goalProgress(c, milestones, goals, today))}%</span>
                </li>
              ))}
            </ul>
          </Card>
        </Row2>

        <History table="goals" id={goal.id} />
      </div>
    </>
  );
}
