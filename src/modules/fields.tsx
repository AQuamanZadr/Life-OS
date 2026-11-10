"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import type { FieldDef } from "@/components/entity-form";
import { Input, Select } from "@/components/ui";
import { getDb } from "@/core/db/db";
import * as L from "@/core/labels";
import type { RecurrenceRule } from "@/core/lib/recurrence";
import { weekdayShort } from "@/core/lib/dates";
import { normalizeAmount, currencyDecimals } from "@/core/lib/money";
import { useCategories, useCurrencies, useSettings } from "@/core/settings";
import type { Category } from "@/core/db/schema";
import { cn } from "@/lib/cn";

type Opt = { value: string; label: string };

function useOptions(table: "goals" | "projects" | "tasks" | "accounts" | "skills" | "courses" | "habits" | "notes", labelKey = "title"): Opt[] {
  const rows = useLiveQuery(() => getDb().table(table).toArray(), [table]) as Record<string, unknown>[] | undefined;
  return useMemo(() => (rows ?? []).filter((r) => !r.deleted_at && !r.archived_at).map((r) => ({ value: String(r.id), label: String(r[labelKey]) })).sort((a, b) => a.label.localeCompare(b.label, "ru")), [rows, labelKey]);
}

const catOptions = (cats: Category[]): Opt[] => cats.map((c) => ({ value: c.id, label: c.name }));

function RecurrenceEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const rule = (value as RecurrenceRule | null) ?? null;
  return (
    <div className="flex gap-2">
      <Select aria-label="Повторение" value={rule?.freq ?? ""} onChange={(e) => onChange(e.target.value ? { freq: e.target.value, interval: rule?.interval ?? 1 } : null)}>
        <option value="">Не повторяется</option>
        <option value="daily">По дням</option>
        <option value="weekly">По неделям</option>
        <option value="monthly">По месяцам</option>
        <option value="yearly">По годам</option>
      </Select>
      {rule && <Input aria-label="Интервал повторения" type="number" min={1} max={365} className="w-24" value={rule.interval} onChange={(e) => onChange({ ...rule, interval: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />}
    </div>
  );
}

function ScheduleEditor({ value, onChange, frequency }: { value: unknown; onChange: (v: unknown) => void; frequency: string }) {
  const cfg = (value as { weekdays?: number[]; times_per_week?: number; interval_days?: number }) ?? {};
  if (frequency === "weekdays") {
    const days = cfg.weekdays ?? [];
    return (
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Дни недели">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={days.includes(d)}
            onClick={() => onChange({ ...cfg, weekdays: days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort() })}
            className={cn("h-9 w-10 rounded-lg border text-sm font-medium", days.includes(d) ? "border-primary bg-primary text-primary-fg" : "border-border bg-card")}
          >
            {weekdayShort(d)}
          </button>
        ))}
      </div>
    );
  }
  if (frequency === "weekly_count") {
    return <Input aria-label="Раз в неделю" type="number" min={1} max={7} value={cfg.times_per_week ?? 3} onChange={(e) => onChange({ ...cfg, times_per_week: Math.min(7, Math.max(1, Math.floor(Number(e.target.value) || 1))) })} />;
  }
  return <Input aria-label="Интервал в днях" type="number" min={1} max={365} value={cfg.interval_days ?? 2} onChange={(e) => onChange({ ...cfg, interval_days: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />;
}

export function useTaskFields(): FieldDef[] {
  const projects = useOptions("projects");
  const goals = useOptions("goals");
  const tasks = useOptions("tasks");
  const cats = useCategories("task");
  return useMemo(
    () => [
      { name: "title", label: "Название", type: "text" },
      { name: "description", label: "Описание", type: "textarea", rows: 3 },
      { name: "status", label: "Статус", type: "select", options: L.options(L.TASK_STATUS_LABELS), half: true },
      { name: "priority", label: "Приоритет", type: "select", options: L.options(L.PRIORITY_LABELS), half: true },
      { name: "due_date", label: "Срок", type: "date", nullable: true, half: true },
      { name: "due_time", label: "Время", type: "time", nullable: true, half: true },
      { name: "recurrence_rule", label: "Повторение", type: "custom", render: (v, set) => <RecurrenceEditor value={v} onChange={set} />, help: "Следующая задача создаётся после выполнения текущей." },
      { name: "reminder_at", label: "Напоминание", type: "datetime", nullable: true, help: "Показывается, когда приложение открыто." },
      { name: "project_id", label: "Проект", type: "select", options: projects, nullable: true, half: true },
      { name: "goal_id", label: "Цель", type: "select", options: goals, nullable: true, half: true },
      { name: "parent_task_id", label: "Родительская задача", type: "select", options: tasks, nullable: true, half: true },
      { name: "category_id", label: "Категория", type: "select", options: catOptions(cats), nullable: true, half: true },
    ],
    [projects, goals, tasks, cats],
  );
}

export const TASK_DEFAULTS = { status: "todo", priority: "medium", recurrence_rule: null };

export function useGoalFields(): FieldDef[] {
  const goals = useOptions("goals");
  const cats = useCategories("goal");
  const areas = useCategories("life_area");
  return useMemo(
    () => [
      { name: "title", label: "Название", type: "text" },
      { name: "description", label: "Описание", type: "textarea", rows: 3 },
      { name: "goal_type", label: "Тип цели", type: "select", options: L.options(L.GOAL_TYPE_LABELS), half: true },
      { name: "category_id", label: "Категория", type: "select", options: catOptions([...cats, ...areas]), nullable: true, half: true },
      { name: "target_value", label: "Целевое значение", type: "number", nullable: true, half: true, showIf: (v) => v.goal_type === "numeric" },
      { name: "unit", label: "Единица измерения", type: "text", half: true, showIf: (v) => v.goal_type === "numeric", placeholder: "км, книг, ₸…" },
      { name: "current_value", label: "Текущее значение", type: "number", half: true, showIf: (v) => v.goal_type === "numeric" || v.goal_type === "percent", help: "Для процентной цели — от 0 до 100." },
      { name: "start_date", label: "Дата начала", type: "date", nullable: true, half: true },
      { name: "deadline", label: "Срок", type: "date", nullable: true, half: true },
      { name: "priority", label: "Приоритет", type: "select", options: L.options(L.PRIORITY_LABELS), half: true },
      { name: "status", label: "Статус", type: "select", options: L.options(L.GOAL_STATUS_LABELS), half: true },
      { name: "parent_goal_id", label: "Входит в составную цель", type: "select", options: goals, nullable: true },
    ],
    [goals, cats, areas],
  );
}

export const GOAL_DEFAULTS = { goal_type: "numeric", status: "active", priority: "medium", current_value: 0 };

export function useHabitFields(): FieldDef[] {
  return useMemo(
    () => [
      { name: "title", label: "Название", type: "text" },
      { name: "description", label: "Описание", type: "textarea", rows: 2 },
      { name: "habit_type", label: "Тип измерения", type: "select", options: L.options(L.HABIT_TYPE_LABELS) },
      { name: "target_value", label: "Цель на день", type: "number", nullable: true, half: true, showIf: (v) => v.habit_type !== "boolean", help: "Для ограничения — максимум в день." },
      { name: "unit", label: "Единица измерения", type: "text", half: true, showIf: (v) => v.habit_type !== "boolean", placeholder: "мин, стаканов, страниц…" },
      { name: "frequency", label: "Расписание", type: "select", options: L.options(L.HABIT_FREQUENCY_LABELS) },
      { name: "schedule_config", label: "Параметры расписания", type: "custom", showIf: (v) => v.frequency !== "daily", render: (v, set, values) => <ScheduleEditor value={v} onChange={set} frequency={String(values.frequency)} /> },
      { name: "start_date", label: "Дата начала", type: "date", half: true },
      { name: "end_date", label: "Дата окончания", type: "date", nullable: true, half: true },
      { name: "is_active", label: "Привычка активна", type: "checkbox" },
    ],
    [],
  );
}

/** Приводит параметры расписания к выбранной периодичности. */
export function habitTransform(data: Record<string, unknown>): Record<string, unknown> {
  const cfg = (data.schedule_config as Record<string, unknown> | undefined) ?? {};
  const f = data.frequency;
  const schedule_config = f === "weekdays" ? { weekdays: cfg.weekdays ?? [] } : f === "weekly_count" ? { times_per_week: cfg.times_per_week ?? 3 } : f === "interval" ? { interval_days: cfg.interval_days ?? 2 } : {};
  return { ...data, schedule_config, target_value: data.habit_type === "boolean" ? null : data.target_value };
}

export function useProjectFields(): FieldDef[] {
  const goals = useOptions("goals");
  return useMemo(
    () => [
      { name: "title", label: "Название", type: "text" },
      { name: "description", label: "Описание", type: "textarea", rows: 3 },
      { name: "status", label: "Статус", type: "select", options: L.options(L.PROJECT_STATUS_LABELS), half: true },
      { name: "priority", label: "Приоритет", type: "select", options: L.options(L.PRIORITY_LABELS), half: true },
      { name: "start_date", label: "Дата начала", type: "date", nullable: true, half: true },
      { name: "deadline", label: "Дедлайн", type: "date", nullable: true, half: true },
      { name: "goal_id", label: "Связанная цель", type: "select", options: goals, nullable: true },
    ],
    [goals],
  );
}

export const courseFields: FieldDef[] = [
  { name: "title", label: "Название", type: "text" },
  { name: "platform", label: "Платформа", type: "text", half: true },
  { name: "status", label: "Статус", type: "select", options: L.options(L.COURSE_STATUS_LABELS), half: true },
  { name: "url", label: "Ссылка", type: "text", placeholder: "https://…" },
  { name: "description", label: "Описание", type: "textarea", rows: 2 },
  { name: "progress", label: "Прогресс, %", type: "number", half: true, help: "Если добавлены уроки, считается автоматически." },
  { name: "start_date", label: "Дата начала", type: "date", nullable: true, half: true },
  { name: "end_date", label: "Дата окончания", type: "date", nullable: true, half: true },
];

export const bookFields: FieldDef[] = [
  { name: "title", label: "Название", type: "text" },
  { name: "author", label: "Автор", type: "text" },
  { name: "status", label: "Статус чтения", type: "select", options: L.options(L.BOOK_STATUS_LABELS), half: true },
  { name: "rating", label: "Оценка", type: "select", nullable: true, half: true, options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: "★".repeat(n) })) },
  { name: "total_pages", label: "Всего страниц", type: "number", nullable: true, half: true },
  { name: "current_page", label: "Прочитано страниц", type: "number", half: true },
  { name: "start_date", label: "Начало чтения", type: "date", nullable: true, half: true },
  { name: "finish_date", label: "Окончание", type: "date", nullable: true, half: true },
  { name: "notes", label: "Заметки", type: "textarea", rows: 4 },
];

