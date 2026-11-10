"use client";

import { useSyncExternalStore } from "react";
import { useRows } from "@/lib/use-rows";
import type { TimeEntry } from "./schema";

export const useTimeEntries = () => useRows<TimeEntry>("time_entries");

function subscribe(listener: () => void) {
  // Проверяем чаще секунды, чтобы показания не отставали; перерисовка — раз в секунду.
  const id = setInterval(listener, 250);
  return () => clearInterval(id);
}
const seconds = () => Math.floor(Date.now() / 1000);

// Текущее время в миллисекундах, обновляется раз в секунду. На сервере — 0.
export function useNow(): number {
  return useSyncExternalStore(subscribe, seconds, () => 0) * 1000;
}
