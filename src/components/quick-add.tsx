"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { EntityForm, type FieldDef } from "@/components/entity-form";
import { Modal, Tabs, useToast } from "@/components/ui";
import { eventFields, habitTransform, timeEntryTransform, useHabitFields, useNoteFields, useTaskFields, useTimeEntryFields, useTransactionFields, useTransactionTransform, TASK_DEFAULTS } from "@/modules/fields";
import { useToday } from "@/core/settings";
import { nowIso } from "@/core/lib/dates";

type Kind = "task" | "habit" | "note" | "time" | "transaction" | "event";

const KINDS: { value: Kind; label: string }[] = [
  { value: "task", label: "Задача" },
  { value: "habit", label: "Привычка" },
  { value: "note", label: "Заметка" },
  { value: "time", label: "Время" },
  { value: "transaction", label: "Операция" },
  { value: "event", label: "Событие" },
];

const pick = (fields: FieldDef[], names: string[]) => names.map((n) => fields.find((f) => f.name === n)!).filter(Boolean);

/** Быстрое добавление записей — доступно на всех страницах. */
export function QuickAdd() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("task");
  const toast = useToast();
  const today = useToday();
  const task = useTaskFields();
  const habit = useHabitFields();
  const note = useNoteFields();
  const time = useTimeEntryFields();
  const tx = useTransactionFields();
  const txTransform = useTransactionTransform();
  const done = () => {
    setOpen(false);
    toast("Сохранено", "success");
  };
  const cancel = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Быстрое добавление"
        className="no-print fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-fg shadow-lg transition-transform hover:scale-105"
      >
        <Plus size={26} />
      </button>
      <Modal open={open} onClose={cancel} title="Быстрое добавление">
        <div className="mb-4">
          <Tabs label="Тип записи" value={kind} onChange={setKind} options={KINDS} />
        </div>
        {kind === "task" && <EntityForm key="task" table="tasks" fields={pick(task, ["title", "due_date", "priority", "project_id"])} defaults={{ ...TASK_DEFAULTS, due_date: today }} onDone={done} onCancel={cancel} />}
        {kind === "habit" && <EntityForm key="habit" table="habits" fields={pick(habit, ["title", "habit_type", "target_value", "unit", "frequency", "schedule_config"])} defaults={{ habit_type: "boolean", frequency: "daily", start_date: today, is_active: true, schedule_config: {} }} transform={habitTransform} onDone={done} onCancel={cancel} />}
        {kind === "note" && <EntityForm key="note" table="notes" fields={pick(note, ["title", "content"])} defaults={{ content_format: "markdown" }} onDone={done} onCancel={cancel} />}
        {kind === "time" && <EntityForm key="time" table="time_entries" fields={pick(time, ["title", "started_at", "ended_at", "category_id"])} defaults={{ started_at: new Date(Date.now() - 3600_000).toISOString(), ended_at: nowIso() }} transform={timeEntryTransform} onDone={done} onCancel={cancel} />}
        {kind === "transaction" && <EntityForm key="tx" table="transactions" fields={tx} defaults={{ transaction_type: "expense", transaction_date: today }} transform={txTransform} onDone={done} onCancel={cancel} />}
        {kind === "event" && <EntityForm key="event" table="events" fields={pick(eventFields, ["title", "event_type", "start_date", "start_time"])} defaults={{ event_type: "personal", start_date: today }} onDone={done} onCancel={cancel} />}
      </Modal>
    </>
  );
}
