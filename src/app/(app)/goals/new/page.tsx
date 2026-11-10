"use client";

import { FormPage } from "@/components/shared";
import { useToday } from "@/core/settings";
import { GOAL_DEFAULTS, useGoalFields } from "@/modules/fields";

export default function NewGoalPage() {
  const fields = useGoalFields();
  const today = useToday();
  return <FormPage table="goals" title="Новая цель" backHref="/goals" backLabel="Цели" fields={fields} defaults={{ ...GOAL_DEFAULTS, start_date: today }} doneHref={(g) => `/goals/${g.id}`} submitLabel="Создать цель" />;
}
