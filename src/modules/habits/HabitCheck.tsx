"use client";

import { Check, SkipForward } from "lucide-react";
import { useState } from "react";
import { Button, Input, useToast } from "@/components/ui";
import type { Habit, HabitLog } from "@/core/db/schema";
import type { DateStr } from "@/core/lib/dates";
import { logHabit } from "@/modules/actions";
import { isSuccess } from "./domain";
import { cn } from "@/lib/cn";

/** Отметка привычки за день: галочка для boolean, поле ввода для остальных типов. */
export function HabitCheck({ habit, date, log }: { habit: Habit; date: DateStr; log: HabitLog | undefined }) {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const done = isSuccess(habit, log);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось сохранить", "error");
    } finally {
      setBusy(false);
    }
  };

  if (habit.habit_type === "boolean") {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-pressed={done}
          aria-label={`${done ? "Снять отметку" : "Отметить выполнение"}: ${habit.title}`}
          disabled={busy}
          onClick={() => run(() => logHabit(habit, date, done ? null : 1))}
          className={cn("flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors", done ? "border-success bg-success text-white" : "border-border text-muted hover:border-primary")}
        >
          <Check size={20} />
        </button>
        {!log && (
          <Button variant="ghost" size="icon" aria-label={`Пропустить сегодня: ${habit.title}`} title="Пропустить (серия не прерывается)" onClick={() => run(() => logHabit(habit, date, null, { skipped: true }))}>
            <SkipForward size={16} />
          </Button>
        )}
      </div>
    );
  }

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(value.replace(",", "."));
        if (value.trim() === "" || !Number.isFinite(n) || n < 0) return toast("Введите неотрицательное число", "error");
        void run(async () => {
          await logHabit(habit, date, n);
          setValue("");
        });
      }}
    >
      <Input aria-label={`Результат: ${habit.title}`} inputMode="decimal" className="w-24" placeholder={log ? String(log.value) : `${habit.habit_type === "limit" ? "≤ " : ""}${habit.target_value ?? ""}`} value={value} onChange={(e) => setValue(e.target.value)} />
      <span className="hidden text-xs text-muted sm:inline">{habit.unit}</span>
      <Button type="submit" size="icon" variant={done ? "primary" : "secondary"} aria-label={`Сохранить результат: ${habit.title}`} disabled={busy}>
        <Check size={18} />
      </Button>
    </form>
  );
}
