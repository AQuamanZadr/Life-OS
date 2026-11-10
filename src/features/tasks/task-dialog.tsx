"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createTask, updateTask } from "./repo";
import {
  priorityLabels,
  statusLabels,
  taskInputSchema,
  taskPriorities,
  taskStatuses,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "./schema";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task;
};

export function TaskDialog({ open, onOpenChange, task }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={task ? "Задача" : "Новая задача"}>
        <TaskForm task={task} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function TaskForm({ task, onDone }: { task?: Task; onDone: () => void }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo");
  const [priority, setPriority] = useState<TaskPriority>(
    task?.priority ?? "medium",
  );
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const parsed = taskInputSchema.safeParse({
      title,
      notes,
      status,
      priority,
      dueDate: dueDate || null,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setSaving(true);
    try {
      if (task) await updateTask(task.id, parsed.data);
      else await createTask(parsed.data);
      onDone();
    } catch {
      setErrors({ form: "Не удалось сохранить. Попробуйте ещё раз." });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task-title">Название</Label>
        <Input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          aria-invalid={Boolean(errors.title)}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task-notes">Заметки</Label>
        <Textarea
          id="task-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {errors.notes && (
          <p className="text-sm text-destructive">{errors.notes}</p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-status">Статус</Label>
          <Select
            id="task-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
          >
            {taskStatuses.map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-priority">Приоритет</Label>
          <Select
            id="task-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            {taskPriorities.map((p) => (
              <option key={p} value={p}>
                {priorityLabels[p]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task-due">Срок</Label>
        <Input
          id="task-due"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        {errors.dueDate && (
          <p className="text-sm text-destructive">{errors.dueDate}</p>
        )}
      </div>
      {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Отмена
        </Button>
        <Button type="submit" disabled={saving}>
          {task ? "Сохранить" : "Добавить"}
        </Button>
      </div>
    </form>
  );
}
