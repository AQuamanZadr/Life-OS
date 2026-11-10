"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fieldErrors } from "@/lib/schema";
import { createGoal, updateGoal } from "./repo";
import {
  goalInputSchema,
  goalStatusLabels,
  goalStatuses,
  type Goal,
  type GoalStatus,
} from "./schema";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: Goal;
};

export function GoalDialog({ open, onOpenChange, goal }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={goal ? "Цель" : "Новая цель"}>
        <GoalForm goal={goal} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function GoalForm({ goal, onDone }: { goal?: Goal; onDone: () => void }) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [notes, setNotes] = useState(goal?.notes ?? "");
  const [status, setStatus] = useState<GoalStatus>(goal?.status ?? "active");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [progress, setProgress] = useState(goal?.progress ?? 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const parsed = goalInputSchema.safeParse({
      title,
      notes,
      status,
      targetDate: targetDate || null,
      progress,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      if (goal) await updateGoal(goal.id, parsed.data);
      else await createGoal(parsed.data);
      onDone();
    } catch {
      setErrors({ form: "Не удалось сохранить. Попробуйте ещё раз." });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field id="goal-title" label="Название" error={errors.title}>
        <Input
          id="goal-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          aria-invalid={Boolean(errors.title)}
        />
      </Field>
      <Field id="goal-notes" label="Описание" error={errors.notes}>
        <Textarea
          id="goal-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="goal-status" label="Статус">
          <Select
            id="goal-status"
            value={status}
            onChange={(e) => {
              const next = e.target.value as GoalStatus;
              setStatus(next);
              if (next === "done") setProgress(100);
            }}
          >
            {goalStatuses.map((s) => (
              <option key={s} value={s}>
                {goalStatusLabels[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="goal-date" label="Срок" error={errors.targetDate}>
          <Input
            id="goal-date"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </Field>
      </div>
      <Field id="goal-progress" label={`Прогресс: ${progress}%`} error={errors.progress}>
        <input
          id="goal-progress"
          type="range"
          min={0}
          max={100}
          step={5}
          value={progress}
          onChange={(e) => setProgress(Number(e.target.value))}
          className="h-9 w-full accent-primary"
        />
      </Field>
      {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Отмена
        </Button>
        <Button type="submit" disabled={saving}>
          {goal ? "Сохранить" : "Добавить"}
        </Button>
      </div>
    </form>
  );
}
