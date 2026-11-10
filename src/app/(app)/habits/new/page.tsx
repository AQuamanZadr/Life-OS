"use client";

import { FormPage } from "@/components/shared";
import { useToday } from "@/core/settings";
import { habitTransform, useHabitFields } from "@/modules/fields";

export default function NewHabitPage() {
  const fields = useHabitFields();
  const today = useToday();
  return (
    <FormPage
      table="habits"
      title="Новая привычка"
      backHref="/habits"
      backLabel="Привычки"
      fields={fields}
      transform={habitTransform}
      defaults={{ habit_type: "boolean", frequency: "daily", start_date: today, is_active: true, schedule_config: {} }}
      doneHref={() => "/habits"}
      submitLabel="Создать привычку"
    />
  );
}
