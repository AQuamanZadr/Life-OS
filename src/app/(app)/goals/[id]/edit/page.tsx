"use client";

import { FormPage, NotFound, useRecord, useRouteId } from "@/components/shared";
import { useGoalFields } from "@/modules/fields";

export default function EditGoalPage() {
  const id = useRouteId();
  const goal = useRecord("goals", id);
  const fields = useGoalFields();
  if (goal === undefined) return <p className="text-sm text-muted">Загрузка…</p>;
  if (goal === null) return <NotFound backHref="/goals" backLabel="Цели" />;
  return <FormPage key={goal.id} table="goals" title="Изменение цели" backHref={`/goals/${id}`} backLabel={goal.title} fields={fields} row={goal} doneHref={() => `/goals/${id}`} />;
}
