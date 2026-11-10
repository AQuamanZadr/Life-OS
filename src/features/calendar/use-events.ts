"use client";

import { useRows } from "@/lib/use-rows";
import type { CalendarEvent } from "./schema";

export const useEvents = () => useRows<CalendarEvent>("events");
