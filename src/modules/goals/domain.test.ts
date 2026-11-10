import { describe, expect, it } from "vitest";
import { make } from "@/test/factories";
import { daysLeft, goalProgress, isOverdue } from "./domain";

const today = "2026-11-10";

describe("прогресс целей", () => {
  it("числовая цель", () => {
    const g = make("goals", { title: "Накопить", goal_type: "numeric", target_value: 200, current_value: 50 });
    expect(goalProgress(g, [], [], today)).toBe(25);
    expect(goalProgress({ ...g, current_value: 500 }, [], [], today)).toBe(100);
    expect(goalProgress({ ...g, current_value: -10 }, [], [], today)).toBe(0);
    expect(goalProgress({ ...g, current_value: 0 }, [], [], today)).toBe(0);
  });

  it("процентная цель", () => {
    const g = make("goals", { title: "Курс", goal_type: "percent", current_value: 40 });
    expect(goalProgress(g, [], [], today)).toBe(40);
  });

  it("цель по этапам", () => {
    const g = make("goals", { title: "Диплом", goal_type: "milestones" });
    const ms = [
      make("goal_milestones", { goal_id: g.id, title: "1", completed_at: "2026-10-01T00:00:00Z" }),
      make("goal_milestones", { goal_id: g.id, title: "2" }),
      make("goal_milestones", { goal_id: g.id, title: "3" }),
      make("goal_milestones", { goal_id: g.id, title: "удалён", deleted_at: "2026-10-01T00:00:00Z" }),
    ];
    expect(goalProgress(g, ms, [], today)).toBeCloseTo(33.33, 1);
    expect(goalProgress(g, [], [], today)).toBe(0);
  });

  it("цель по дате", () => {
    const g = make("goals", { title: "Дожить", goal_type: "date", start_date: "2026-11-01", deadline: "2026-11-21" });
    expect(goalProgress(g, [], [], "2026-11-11")).toBe(50);
    expect(goalProgress(g, [], [], "2026-10-01")).toBe(0);
    expect(goalProgress(g, [], [], "2027-01-01")).toBe(100);
  });

  it("составная цель — среднее по дочерним, отменённые не учитываются", () => {
    const parent = make("goals", { title: "Здоровье", goal_type: "composite" });
    const a = make("goals", { title: "a", goal_type: "percent", current_value: 100, parent_goal_id: parent.id });
    const b = make("goals", { title: "b", goal_type: "percent", current_value: 50, parent_goal_id: parent.id });
    const c = make("goals", { title: "c", goal_type: "percent", current_value: 0, parent_goal_id: parent.id, status: "cancelled" });
    expect(goalProgress(parent, [], [parent, a, b, c], today)).toBe(75);
    expect(goalProgress(parent, [], [parent], today)).toBe(0);
  });

  it("завершённая цель — всегда 100%", () => {
    const g = make("goals", { title: "x", goal_type: "numeric", target_value: 10, current_value: 1, status: "completed" });
    expect(goalProgress(g, [], [], today)).toBe(100);
  });

  it("просрочка и остаток дней", () => {
    expect(isOverdue({ deadline: "2026-11-09", status: "active" }, today)).toBe(true);
    expect(isOverdue({ deadline: "2026-11-10", status: "active" }, today)).toBe(false);
    expect(isOverdue({ deadline: "2026-11-09", status: "completed" }, today)).toBe(false);
    expect(daysLeft({ deadline: "2027-01-01" }, "2026-12-31")).toBe(1);
    expect(daysLeft({ deadline: null }, today)).toBeNull();
  });
});

describe("проверка данных цели", () => {
  it("отклоняет некорректные значения", () => {
    expect(() => make("goals", { title: "", goal_type: "percent" })).toThrow();
    expect(() => make("goals", { title: "x", goal_type: "numeric", target_value: 0 })).toThrow();
    expect(() => make("goals", { title: "x", goal_type: "numeric", target_value: -5 })).toThrow();
    expect(() => make("goals", { title: "x", goal_type: "percent", current_value: 101 })).toThrow();
    expect(() => make("goals", { title: "x", goal_type: "percent", start_date: "2026-02-01", deadline: "2026-01-01" })).toThrow();
    expect(() => make("goals", { title: "x", goal_type: "percent", deadline: "2026-02-30" })).toThrow();
    expect(() => make("goals", { title: "x", goal_type: "numeric", target_value: 1e13 })).toThrow();
    expect(() => make("goals", { title: "x", goal_type: "numeric", target_value: Number.NaN })).toThrow();
    expect(() => make("goals", { title: "x", goal_type: "date" })).toThrow();
  });
});
