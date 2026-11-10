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

export type Task = TaskInput & {
  id: string;
  projectId: string | null;
  goalId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  // Мягкое удаление: запись нужна, чтобы передать удаление при синхронизации.
  deletedAt: string | null;
};
