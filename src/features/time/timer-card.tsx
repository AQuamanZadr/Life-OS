"use client";

import { useState } from "react";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Project } from "@/features/projects/schema";
import type { Task } from "@/features/tasks/schema";
import { startTimer, stopTimer } from "./repo";
import type { TimeEntry } from "./schema";
import { durationMs, formatClock } from "./stats";
import { useNow } from "./use-time";

export function entryTitle(
  entry: TimeEntry,
  tasks: Map<string, Task>,
): string {
  const task = entry.taskId ? tasks.get(entry.taskId) : undefined;
  return task?.title ?? (entry.note || "Без описания");
}

export function TimerCard({
  running,
  tasks,
  projects,
}: {
  running: TimeEntry | undefined;
  tasks: Task[];
  projects: Project[];
}) {
  const now = useNow();
  const [taskId, setTaskId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const open = tasks.filter((t) => t.status !== "done");
  const task = taskId ? taskMap.get(taskId) : undefined;
  // У задачи с проектом проект берётся из задачи.
  const effectiveProject = task?.projectId ?? (projectId || null);

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  if (running) {
    return (
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Идёт таймер</p>
            <p className="truncate text-sm font-medium">{entryTitle(running, taskMap)}</p>
          </div>
          <span className="text-2xl font-semibold tabular-nums" aria-label="Прошло времени">
            {now === 0 ? "…" : formatClock(durationMs(running, now))}
          </span>
          <Button variant="destructive" disabled={busy} onClick={() => run(() => stopTimer(running.id))}>
            <Square />
            Стоп
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <CardContent>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await startTimer({
                taskId: task ? task.id : null,
                projectId: effectiveProject,
                note: note.trim().slice(0, 500),
              });
              setTaskId("");
              setProjectId("");
              setNote("");
            });
          }}
        >
          <Input
            aria-label="Чем занимаетесь"
            placeholder="Чем занимаетесь?"
            className="sm:flex-1"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
          {open.length > 0 && (
            <Select
              aria-label="Задача"
              className="sm:w-48"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
            >
              <option value="">Без задачи</option>
              {open.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          )}
          {projects.length > 0 && (
            <Select
              aria-label="Проект"
              className="sm:w-44"
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
          )}
          <Button type="submit" disabled={busy}>
            <Play />
            Старт
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
