"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fieldErrors } from "@/lib/schema";
import { createEvent, updateEvent } from "./repo";
import { eventInputSchema, type CalendarEvent } from "./schema";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CalendarEvent;
  // Дата для нового события.
  date: string;
};

export function EventDialog({ open, onOpenChange, event, date }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={event ? "Событие" : "Новое событие"}>
        <EventForm event={event} date={date} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EventForm({
  event,
  date: initialDate,
  onDone,
}: {
  event?: CalendarEvent;
  date: string;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [date, setDate] = useState(event?.date ?? initialDate);
  const [startTime, setStartTime] = useState(event?.startTime ?? "");
  const [endTime, setEndTime] = useState(event?.endTime ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const parsed = eventInputSchema.safeParse({
      title,
      notes,
      date,
      startTime: startTime || null,
      endTime: endTime || null,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      if (event) await updateEvent(event.id, parsed.data);
      else await createEvent(parsed.data);
      onDone();
    } catch {
      setErrors({ form: "Не удалось сохранить. Попробуйте ещё раз." });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field id="event-title" label="Название" error={errors.title}>
        <Input
          id="event-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          aria-invalid={Boolean(errors.title)}
        />
      </Field>
      <Field id="event-date" label="Дата" error={errors.date}>
        <Input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div>
        <div className="grid grid-cols-2 gap-4">
          <Field id="event-start" label="Начало" error={errors.startTime}>
            <Input
              id="event-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Field>
          <Field id="event-end" label="Окончание" error={errors.endTime}>
            <Input
              id="event-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </Field>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Без времени — событие на весь день.
        </p>
      </div>
      <Field id="event-notes" label="Заметки" error={errors.notes}>
        <Textarea id="event-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Отмена
        </Button>
        <Button type="submit" disabled={saving}>
          {event ? "Сохранить" : "Добавить"}
        </Button>
      </div>
    </form>
  );
}
