"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ListToolbar } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { formatDateKey } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { matchesQuery } from "@/lib/schema";
import { useToday } from "@/lib/use-today";
import { cn } from "@/lib/utils";
import { CategoryBars, MonthlyChart } from "./charts";
import { deleteTransaction } from "./repo";
import {
  categoryLabel,
  transactionTypes,
  typeLabels,
  type Transaction,
  type TransactionType,
} from "./schema";
import {
  expensesByCategory,
  formatMonth,
  inMonth,
  monthOf,
  monthlyTotals,
  shiftMonth,
  totals,
} from "./stats";
import { TransactionDialog } from "./transaction-dialog";
import { useTransactions } from "./use-transactions";

export function FinanceView() {
  const all = useTransactions();
  const today = useToday();
  // null — показываем текущий месяц.
  const [picked, setPicked] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TransactionType | "all">("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);

  if (all === undefined || today === "") {
    return (
      <>
        <PageHeader title="Финансы" description="Доходы и расходы" />
        <Card>
          <p className="p-5 text-sm text-muted-foreground">Загрузка…</p>
        </Card>
      </>
    );
  }

  const month = picked ?? monthOf(today);
  const monthItems = inMonth(all, month);
  const sum = totals(monthItems);
  const byCategory = expensesByCategory(monthItems);
  const visible = monthItems
    .filter(
      (t) =>
        (type === "all" || t.type === type) &&
        matchesQuery(
          query,
          t.note,
          categoryLabel(t.type, t.category),
          formatMoney(t.amountMinor).replace(/[  ]/g, " "),
        ),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const filtered = query.trim() !== "" || type !== "all";

  return (
    <>
      <PageHeader title="Финансы" description="Доходы и расходы">
        <Button onClick={() => setCreating(true)}>
          <Plus />
          Новая операция
        </Button>
      </PageHeader>

      <div className="mb-4 flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="Предыдущий месяц"
          onClick={() => setPicked(shiftMonth(month, -1))}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-36 text-center text-sm font-medium" aria-live="polite">
          {formatMonth(month)}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Следующий месяц"
          onClick={() => setPicked(shiftMonth(month, 1))}
        >
          <ChevronRight />
        </Button>
        {month !== monthOf(today) && (
          <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
            Текущий
          </Button>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Доходы" value={formatMoney(sum.income)} />
        <Stat label="Расходы" value={formatMoney(sum.expense)} />
        <Stat
          className="col-span-2 sm:col-span-1"
          label="Баланс"
          value={formatMoney(sum.balance, { sign: true })}
          tone={sum.balance < 0 ? "negative" : sum.balance > 0 ? "positive" : undefined}
        />
      </div>

      {all.length > 0 && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Расходы по категориям</CardTitle>
            </CardHeader>
            <CardContent>
              {byCategory.length > 0 ? (
                <CategoryBars data={byCategory} />
              ) : (
                <p className="text-sm text-muted-foreground">В этом месяце расходов нет</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Доходы и расходы за 6 месяцев</CardTitle>
            </CardHeader>
            <CardContent>
              <MonthlyChart data={monthlyTotals(all, month, 6)} />
            </CardContent>
          </Card>
        </div>
      )}

      <ListToolbar query={query} onQueryChange={setQuery} placeholder="Поиск по операциям">
        <Select
          aria-label="Тип"
          className="col-span-2 sm:w-44"
          value={type}
          onChange={(e) => setType(e.target.value as TransactionType | "all")}
        >
          <option value="all">Все операции</option>
          {transactionTypes.map((t) => (
            <option key={t} value={t}>
              {t === "income" ? "Доходы" : "Расходы"}
            </option>
          ))}
        </Select>
      </ListToolbar>

      <Card>
        {visible.length === 0 ? (
          filtered && monthItems.length > 0 ? (
            <EmptyState text="Ничего не найдено">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setType("all");
                }}
              >
                Сбросить фильтры
              </Button>
            </EmptyState>
          ) : (
            <EmptyState text={all.length === 0 ? "Операций пока нет" : "В этом месяце операций нет"}>
              <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
                <Plus />
                Добавить операцию
              </Button>
            </EmptyState>
          )
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {categoryLabel(t.type, t.category)}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {formatDateKey(t.date, today)}
                    {t.note && ` · ${t.note}`}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-sm font-medium tabular-nums",
                    t.type === "income" && "text-success",
                  )}
                >
                  <span className="sr-only">{typeLabels[t.type]}: </span>
                  {formatMoney(t.type === "income" ? t.amountMinor : -t.amountMinor, {
                    sign: true,
                  })}
                </span>
                <div className="flex shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Изменить"
                    onClick={() => setEditing(t)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Удалить"
                    onClick={() => setDeleting(t)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <TransactionDialog open={creating} onOpenChange={setCreating} />
      <TransactionDialog
        key={editing?.id}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        transaction={editing ?? undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Удалить операцию?"
        description={
          deleting
            ? `${categoryLabel(deleting.type, deleting.category)}, ${formatMoney(deleting.amountMinor)} будет удалена.`
            : undefined
        }
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await deleteTransaction(deleting.id);
          setDeleting(null);
        }}
      />
    </>
  );
}

function Stat({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  className?: string;
}) {
  return (
    <Card data-stat={label} className={className}>
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-1 text-lg font-semibold tabular-nums sm:text-xl",
            tone === "positive" && "text-success",
            tone === "negative" && "text-destructive",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
