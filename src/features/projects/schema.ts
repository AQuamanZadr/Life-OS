import { z } from "zod";
import { dateKeyField, notesField, rowFields, titleField } from "@/lib/schema";

export const projectStatuses = ["active", "paused", "done"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export const projectStatusLabels: Record<ProjectStatus, string> = {
  active: "Активный",
  paused: "На паузе",
  done: "Завершён",
};

export const projectInputSchema = z.object({
  title: titleField,
  notes: notesField,
  status: z.enum(projectStatuses),
  dueDate: dateKeyField.nullable(),
  goalId: z.uuid().nullable(),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;

export const projectSchema = projectInputSchema.extend(rowFields);
export type Project = z.infer<typeof projectSchema>;
