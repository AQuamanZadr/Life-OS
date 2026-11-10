"use client";

import { FormPage } from "@/components/shared";
import { TASK_DEFAULTS, useTaskFields } from "@/modules/fields";

export default function NewTaskPage() {
  const fields = useTaskFields();
  return <FormPage table="tasks" title="Новая задача" backHref="/tasks" backLabel="Задачи" fields={fields} defaults={TASK_DEFAULTS} doneHref={(t) => `/tasks/${t.id}`} submitLabel="Создать задачу" />;
}
