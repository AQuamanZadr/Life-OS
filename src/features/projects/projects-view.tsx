"use client";

import { useState } from "react";
import { CalendarDays, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ListToolbar } from "@/components/list-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { useGoals } from "@/features/goals/use-goals";
import { useTasks } from "@/features/tasks/use-tasks";
import { formatDateKey } from "@/lib/dates";
import { matchesQuery } from "@/lib/schema";
import { useToday } from "@/lib/use-today";
import { ProjectDialog } from "./project-dialog";
import { deleteProject } from "./repo";
import {
  projectStatusLabels,
  projectStatuses,
  type Project,
  type ProjectStatus,
} from "./schema";
import { useProjects } from "./use-projects";

type StatusFilter = ProjectStatus | "all";

export function ProjectsView() {
  const projects = useProjects();
  const tasks = useTasks() ?? [];
  const goals = useGoals() ?? [];
  const today = useToday();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  const goalTitles = new Map(goals.map((g) => [g.id, g.title]));
  const visible = (projects ?? [])
    .filter(
      (p) =>
        (status === "all" || p.status === status) &&
        matchesQuery(query, p.title, p.notes),
    )
    .sort((a, b) => a.title.localeCompare(b.title, "ru"));
  const filtered = query.trim() !== "" || status !== "active";

  return (
    <>
      <PageHeader title="Проекты" description="Проекты и этапы">
        <Button onClick={() => setCreating(true)}>
          <Plus />
          Новый проект
        </Button>
      </PageHeader>

      <ListToolbar query={query} onQueryChange={setQuery} placeholder="Поиск по проектам">
        <Select
          aria-label="Статус"
          className="col-span-2 sm:w-44"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="all">Все статусы</option>
          {projectStatuses.map((s) => (
            <option key={s} value={s}>
              {projectStatusLabels[s]}
            </option>
          ))}
        </Select>
      </ListToolbar>

      <Card>
        {projects === undefined ? (
          <p className="p-5 text-sm text-muted-foreground">Загрузка…</p>
        ) : visible.length === 0 ? (
          projects.length === 0 ? (
            <EmptyState text="Проектов пока нет">
              <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
                <Plus />
                Добавить проект
              </Button>
            </EmptyState>
          ) : (
            <EmptyState text={filtered ? "Ничего не найдено" : "Активных проектов нет"}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setStatus(filtered ? "active" : "all");
                }}
              >
                {filtered ? "Сбросить фильтры" : "Показать все"}
              </Button>
            </EmptyState>
          )
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((project) => {
              const own = tasks.filter((t) => t.projectId === project.id);
              const done = own.filter((t) => t.status === "done").length;
              const overdue =
                project.status !== "done" &&
                project.dueDate !== null &&
                today !== "" &&
                project.dueDate < today;
              const goal = project.goalId ? goalTitles.get(project.goalId) : undefined;
              return (
                <li key={project.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">{project.title}</p>
                    {project.notes && (
                      <p className="mt-0.5 line-clamp-2 text-sm break-words text-muted-foreground">
                        {project.notes}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge
                        variant={
                          project.status === "done"
                            ? "success"
                            : project.status === "active"
                              ? "primary"
                              : "default"
                        }
                      >
                        {projectStatusLabels[project.status]}
                      </Badge>
                      {project.dueDate && (
                        <Badge variant={overdue ? "destructive" : "default"}>
                          <CalendarDays />
                          {formatDateKey(project.dueDate, today)}
                          {overdue && " · просрочено"}
                        </Badge>
                      )}
                      {goal && (
                        <Badge className="max-w-full">
                          <Target />
                          <span className="truncate">{goal}</span>
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="text-xs whitespace-nowrap text-muted-foreground">
                        {own.length === 0
                          ? "Нет задач"
                          : `Задачи: ${done} из ${own.length}`}
                      </span>
                      {own.length > 0 && (
                        <Progress
                          value={(done / own.length) * 100}
                          label="Выполнено задач"
                          className="max-w-48 flex-1"
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Изменить"
                      onClick={() => setEditing(project)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Удалить"
                      onClick={() => setDeleting(project)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ProjectDialog open={creating} onOpenChange={setCreating} />
      <ProjectDialog
        key={editing?.id}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        project={editing ?? undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Удалить проект?"
        description={
          deleting
            ? `«${deleting.title}» будет удалён. Его задачи останутся, но без проекта.`
            : undefined
        }
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await deleteProject(deleting.id);
          setDeleting(null);
        }}
      />
    </>
  );
}
