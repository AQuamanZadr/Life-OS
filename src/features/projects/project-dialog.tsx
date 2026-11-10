"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useGoals } from "@/features/goals/use-goals";
import { fieldErrors } from "@/lib/schema";
import { createProject, updateProject } from "./repo";
import {
  projectInputSchema,
  projectStatusLabels,
  projectStatuses,
  type Project,
  type ProjectStatus,
} from "./schema";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project;
};

export function ProjectDialog({ open, onOpenChange, project }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={project ? "Проект" : "Новый проект"}>
        <ProjectForm project={project} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({ project, onDone }: { project?: Project; onDone: () => void }) {
  const goals = useGoals() ?? [];
  const [title, setTitle] = useState(project?.title ?? "");
  const [notes, setNotes] = useState(project?.notes ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "active");
  const [dueDate, setDueDate] = useState(project?.dueDate ?? "");
  const [goalId, setGoalId] = useState(project?.goalId ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const parsed = projectInputSchema.safeParse({
      title,
      notes,
      status,
      dueDate: dueDate || null,
      goalId: goalId || null,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      if (project) await updateProject(project.id, parsed.data);
      else await createProject(parsed.data);
      onDone();
    } catch {
      setErrors({ form: "Не удалось сохранить. Попробуйте ещё раз." });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field id="project-title" label="Название" error={errors.title}>
        <Input
          id="project-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          aria-invalid={Boolean(errors.title)}
        />
      </Field>
      <Field id="project-notes" label="Описание" error={errors.notes}>
        <Textarea
          id="project-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="project-status" label="Статус">
          <Select
            id="project-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          >
            {projectStatuses.map((s) => (
              <option key={s} value={s}>
                {projectStatusLabels[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="project-due" label="Срок" error={errors.dueDate}>
          <Input
            id="project-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </Field>
      </div>
      {goals.length > 0 && (
        <Field id="project-goal" label="Цель">
          <Select
            id="project-goal"
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
      {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Отмена
        </Button>
        <Button type="submit" disabled={saving}>
          {project ? "Сохранить" : "Добавить"}
        </Button>
      </div>
    </form>
  );
}