export function bookTransform(data: Record<string, unknown>): Record<string, unknown> {
  return { ...data, rating: data.rating ? Number(data.rating) : null };
}

export function useSkillFields(): FieldDef[] {
  const skills = useOptions("skills");
  return useMemo(
    () => [
      { name: "title", label: "Название навыка", type: "text" },
      { name: "category", label: "Категория", type: "text", half: true },
      { name: "status", label: "Статус освоения", type: "select", options: L.options(L.SKILL_STATUS_LABELS), half: true },
      { name: "level", label: "Уровень (0–10)", type: "number", half: true },
      { name: "parent_skill_id", label: "Родительский навык", type: "select", options: skills, nullable: true, half: true },
      { name: "description", label: "Описание", type: "textarea", rows: 2 },
      { name: "practice", label: "Практические задания и история развития", type: "textarea", rows: 4 },
    ],
    [skills],
  );
}

export function useNoteFields(): FieldDef[] {
  const cats = useCategories("note");
  return useMemo(
    () => [
      { name: "title", label: "Заголовок", type: "text" },
      { name: "content", label: "Текст (Markdown)", type: "textarea", rows: 10 },
      { name: "category_id", label: "Категория", type: "select", options: catOptions(cats), nullable: true, half: true },
      { name: "is_favorite", label: "В избранном", type: "checkbox" },
    ],
    [cats],
  );
}

export const journalFields: FieldDef[] = [
  { name: "entry_date", label: "Дата", type: "date", half: true },
  { name: "mood", label: "Настроение", type: "select", nullable: true, half: true, options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${L.MOOD_EMOJI[n]} ${L.MOOD_LABELS[n]}` })) },
  { name: "title", label: "Заголовок", type: "text" },
  { name: "content", label: "Запись", type: "textarea", rows: 6 },
  { name: "events", label: "События дня", type: "textarea", rows: 2 },
  { name: "achievements", label: "Достижения", type: "textarea", rows: 2 },
  { name: "reflection", label: "Рефлексия", type: "textarea", rows: 2 },
  { name: "tags", label: "Теги через запятую", type: "custom", render: (v, set) => <Input aria-label="Теги" defaultValue={Array.isArray(v) ? v.join(", ") : ""} onChange={(e) => set(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="работа, семья" /> },
];

export function journalTransform(data: Record<string, unknown>): Record<string, unknown> {
  return { ...data, mood: data.mood ? Number(data.mood) : null, tags: Array.isArray(data.tags) ? [...new Set(data.tags as string[])] : [] };
}

export function useAccountFields(): FieldDef[] {
  const currencies = useCurrencies();
  return useMemo(
    () => [
      { name: "name", label: "Название счёта", type: "text" },
      { name: "account_type", label: "Тип", type: "select", options: L.options(L.ACCOUNT_TYPE_LABELS), half: true },
      { name: "currency", label: "Валюта", type: "select", options: currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` })), half: true },
      { name: "opening_balance", label: "Начальный остаток", type: "money", half: true },
      { name: "target_amount", label: "Цель накопления", type: "money", nullable: true, half: true, help: "Необязательно: для накоплений и финансовых целей." },
      { name: "is_active", label: "Счёт используется", type: "checkbox" },
    ],
    [currencies],
  );
}

