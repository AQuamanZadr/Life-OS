"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskDialog } from "@/features/tasks/task-dialog";

export function QuickAdd() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        className="ml-auto shrink-0"
        onClick={() => setOpen(true)}
        aria-label="Новая задача"
      >
        <Plus />
        <span className="hidden sm:inline">Задача</span>
      </Button>
      <TaskDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
