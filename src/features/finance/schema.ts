import { z } from "zod";
import { MAX_AMOUNT_MINOR } from "@/lib/money";
import { dateKeyField, rowFields } from "@/lib/schema";

export const transactionTypes = ["expense", "income"] as const;
export type TransactionType = (typeof transactionTypes)[number];

export const typeLabels: Record<TransactionType, string> = {
  expense: "Расход",
  income: "Доход",
};

// Ключ категории хранится в базе, подпись — только в интерфейсе.
export const categories: Record<TransactionType, Record<string, string>> = {
  expense: {
    food: "Продукты",
    cafe: "Кафе и рестораны",
    transport: "Транспорт",
    housing: "Жильё и коммунальные",
    health: "Здоровье",
    clothes: "Одежда и обувь",
    entertainment: "Развлечения",
    education: "Образование",
    subscriptions: "Связь и подписки",
    gifts: "Подарки",
    travel: "Путешествия",
    other: "Другое",
  },
  income: {
    salary: "Зарплата",
    freelance: "Подработка",
    investment: "Инвестиции",
    refund: "Возвраты",
    gifts: "Подарки",
    other: "Другое",
  },
};

export function categoryLabel(type: TransactionType, category: string): string {
  return categories[type][category] ?? category;
}

const fields = {
  type: z.enum(transactionTypes),
  // Сумма в копейках, всегда положительная; знак определяется типом.
  amountMinor: z
    .number("Введите сумму")
    .int()
    .positive("Введите сумму")
    .max(MAX_AMOUNT_MINOR, "Слишком большая сумма"),
  date: dateKeyField,
  category: z.string().min(1, "Выберите категорию").max(50),
  note: z.string().trim().max(500, "Не длиннее 500 символов"),
};

const categoryMatchesType = (t: { type: TransactionType; category: string }) =>
  t.category in categories[t.type];
const categoryError = { path: ["category"], message: "Выберите категорию" };

export const transactionInputSchema = z
  .object(fields)
  .refine(categoryMatchesType, categoryError);
export type TransactionInput = z.infer<typeof transactionInputSchema>;

export const transactionSchema = z.object({ ...fields, ...rowFields });
export type Transaction = z.infer<typeof transactionSchema>;
