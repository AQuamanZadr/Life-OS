import { db } from "@/lib/db";
import { insertRow, patchRow, removeRow } from "@/lib/repo";
import {
  transactionInputSchema,
  type Transaction,
  type TransactionInput,
} from "./schema";

// id создаётся при открытии формы: повторная отправка той же формы
// (двойное нажатие, повтор после сбоя) не создаст вторую операцию.
export const createTransaction = (id: string, input: TransactionInput) =>
  insertRow<Transaction>("transactions", transactionInputSchema.parse(input), id);

export function updateTransaction(id: string, input: TransactionInput): Promise<void> {
  const data = transactionInputSchema.parse(input);
  return patchRow<Transaction>("transactions", id, () => data);
}

export const deleteTransaction = (id: string) => removeRow("transactions", id);

// Есть ли уже такая же операция (тип, сумма, дата, категория, заметка).
export async function hasSameTransaction(input: TransactionInput): Promise<boolean> {
  const data = transactionInputSchema.parse(input);
  const sameDay = await db.transactions.where("date").equals(data.date).toArray();
  return sameDay.some(
    (t) =>
      !t.deletedAt &&
      t.type === data.type &&
      t.amountMinor === data.amountMinor &&
      t.category === data.category &&
      t.note === data.note,
  );
}