/** Нормализует суммы под точность валюты; некорректный ввод оставляет схеме для сообщения об ошибке. */
export function useMoneyTransform(keys: string[], currencyOf?: (data: Record<string, unknown>) => string | undefined) {
  const currencies = useCurrencies();
  return (data: Record<string, unknown>): Record<string, unknown> => {
    const out = { ...data };
    const decimals = currencyDecimals(String(currencyOf?.(data) ?? data.currency ?? ""), currencies);
    for (const k of keys) {
      const v = out[k];
      if (typeof v !== "string" || v === "") continue;
      try {
        out[k] = normalizeAmount(v, decimals);
      } catch {
        // Оставляем как есть: число с лишними знаками отклонит проверка ниже.
        out[k] = /^\d+([.,]\d+)?$/.test(v) ? `${v}!` : v;
      }
    }
    return out;
  };
}

export function useTransactionFields(): FieldDef[] {
  const accounts = useLiveQuery(() => getDb().accounts.toArray(), []);
  const income = useCategories("income");
  const expense = useCategories("expense");
  return useMemo(() => {
    const accs = (accounts ?? []).filter((a) => !a.deleted_at && !a.archived_at && a.is_active).map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }));
    const currencyOf = (id: unknown) => accounts?.find((a) => a.id === id)?.currency;
    return [
      { name: "transaction_type", label: "Тип операции", type: "select", options: L.options(L.TRANSACTION_TYPE_LABELS), half: true },
      { name: "transaction_date", label: "Дата", type: "date", half: true },
      { name: "account_id", label: "Счёт", type: "select", options: accs, nullable: true, half: true },
      { name: "amount", label: "Сумма", type: "money", half: true, placeholder: "0.00" },
      { name: "to_account_id", label: "Счёт зачисления", type: "select", options: accs, nullable: true, half: true, showIf: (v) => v.transaction_type === "transfer" },
      { name: "to_amount", label: "Сумма зачисления", type: "money", nullable: true, half: true, showIf: (v) => v.transaction_type === "transfer" && !!v.to_account_id && currencyOf(v.account_id) !== currencyOf(v.to_account_id), help: "Валюты счетов различаются — укажите, сколько поступит." },
      { name: "category_id", label: "Категория", type: "select", nullable: true, options: catOptions([...expense, ...income]), showIf: (v) => v.transaction_type !== "transfer" },
      { name: "description", label: "Комментарий", type: "textarea", rows: 2 },
    ] satisfies FieldDef[];
  }, [accounts, income, expense]);
}

export function useTransactionTransform() {
  const accounts = useLiveQuery(() => getDb().accounts.toArray(), []);
  const currencies = useCurrencies();
  return (data: Record<string, unknown>): Record<string, unknown> => {
    const account = accounts?.find((a) => a.id === data.account_id);
    const to = accounts?.find((a) => a.id === data.to_account_id);
    const out: Record<string, unknown> = { ...data, currency: account?.currency ?? data.currency ?? "" };
    const norm = (v: unknown, code: string) => {
      if (typeof v !== "string" || v === "") return v;
      try {
        return normalizeAmount(v, currencyDecimals(code, currencies));
      } catch {
        return `${v}!`;
      }
    };
    out.amount = norm(out.amount, account?.currency ?? "");
    if (data.transaction_type === "transfer") {
      out.category_id = null;
      out.to_amount = to && account && to.currency !== account.currency ? norm(out.to_amount, to.currency) : null;
    } else {
      out.to_account_id = null;
      out.to_amount = null;
    }
    return out;
  };
}

