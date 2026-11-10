import { diffDays, type DateStr } from "@/core/lib/dates";
import type { Goal, GoalMilestone } from "@/core/db/schema";

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * Прогресс цели в процентах (0–100).
 *  - numeric: текущее / целевое;
 *  - percent: текущее значение как процент;
 *  - milestones: доля выполненных этапов;
 *  - date: доля прошедшего времени от начала до срока;
 *  - composite: среднее по дочерним целям.
 */
export function goalProgress(goal: Goal, milestones: GoalMilestone[], allGoals: Goal[], today: DateStr, depth = 0): number {
  if (goal.status === "completed") return 100;
  switch (goal.goal_type) {
    case "numeric":
      return goal.target_value && goal.target_value > 0 ? clamp((goal.current_value / goal.target_value) * 100) : 0;
    case "percent":
      return clamp(goal.current_value);
    case "milestones": {
      const own = milestones.filter((m) => m.goal_id === goal.id && !m.deleted_at);
      return own.length === 0 ? 0 : clamp((own.filter((m) => m.completed_at).length / own.length) * 100);
    }
    case "date": {
      if (!goal.deadline) return 0;
      const start = goal.start_date ?? goal.created_at.slice(0, 10);
      const total = diffDays(start, goal.deadline);
      if (total <= 0) return today >= goal.deadline ? 100 : 0;
      return clamp((diffDays(start, today) / total) * 100);
    }
    case "composite": {
      if (depth > 10) return 0;
      const children = allGoals.filter((g) => g.parent_goal_id === goal.id && !g.deleted_at && g.status !== "cancelled");
      if (children.length === 0) return 0;
      return clamp(children.reduce((s, c) => s + goalProgress(c, milestones, allGoals, today, depth + 1), 0) / children.length);
    }
  }
}

export function isOverdue(goal: Pick<Goal, "deadline" | "status">, today: DateStr): boolean {
  return goal.status === "active" && !!goal.deadline && goal.deadline < today;
}

/** Дней до срока (отрицательное — просрочено). */
export function daysLeft(goal: Pick<Goal, "deadline">, today: DateStr): number | null {
  return goal.deadline ? diffDays(today, goal.deadline) : null;
}
