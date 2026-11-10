/** Операции уровня приложения, объединяющие несколько шагов репозитория. */
import { getDb } from "@/core/db/db";
import { BusinessRuleError, createRecord, purgeRecord, updateRecord } from "@/core/db/repo";
import type { Course, Habit, Row, Task, TimeEntry } from "@/core/db/schema";
import { nowIso, type DateStr } from "@/core/lib/dates";
import { deterministicId } from "@/core/lib/ids";
import { statusForValue } from "./habits/domain";
import { nextRecurringTask } from "./tasks/domain";
import { durationSeconds } from "./time/domain";

/** id отметки привычки определяется привычкой и датой — дубль за день невозможен. */
export function habitLogId(habitId: string, date: DateStr): string {
  return deterministicId("habit-log", habitId, date);
}

/**
 * Записывает результат привычки за день. Повторный вызов обновляет существующую
 * запись, а не создаёт новую. value = null снимает отметку.
 */
export async function logHabit(habit: Habit, date: DateStr, value: number | null, opts: { skipped?: boolean; note?: string } = {}): Promise<void> {
  const db = getDb();
  await db.transaction("rw", [db.habit_logs, db.sync_operations, db.audit_logs, db.entity_links], async () => {
    const existing = await db.habit_logs.where("[habit_id+log_date]").equals([habit.id, date]).first();
    if (value === null && !opts.skipped) {
      if (existing) await purgeRecord("habit_logs", existing.id);
      return;
    }
    const v = value ?? 0;
    const status = opts.skipped ? "skipped" : statusForValue(habit, v);
    const data = { value: v, status, note: opts.note ?? existing?.note ?? "", deleted_at: null } as const;
    if (existing) await updateRecord("habit_logs", existing.id, data);
    else await createRecord("habit_logs", { habit_id: habit.id, log_date: date, value: v, status, note: opts.note ?? "" }, { id: habitLogId(habit.id, date) });
  });
}

/** Меняет статус задачи; при завершении повторяющейся задачи создаёт следующую. */
export async function setTaskStatus(task: Task, status: Task["status"]): Promise<void> {
  const db = getDb();
  await db.transaction("rw", [db.tasks, db.sync_operations, db.audit_logs], async () => {
    await updateRecord("tasks", task.id, { status, completed_at: status === "done" ? (task.completed_at ?? nowIso()) : null });
    if (status !== "done" || task.status === "done") return;
    const next = nextRecurringTask(task);
    if (!next) return;
    await createRecord(
      "tasks",
      {
        title: task.title,
        description: task.description,
        priority: task.priority,
        project_id: task.project_id,
        goal_id: task.goal_id,
        parent_task_id: task.parent_task_id,
        category_id: task.category_id,
        due_date: next.due_date,
        due_time: task.due_time,
        recurrence_rule: task.recurrence_rule,
      },
      { id: next.id },
    );
  });
}

export async function activeTimer(): Promise<TimeEntry | undefined> {
  return getDb().time_entries.filter((e) => !e.ended_at && !e.deleted_at).first();
}

export async function startTimer(data: { title?: string; category_id?: string | null; project_id?: string | null; task_id?: string | null }): Promise<TimeEntry> {
  return createRecord("time_entries", { ...data, started_at: nowIso() });
}

export async function stopTimer(entry: TimeEntry): Promise<TimeEntry> {
  if (entry.ended_at) throw new BusinessRuleError("Таймер уже остановлен");
  const ended = nowIso();
  return updateRecord("time_entries", entry.id, { ended_at: ended, duration_seconds: durationSeconds(entry.started_at, ended) });
}

/** Пересчитывает прогресс курса по выполненным урокам. */
export async function recalcCourseProgress(courseId: string): Promise<void> {
  const db = getDb();
  const course = await db.courses.get(courseId);
  if (!course) return;
  const lessons = (await db.course_lessons.where("course_id").equals(courseId).toArray()).filter((l) => !l.deleted_at);
  if (lessons.length === 0) return;
  const done = lessons.filter((l) => l.status === "done").length;
  const progress = Math.round((done / lessons.length) * 100);
  const patch: Partial<Course> = { progress };
  if (progress === 100 && course.status !== "completed") patch.status = "completed";
  else if (progress > 0 && progress < 100 && course.status === "planned") patch.status = "in_progress";
  if (progress !== course.progress || patch.status) await updateRecord("courses", courseId, patch);
}

type LinkType = Row<"entity_links">["from_type"];

export function linkId(fromType: LinkType, fromId: string, toType: LinkType, toId: string): string {
  return deterministicId("link", fromType, fromId, toType, toId);
}

/** Создаёт связь между сущностями (идемпотентно). */
export async function linkEntities(fromType: LinkType, fromId: string, toType: LinkType, toId: string): Promise<void> {
  const id = linkId(fromType, fromId, toType, toId);
  const existing = await getDb().entity_links.get(id);
  if (existing?.deleted_at) await updateRecord("entity_links", id, { deleted_at: null } as never);
  else if (!existing) await createRecord("entity_links", { from_type: fromType, from_id: fromId, to_type: toType, to_id: toId }, { id });
}

export async function unlinkEntities(fromType: LinkType, fromId: string, toType: LinkType, toId: string): Promise<void> {
  await purgeRecord("entity_links", linkId(fromType, fromId, toType, toId));
}
