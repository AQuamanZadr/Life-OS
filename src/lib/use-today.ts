"use client";

import { useSyncExternalStore } from "react";
import { toDateKey } from "./dates";

const subscribe = () => () => {};
const getServerSnapshot = () => "";

// Сегодняшняя дата (YYYY-MM-DD) в часовом поясе браузера.
// При пререндере на сервере — пустая строка.
export function useToday(): string {
  return useSyncExternalStore(subscribe, toDateKey, getServerSnapshot);
}
