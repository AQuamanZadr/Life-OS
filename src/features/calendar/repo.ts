import { insertRow, patchRow, removeRow } from "@/lib/repo";
import { eventInputSchema, type CalendarEvent, type EventInput } from "./schema";

export const createEvent = (input: EventInput) =>
  insertRow<CalendarEvent>("events", eventInputSchema.parse(input));

export function updateEvent(id: string, input: EventInput): Promise<void> {
  const data = eventInputSchema.parse(input);
  return patchRow<CalendarEvent>("events", id, () => data);
}

export const deleteEvent = (id: string) => removeRow("events", id);
