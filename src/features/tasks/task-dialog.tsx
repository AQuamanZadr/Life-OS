"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useGoals } from "@/features/goals/use-goals";
import { useProjects } from "@/features/projects/use-projects";
import { fieldErrors } from "@/lib/schema";
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
  const projects = useProjects() ?? [];
  const goals = useGoals() ?? [];
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo");
  const [priority, setPriority] = useState<TaskPriority>(
    task?.priority ?? "medium",
  );
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [projectId, setProjectId] = useState(task?.projectId ?? "");
  const [goalId, setGoalId] = useState(task?.goalId ?? "");
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
      projectId: projectId || null,
      goalId: goalId || null,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
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
      <Field id="task-title" label="Название" error={errors.title}>
        <Input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          aria-invalid={Boolean(errors.title)}
        />
      </Field>
      <Field id="task-notes" label="Заметки" error={errors.notes}>
        <Textarea
          id="task-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="task-status" label="Статус">
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
        </Field>
        <Field id="task-priority" label="Приоритет">
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
        </Field>
      </div>
      <Field id="task-due" label="Срок" error={errors.dueDate}>
        <Input
          id="task-due"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </Field>
      {(projects.length > 0 || goals.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.length > 0 && (
            <Field id="task-project" label="Проект">
              <Select
                id="task-project"
                value={projectId}
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
          {goals.length > 0 && (
            <Field id="task-goal" label="Цель">
              <Select
                id="task-goal"
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
              >
                <option value="">Без цели</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      )}
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
