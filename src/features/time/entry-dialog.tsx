"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Project } from "@/features/projects/schema";
import type { Task } from "@/features/tasks/schema";
import { toDateKey } from "@/lib/dates";
import { fieldErrors } from "@/lib/schema";
import { createEntry, updateEntry } from "./repo";
import { timeEntryInputSchema, type TimeEntry } from "./schema";
import { dayOf, durationMs, localTime, toRange } from "./stats";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: TimeEntry;
  tasks: Task[];
  projects: Project[];
};

export function EntryDialog({ open, onOpenChange, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={rest.entry ? "Запись времени" : "Новая запись времени"}>
        <EntryForm {...rest} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EntryForm({
  entry,
  tasks,
  projects,
  onDone,
}: Omit<Props, "open" | "onOpenChange"> & { onDone: () => void }) {
  const initialMinutes = entry ? Math.round(durationMs(entry, 0) / 60_000) : 0;
  const [date, setDate] = useState(() => (entry ? dayOf(entry) : toDateKey()));
  const [time, setTime] = useState(() =>
    localTime(entry ? entry.startedAt : new Date().toISOString()),
  );
  const [hours, setHours] = useState(entry ? String(Math.floor(initialMinutes / 60)) : "");
  const [minutes, setMinutes] = useState(entry ? String(initialMinutes % 60) : "");
  const [taskId, setTaskId] = useState(entry?.taskId ?? "");
  const [projectId, setProjectId] = useState(entry?.projectId ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const task = tasks.find((t) => t.id === taskId);
  const effectiveProject = task?.projectId ?? (projectId || null);
  // В списке — незавершённые задачи и та, что уже выбрана в записи.
  const options = tasks.filter((t) => t.status !== "done" || t.id === taskId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const h = hours.trim() === "" ? 0 : Number(hours);
    const m = minutes.trim() === "" ? 0 : Number(minutes);
    const whole = Number.isInteger(h) && Number.isInteger(m) && h >= 0 && m >= 0 && m < 60;
    const range = whole ? toRange(date, time, h * 60 + m) : null;
    if (!range) {
      setErrors(
        whole
          ? { date: "Укажите дату и время начала" }
          : { duration: "Часы и минуты — целые числа, минуты до 59" },
      );
      return;
    }
    const parsed = timeEntryInputSchema.safeParse({
      ...range,
      taskId: task ? task.id : null,
      projectId: effectiveProject,
      note,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      if (entry) await updateEntry(entry.id, parsed.data);
      else await createEntry(parsed.data);
      onDone();
    } catch {
      setErrors({ form: "Не удалось сохранить. Попробуйте ещё раз." });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-2 gap-4">
        <Field id="te-date" label="Дата" error={errors.date}>
          <Input id="te-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field id="te-time" label="Начало">
          <Input id="te-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <div>
        <div className="grid grid-cols-2 gap-4">
          <Field id="te-hours" label="Часы">
            <Input
              id="te-hours"
              inputMode="numeric"
              placeholder="0"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              autoFocus={!entry}
            />
          </Field>
          <Field id="te-minutes" label="Минуты">
            <Input
              id="te-minutes"
              inputMode="numeric"
              placeholder="0"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </Field>
        </div>
        {errors.duration && (
          <p className="mt-1.5 text-sm text-destructive">{errors.duration}</p>
        )}
      </div>
      {options.length > 0 && (
        <Field id="te-task" label="Задача">
          <Select id="te-task" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">Без задачи</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {projects.length > 0 && (
        <Field id="te-project" label="Проект">
          <Select
            id="te-project"
            value={effectiveProject ?? ""}
            disabled={Boolean(task?.projectId)}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Без проекта</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field id="te-note" label="Заметка" error={errors.note}>
        <Input id="te-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Отмена
        </Button>
        <Button type="submit" disabled={saving}>
          {entry ? "Сохранить" : "Добавить"}
        </Button>
      </div>
    </form>
  );
}
