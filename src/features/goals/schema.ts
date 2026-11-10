import { z } from "zod";
import { dateKeyField, notesField, rowFields, titleField } from "@/lib/schema";

export const goalStatuses = ["active", "done", "dropped"] as const;
export type GoalStatus = (typeof goalStatuses)[number];

export const goalStatusLabels: Record<GoalStatus, string> = {
  active: "В работе",
  done: "Достигнута",
  dropped: "Отменена",
};

export const goalInputSchema = z.object({
  title: titleField,
  notes: notesField,
  status: z.enum(goalStatuses),
  targetDate: dateKeyField.nullable(),
  // Прогресс в процентах, задаётся вручную.
  progress: z.number().int().min(0).max(100),
});

export type GoalInput = z.infer<typeof goalInputSchema>;

export const goalSchema = goalInputSchema.extend(rowFields);
export type Goal = z.infer<typeof goalSchema>;
