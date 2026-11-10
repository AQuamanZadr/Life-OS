import { z } from "zod";
import { isValidDateKey } from "@/lib/dates";

// Общие поля схем разделов.

export const titleField = z
  .string()
  .trim()
  .min(1, "Введите название")
  .max(200, "Не длиннее 200 символов");

export const notesField = z.string().trim().max(5000, "Не длиннее 5000 символов");

export const dateKeyField = z.string().refine(isValidDateKey, "Некорректная дата");

export const isoDateTime = z.iso.datetime();

// Поля, которые есть у каждой синхронизируемой записи.
export const rowFields = {
  id: z.uuid(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  // Мягкое удаление: запись нужна, чтобы передать удаление при синхронизации.
  deletedAt: isoDateTime.nullable(),
};

export type BaseRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

// Первая ошибка по каждому полю формы.
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    result[String(issue.path[0] ?? "form")] ??= issue.message;
  }
  return result;
}

export function matchesQuery(query: string, ...texts: string[]): boolean {
  const q = query.trim().toLowerCase();
  return q === "" || texts.some((t) => t.toLowerCase().includes(q));
}
