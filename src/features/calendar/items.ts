import type { Goal } from "@/features/goals/schema";
import type { Project } from "@/features/projects/schema";
import type { Task } from "@/features/tasks/schema";
import { addDays, isoWeekday } from "@/lib/dates";
import type { CalendarEvent } from "./schema";

// Всё, что календарь показывает на дате: события и сроки из других разделов.
export type ItemKind = "event" | "task" | "project" | "goal";

export type CalendarItem = {
  kind: ItemKind;
  id: string;
  title: string;
  date: string;
  time: string | null;
  endTime: string | null;
  done: boolean;
};

export const kindLabels: Record<ItemKind, string> = {
  event: "Событие",
  task: "Срок задачи",
  project: "Срок проекта",
  goal: "Срок цели",
};

export function buildItems(data: {
  events: CalendarEvent[];
  tasks: Task[];
  projects: Project[];
  goals: Goal[];
}): CalendarItem[] {
  const items: CalendarItem[] = data.events.map((e) => ({
    kind: "event",
    id: e.id,
    title: e.title,
    date: e.date,
    time: e.startTime,
    endTime: e.endTime,
    done: false,
  }));
  const deadline = (
    kind: ItemKind,
    row: { id: string; title: string },
    date: string | null,
    done: boolean,
  ) => {
    if (date) items.push({ kind, id: row.id, title: row.title, date, time: null, endTime: null, done });
  };
  for (const t of data.tasks) deadline("task", t, t.dueDate, t.status === "done");
  for (const p of data.projects) deadline("project", p, p.dueDate, p.status === "done");
  for (const g of data.goals) deadline("goal", g, g.targetDate, g.status !== "active");
  return items.sort(compareItems);
}

const kindOrder: Record<ItemKind, number> = { event: 0, task: 1, project: 2, goal: 3 };

// Внутри дня: события на весь день, затем по времени, затем сроки.
export function compareItems(a: CalendarItem, b: CalendarItem): number {
  return (
    a.date.localeCompare(b.date) ||
    kindOrder[a.kind] - kindOrder[b.kind] ||
    (a.time ?? "").localeCompare(b.time ?? "") ||
    a.title.localeCompare(b.title, "ru")
  );
}

export function groupByDate(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const result = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const list = result.get(item.date);
    if (list) list.push(item);
    else result.set(item.date, [item]);
  }
  return result;
}

// Недели месяца (с понедельника), включая дни соседних месяцев по краям.
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const start = addDays(first, 1 - isoWeekday(first));
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d));
    if (w > 0 && week[0].slice(0, 7) !== month) break;
    weeks.push(week);
  }
  return weeks;
}
