import { z } from "zod";
import {
  dateKeyField,
  isoDateTime,
  notesField,
  rowFields,
  titleField,
} from "@/lib/schema";

export const taskStatuses = ["todo", "in_progress", "done"] as const;
export const taskPriorities = ["low", "medium", "high"] as const;

export type TaskStatus = (typeof taskStatuses)[number];
export type TaskPriority = (typeof taskPriorities)[number];

export const statusLabels: Record<TaskStatus, string> = {
  todo: "К выполнению",
  in_progress: "В работе",
  done: "Готово",
};

export const priorityLabels: Record<TaskPriority, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
};

export const taskInputSchema = z.object({
  title: titleField,
  notes: notesField,
  status: z.enum(taskStatuses),
  priority: z.enum(taskPriorities),
  dueDate: dateKeyField.nullable(),
  projectId: z.uuid().nullable(),
  goalId: z.uuid().nullable(),
});

export type TaskInput = z.infer<typeof taskInputSchema>;

// Полная запись задачи; ею же проверяются данные, пришедшие из облака.
export const taskSchema = taskInputSchema.extend({
  ...rowFields,
  completedAt: isoDateTime.nullable(),
});

export type Task = z.infer<typeof taskSchema>;
