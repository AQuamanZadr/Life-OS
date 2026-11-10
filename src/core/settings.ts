"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { getDb, getMeta, setMeta } from "./db/db";
import { createRecord, updateRecord } from "./db/repo";
import { SETTINGS_ID, userSettingsSchema, type Category, type NewRow, type Patch, type UserSettings } from "./db/schema";
import { localTimeZone, todayStr, type DateStr } from "./lib/dates";
import { deterministicId } from "./lib/ids";
import { BUILTIN_CURRENCIES, type CurrencyDef } from "./lib/money";

const EPOCH = "1970-01-01T00:00:00.000Z";
export const DEFAULT_SETTINGS: UserSettings = userSettingsSchema.parse({ id: SETTINGS_ID, created_at: EPOCH, updated_at: EPOCH });

export function useSettings(): UserSettings {
  const row = useLiveQuery(() => getDb().user_settings.get(SETTINGS_ID), []);
  return row ?? DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Patch<"user_settings">): Promise<void> {
  const existing = await getDb().user_settings.get(SETTINGS_ID);
  if (existing) await updateRecord("user_settings", SETTINGS_ID, patch);
  else await createRecord("user_settings", patch as NewRow<"user_settings">, { id: SETTINGS_ID });
}

export function resolveTimeZone(settings: Pick<UserSettings, "timezone">): string {
  if (settings.timezone && settings.timezone !== "auto") {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: settings.timezone });
      return settings.timezone;
    } catch {
      /* некорректный пояс — используем системный */
    }
  }
  return localTimeZone();
}

export function useTimeZone(): string {
  const settings = useSettings();
  return useMemo(() => resolveTimeZone(settings), [settings]);
}

/** Сегодняшняя дата в часовом поясе пользователя; обновляется при смене суток. */
export function useToday(): DateStr {
  const tz = useTimeZone();
  const [today, setToday] = useState(() => todayStr(tz));
  useEffect(() => {
    const tick = () => setToday(todayStr(tz));
    tick();
    const t = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [tz]);
  return today;
}

export function allCurrencies(settings: Pick<UserSettings, "currencies">): CurrencyDef[] {
  const custom = settings.currencies.filter((c) => !BUILTIN_CURRENCIES.some((b) => b.code === c.code));
  return [...BUILTIN_CURRENCIES, ...custom];
}

export function useCurrencies(): CurrencyDef[] {
  const settings = useSettings();
  return useMemo(() => allCurrencies(settings), [settings]);
}

export function useCategories(type?: Category["type"]): Category[] {
  const rows = useLiveQuery(() => getDb().categories.toArray(), []);
  return useMemo(() => (rows ?? []).filter((c) => !c.deleted_at && !c.archived_at && (!type || c.type === type)).sort((a, b) => a.name.localeCompare(b.name, "ru")), [rows, type]);
}

const SEED: { type: Category["type"]; name: string; color: string }[] = [
  ...["Здоровье", "Карьера", "Финансы", "Отношения", "Развитие", "Отдых", "Окружение", "Смысл"].map((name, i) => ({ type: "life_area" as const, name, color: ["#16a34a", "#2563eb", "#d97706", "#db2777", "#7c3aed", "#0891b2", "#65a30d", "#9333ea"][i] })),
  ...["Продукты", "Жильё", "Транспорт", "Здоровье", "Развлечения", "Прочее"].map((name) => ({ type: "expense" as const, name, color: "#dc2626" })),
  ...["Зарплата", "Прочие доходы"].map((name) => ({ type: "income" as const, name, color: "#16a34a" })),
  ...["Работа", "Обучение", "Спорт", "Быт"].map((name) => ({ type: "time" as const, name, color: "#4f46e5" })),
];

/**
 * Начальные справочники. id детерминированы, поэтому на втором устройстве
 * те же категории не превратятся в дубли после синхронизации.
 */
export async function ensureSeed(): Promise<void> {
  if (await getMeta("seeded", false)) return;
  if ((await getDb().categories.count()) === 0) {
    for (const c of SEED) await createRecord("categories", { name: c.name, type: c.type, color: c.color }, { id: deterministicId("seed-category", c.type, c.name) });
  }
  await setMeta("seeded", true);
}