export function useBudgetFields(): FieldDef[] {
  const expense = useCategories("expense");
  const currencies = useCurrencies();
  return useMemo(
    () => [
      { name: "name", label: "Название", type: "text", placeholder: "Например: Продукты на месяц" },
      { name: "category_id", label: "Категория расходов", type: "select", options: catOptions(expense), nullable: true, help: "Не выбрано — все расходы в валюте бюджета." },
      { name: "amount", label: "Лимит", type: "money", half: true },
      { name: "currency", label: "Валюта", type: "select", options: currencies.map((c) => ({ value: c.code, label: c.code })), half: true },
      { name: "period_type", label: "Период", type: "select", options: L.options(L.BUDGET_PERIOD_LABELS), half: true },
      { name: "start_date", label: "Начало", type: "date", half: true },
      { name: "end_date", label: "Окончание", type: "date", nullable: true, half: true },
    ],
    [expense, currencies],
  );
}

export const eventFields: FieldDef[] = [
  { name: "title", label: "Название", type: "text" },
  { name: "event_type", label: "Тип", type: "select", options: L.options(L.EVENT_TYPE_LABELS) },
  { name: "start_date", label: "Дата", type: "date", half: true },
  { name: "start_time", label: "Время начала", type: "time", nullable: true, half: true },
  { name: "end_date", label: "Дата окончания", type: "date", nullable: true, half: true },
  { name: "end_time", label: "Время окончания", type: "time", nullable: true, half: true },
  { name: "description", label: "Описание", type: "textarea", rows: 2 },
];

export function useMetricDefs(): L.MetricDef[] {
  const custom = useLiveQuery(() => getDb().custom_metrics.toArray(), []);
  const settings = useSettings();
  return useMemo(
    () => [
      ...L.BUILTIN_METRIC_DEFS.map((m) => (m.key === "weight" ? { ...m, unit: settings.units.weight } : m.key === "water" ? { ...m, unit: settings.units.water } : m)),
      ...(custom ?? []).filter((m) => !m.deleted_at && !m.archived_at).map((m) => ({ key: m.id, name: m.name, unit: m.unit, aggregate: "last" as const })),
    ],
    [custom, settings.units],
  );
}

export function useHealthFields(): FieldDef[] {
  const metrics = useMetricDefs();
  return useMemo(
    () => [
      { name: "metric_type", label: "Показатель", type: "select", options: metrics.map((m) => ({ value: m.key, label: `${m.name}, ${m.unit}` })) },
      { name: "value", label: "Значение", type: "number", half: true },
      { name: "recorded_at", label: "Дата и время", type: "datetime", half: true },
      { name: "note", label: "Комментарий", type: "textarea", rows: 2, help: "Для тренировки укажите её вид." },
    ],
    [metrics],
  );
}

export function useTimeEntryFields(): FieldDef[] {
  const projects = useOptions("projects");
  const tasks = useOptions("tasks");
  const cats = useCategories("time");
  return useMemo(
    () => [
      { name: "title", label: "Чем занимались", type: "text" },
      { name: "started_at", label: "Начало", type: "datetime", half: true },
      { name: "ended_at", label: "Окончание", type: "datetime", half: true },
      { name: "category_id", label: "Категория", type: "select", options: catOptions(cats), nullable: true, half: true },
      { name: "project_id", label: "Проект", type: "select", options: projects, nullable: true, half: true },
      { name: "task_id", label: "Задача", type: "select", options: tasks, nullable: true },
      { name: "note", label: "Комментарий", type: "textarea", rows: 2 },
    ],
    [projects, tasks, cats],
  );
}

export function timeEntryTransform(data: Record<string, unknown>): Record<string, unknown> {
  const s = Date.parse(String(data.started_at));
  const e = Date.parse(String(data.ended_at));
  return { ...data, duration_seconds: Number.isFinite(s) && Number.isFinite(e) && e >= s ? Math.floor((e - s) / 1000) : 0 };
}

export const categoryFields: FieldDef[] = [
  { name: "name", label: "Название", type: "text" },
  { name: "type", label: "Раздел", type: "select", options: L.options(L.CATEGORY_TYPE_LABELS), half: true },
  { name: "color", label: "Цвет", type: "custom", half: true, render: (v, set) => <input aria-label="Цвет" type="color" className="h-10 w-full rounded-lg border border-border bg-card" value={String(v || "#6366f1")} onChange={(e) => set(e.target.value)} /> },
  { name: "weekly_plan_minutes", label: "План времени, минут в неделю", type: "number", nullable: true, showIf: (v) => v.type === "time" },
];
