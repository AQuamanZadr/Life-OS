import { z } from "zod";
import { isValidDateKey } from "@/lib/dates";

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
  title: z
    .string()
    .trim()
    .min(1, "Введите название")
    .max(200, "Не длиннее 200 символов"),
  notes: z.string().trim().max(5000, "Не длиннее 5000 символов"),
  status: z.enum(taskStatuses),
  priority: z.enum(taskPriorities),
  dueDate: z
    .string()
    .refine(isValidDateKey, "Некорректная дата")
    .nullable(),
});

export type TaskInput = z.infer<typeof taskInputSchema>;

const isoDateTime = z.iso.datetime();

// Полная запись задачи; ею же проверяются данные, пришедшие из облака.
export const taskSchema = taskInputSchema.extend({
  id: z.uuid(),
  projectId: z.uuid().nullable(),
  goalId: z.uuid().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  completedAt: isoDateTime.nullable(),
  // Мягкое удаление: запись нужна, чтобы передать удаление при синхронизации.
  deletedAt: isoDateTime.nullable(),
});

export type Task = z.infer<typeof taskSchema>;
