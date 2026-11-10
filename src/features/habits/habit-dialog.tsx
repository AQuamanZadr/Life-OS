"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fieldErrors } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { createHabit, updateHabit } from "./repo";
import {
  allWeekdays,
  habitInputSchema,
  habitStatusLabels,
  habitStatuses,
  weekdayLabels,
  type Habit,
  type HabitStatus,
} from "./schema";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  habit?: Habit;
};

export function HabitDialog({ open, onOpenChange, habit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={habit ? "Привычка" : "Новая привычка"}>
        <HabitForm habit={habit} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function HabitForm({ habit, onDone }: { habit?: Habit; onDone: () => void }) {
  const [title, setTitle] = useState(habit?.title ?? "");
  const [notes, setNotes] = useState(habit?.notes ?? "");
  const [status, setStatus] = useState<HabitStatus>(habit?.status ?? "active");
  const [weekdays, setWeekdays] = useState<number[]>(habit?.weekdays ?? allWeekdays);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const parsed = habitInputSchema.safeParse({ title, notes, status, weekdays });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      if (habit) await updateHabit(habit.id, parsed.data);
      else await createHabit(parsed.data);
      onDone();
    } catch {
      setErrors({ form: "Не удалось сохранить. Попробуйте ещё раз." });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field id="habit-title" label="Название" error={errors.title}>
        <Input
          id="habit-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          aria-invalid={Boolean(errors.title)}
        />
      </Field>
      <Field id="habit-notes" label="Заметки" error={errors.notes}>
        <Textarea
          id="habit-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Дни недели</legend>
        <div className="grid grid-cols-7 gap-1.5">
          {allWeekdays.map((day) => {
            const on = weekdays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setWeekdays(on ? weekdays.filter((d) => d !== day) : [...weekdays, day])
                }
                className={cn(
                  "h-9 rounded-md border text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent",
                )}
              >
                {weekdayLabels[day - 1]}
              </button>
            );
          })}
        </div>
        {errors.weekdays && (
          <p className="text-sm text-destructive">{errors.weekdays}</p>
        )}
      </fieldset>
      {habit && (
        <Field id="habit-status" label="Статус">
          <Select
            id="habit-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as HabitStatus)}
          >
            {habitStatuses.map((s) => (
              <option key={s} value={s}>
                {habitStatusLabels[s]}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Отмена
        </Button>
        <Button type="submit" disabled={saving}>
          {habit ? "Сохранить" : "Добавить"}
        </Button>
      </div>
    </form>
  );
}
