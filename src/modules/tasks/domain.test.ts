import { describe, expect, it } from "vitest";
import { make } from "@/test/factories";
import { compareTasks, completionPercent, matchesView, nextRecurringTask } from "./domain";

const today = "2026-12-31";

describe("представления задач", () => {
  const t = (due_date: string | null, status = "todo") => make("tasks", { title: "t", due_date, status });
  it("сегодня / предстоящие / просроченные / завершённые", () => {
    expect(matchesView(t(today), "today", today)).toBe(true);
    expect(matchesView(t("2027-01-01"), "upcoming", today)).toBe(true);
    expect(matchesView(t("2027-02-01"), "upcoming", today)).toBe(false);
    expect(matchesView(t("2026-12-30"), "overdue", today)).toBe(true);
    expect(matchesView(t("2026-12-30", "done"), "overdue", today)).toBe(false);
    expect(matchesView(t(null), "today", today)).toBe(false);
    expect(matchesView(t(null, "done"), "done", today)).toBe(true);
    expect(matchesView(t(null, "cancelled"), "all", today)).toBe(false);
  });

  it("сортирует по сроку и приоритету", () => {
    const a = make("tasks", { title: "a", due_date: "2026-12-31", priority: "low" });
    const b = make("tasks", { title: "b", due_date: "2026-12-31", priority: "critical" });
    const c = make("tasks", { title: "c", due_date: null, priority: "critical" });
    const d = make("tasks", { title: "d", due_date: "2026-12-30" });
    expect([a, b, c, d].sort(compareTasks).map((x) => x.title)).toEqual(["d", "b", "a", "c"]);
  });
});

describe("повторяющиеся задачи", () => {
  it("следующее вхождение детерминировано", () => {
    const task = make("tasks", { title: "Отчёт", due_date: "2026-12-31", recurrence_rule: { freq: "monthly", interval: 1 } });
    const next = nextRecurringTask(task);
    expect(next?.due_date).toBe("2027-01-31");
    expect(nextRecurringTask(task)?.id).toBe(next?.id);
    expect(nextRecurringTask(make("tasks", { title: "x" }))).toBeNull();
  });

  it("требует дату для повторяющейся задачи", () => {
    expect(() => make("tasks", { title: "x", recurrence_rule: { freq: "daily", interval: 1 } })).toThrow();
  });
});

describe("прогресс по задачам", () => {
  it("не учитывает отменённые и удалённые, не делит на ноль", () => {
    expect(completionPercent([])).toBe(0);
    expect(
      completionPercent([
        { status: "done", deleted_at: null },
        { status: "todo", deleted_at: null },
        { status: "cancelled", deleted_at: null },
        { status: "done", deleted_at: "2026-01-01T00:00:00Z" },
      ]),
    ).toBe(50);
  });
});
