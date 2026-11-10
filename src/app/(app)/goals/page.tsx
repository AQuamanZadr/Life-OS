"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CrudList } from "@/components/crud-list";
import { DueBadge, PriorityBadge } from "@/components/shared";
import { Badge, PageHeader, Progress } from "@/components/ui";
import { getDb } from "@/core/db/db";
import { GOAL_STATUS_LABELS, GOAL_TYPE_LABELS, options, PRIORITY_LABELS } from "@/core/labels";
import { useCategories, useToday } from "@/core/settings";
import { GOAL_DEFAULTS, useGoalFields } from "@/modules/fields";
import { goalProgress } from "@/modules/goals/domain";

export default function GoalsPage() {
  const today = useToday();
  const fields = useGoalFields();
  const goals = useLiveQuery(() => getDb().goals.toArray(), []) ?? [];
  const milestones = useLiveQuery(() => getDb().goal_milestones.toArray(), []) ?? [];
  const categories = useCategories();
  return (
    <>
      <PageHeader title="Цели" subtitle="Постановка целей, этапы и измеримый прогресс" />
      <CrudList
        table="goals"
        module="goals"
        fields={fields}
        defaults={GOAL_DEFAULTS}
        newHref="/goals/new"
        editHref={(g) => `/goals/${g.id}/edit`}
        href={(g) => `/goals/${g.id}`}
        labels={{ create: "Создать цель", edit: "Изменить цель", empty: "Целей пока нет", emptyHint: "Создайте первую цель: задайте срок, способ измерения и этапы." }}
        filters={[
          { key: "status", label: "Статус", options: options(GOAL_STATUS_LABELS) },
          { key: "priority", label: "Приоритет", options: options(PRIORITY_LABELS) },
          { key: "category_id", label: "Категория", options: categories.filter((c) => c.type === "goal" || c.type === "life_area").map((c) => ({ value: c.id, label: c.name })) },
        ]}
        dateKey="deadline"
        sorts={[
          { key: "deadline", label: "По сроку", compare: (a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") },
          { key: "created", label: "Сначала новые", compare: (a, b) => b.created_at.localeCompare(a.created_at) },
          { key: "title", label: "По названию", compare: (a, b) => a.title.localeCompare(b.title, "ru") },
          { key: "progress", label: "По прогрессу", compare: (a, b) => goalProgress(b, milestones, goals, today) - goalProgress(a, milestones, goals, today) },
        ]}
        render={(g) => {
          const p = goalProgress(g, milestones, goals, today);
          return (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{g.title}</span>
                <Badge tone={g.status === "completed" ? "success" : g.status === "active" ? "primary" : "neutral"}>{GOAL_STATUS_LABELS[g.status]}</Badge>
                <Badge>{GOAL_TYPE_LABELS[g.goal_type]}</Badge>
                <PriorityBadge priority={g.priority} />
                <DueBadge date={g.deadline} today={today} done={g.status !== "active"} />
              </div>
              <div className="flex items-center gap-2">
                <Progress value={p} tone={g.status === "completed" ? "success" : "primary"} label={`Прогресс цели ${g.title}`} />
                <span className="w-10 text-right text-xs text-muted">{Math.round(p)}%</span>
              </div>
            </div>
          );
        }}
      />
    </>
  );
}
