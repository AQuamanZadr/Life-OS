"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toDateKey } from "@/lib/dates";
import { amountToInput, parseAmount } from "@/lib/money";
import { fieldErrors } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { createTransaction, hasSameTransaction, updateTransaction } from "./repo";
import {
  categories,
  transactionInputSchema,
  transactionTypes,
  typeLabels,
  type Transaction,
  type TransactionType,
} from "./schema";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction;
};

export function TransactionDialog({ open, onOpenChange, transaction }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={transaction ? "Операция" : "Новая операция"}>
        <TransactionForm transaction={transaction} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function TransactionForm({
  transaction,
  onDone,
}: {
  transaction?: Transaction;
  onDone: () => void;
}) {
  // Постоянный id этой формы — защита от повторного сохранения.
  const [newId] = useState(() => crypto.randomUUID());
  const [type, setType] = useState<TransactionType>(transaction?.type ?? "expense");
  const [amount, setAmount] = useState(
    transaction ? amountToInput(transaction.amountMinor) : "",
  );
  const [date, setDate] = useState(() => transaction?.date ?? toDateKey());
  const [category, setCategory] = useState(transaction?.category ?? "");
  const [note, setNote] = useState(transaction?.note ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicate, setDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);

  // Любая правка снимает предупреждение о повторе: проверим заново.
  const edit = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setDuplicate(false);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const parsed = transactionInputSchema.safeParse({
      type,
      amountMinor: parseAmount(amount) ?? Number.NaN,
      date,
      category,
      note,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (transaction) {
        await updateTransaction(transaction.id, parsed.data);
      } else {
        if (!duplicate && (await hasSameTransaction(parsed.data))) {
          setDuplicate(true);
          setSaving(false);
          return;
        }
        await createTransaction(newId, parsed.data);
      }
      onDone();
    } catch {
      setErrors({ form: "Не удалось сохранить. Попробуйте ещё раз." });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Тип">
        {transactionTypes.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => {
              if (t === type) return;
              setType(t);
              // У дохода и расхода разные категории.
              setCategory(category in categories[t] ? category : "");
              setDuplicate(false);
            }}
            className={cn(
              "h-8 rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              type === t ? "bg-card shadow-xs" : "text-muted-foreground",
            )}
          >
            {typeLabels[t]}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="tx-amount" label="Сумма, ₽" error={errors.amountMinor}>
          <Input
            id="tx-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={amount}
            onChange={(e) => edit(setAmount)(e.target.value)}
            autoFocus
            aria-invalid={Boolean(errors.amountMinor)}
          />
        </Field>
        <Field id="tx-date" label="Дата" error={errors.date}>
          <Input
            id="tx-date"
            type="date"
            value={date}
            onChange={(e) => edit(setDate)(e.target.value)}
          />
        </Field>
      </div>
      <Field id="tx-category" label="Категория" error={errors.category}>
        <Select
          id="tx-category"
          value={category}
          onChange={(e) => edit(setCategory)(e.target.value)}
        >
          <option value="" disabled>
            Выберите категорию
          </option>
          {Object.entries(categories[type]).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="tx-note" label="Заметка" error={errors.note}>
        <Input
          id="tx-note"
          value={note}
          onChange={(e) => edit(setNote)(e.target.value)}
        />
      </Field>
      {duplicate && (
        <p role="alert" className="rounded-md bg-muted px-3 py-2 text-sm">
          Такая же операция за этот день уже записана. Если это не ошибка, нажмите
          «Всё равно добавить».
        </p>
      )}
      {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Отмена
        </Button>
        <Button type="submit" disabled={saving}>
          {transaction ? "Сохранить" : duplicate ? "Всё равно добавить" : "Добавить"}
        </Button>
      </div>
    </form>
  );
}
