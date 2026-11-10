/**
 * Схемы всех сущностей Life OS (Zod).
 *
 * Имена полей совпадают с колонками PostgreSQL (supabase/migrations), поэтому
 * локальная запись и облачная строка имеют одну и ту же форму.
 */
import { z } from "zod";
import { isValidDateStr } from "../lib/dates";
import { UUID_RE } from "../lib/ids";
import { isValidAmount, MAX_DECIMALS } from "../lib/money";
import { isValidRule } from "../lib/recurrence";

const id = z.string().regex(UUID_RE, "Некорректный идентификатор");
const ref = id.nullable().default(null);
const iso = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Некорректная дата и время");
const isoNull = iso.nullable().default(null);
const date = z.string().refine(isValidDateStr, "Некорректная дата");
const dateNull = date.nullable().default(null);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Некорректное время");
const title = z.string().trim().min(1, "Введите название").max(300, "Не более 300 символов");
const text = z.string().max(100_000, "Слишком длинный текст").default("");
const shortText = z.string().trim().max(300, "Не более 300 символов").default("");
const MAX_NUMBER = 1e12;
const num = z.number({ error: "Введите число" }).finite("Введите число").max(MAX_NUMBER, "Слишком большое число");
const nonNeg = num.min(0, "Значение не может быть отрицательным");
const money = z.string().refine((v) => isValidAmount(v, MAX_DECIMALS), "Некорректная сумма");
const positiveMoney = money.refine((v) => !/^-/.test(v.trim()) && /[1-9]/.test(v), "Сумма должна быть больше нуля");
const currency = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/, "Код валюты: 2–8 латинских букв или цифр");

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
const priority = z.enum(PRIORITIES).default("medium");

/** Общие поля всех синхронизируемых сущностей. */
const base = {
  id,
  created_at: iso,
  updated_at: iso,
  /** Мягкое удаление (корзина). */
  deleted_at: isoNull,
  /** Архив. */
  archived_at: isoNull,
  /** Версия строки на сервере (0 — ещё не синхронизирована). Основа optimistic concurrency. */
  version: z.number().int().min(0).default(0),
};

const dateOrder = (start: string | null, end: string | null) => !start || !end || start <= end;

export const CATEGORY_TYPES = ["general", "goal", "task", "time", "income", "expense", "note", "life_area"] as const;

export const categorySchema = z.object({
  ...base,
  name: title,
  type: z.enum(CATEGORY_TYPES).default("general"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
  icon: shortText,
  parent_id: ref,
  /** План времени в минутах в неделю (для сравнения план/факт в модуле «Время»). */
  weekly_plan_minutes: nonNeg.nullable().default(null),
});

export const GOAL_TYPES = ["numeric", "percent", "milestones", "date", "composite"] as const;
export const GOAL_STATUSES = ["active", "paused", "completed", "cancelled"] as const;

export const goalSchema = z
  .object({
    ...base,
    category_id: ref,
    parent_goal_id: ref,
    title,
    description: text,
    goal_type: z.enum(GOAL_TYPES).default("numeric"),
    target_value: num.nullable().default(null),
    current_value: num.default(0),
    unit: shortText,
    start_date: dateNull,
    deadline: dateNull,
    priority,
    status: z.enum(GOAL_STATUSES).default("active"),
    progress_mode: z.enum(["manual", "auto"]).default("manual"),
  })
  .refine((g) => dateOrder(g.start_date, g.deadline), { path: ["deadline"], message: "Срок не может быть раньше даты начала" })
  .refine((g) => g.goal_type !== "numeric" || (g.target_value !== null && g.target_value > 0), {
    path: ["target_value"],
    message: "Укажите целевое значение больше нуля",
  })
  .refine((g) => g.goal_type !== "percent" || (g.current_value >= 0 && g.current_value <= 100), {
    path: ["current_value"],
    message: "Процент должен быть от 0 до 100",
  })
  .refine((g) => g.goal_type !== "date" || g.deadline !== null, { path: ["deadline"], message: "Укажите дату завершения" })
  .refine((g) => g.parent_goal_id !== g.id, { path: ["parent_goal_id"], message: "Цель не может быть частью самой себя" });

export const goalMilestoneSchema = z.object({
  ...base,
  goal_id: id,
  title,
  description: text,
  target_date: dateNull,
  completed_at: isoNull,
  sort_order: z.number().int().default(0),
});

export const HABIT_TYPES = ["boolean", "numeric", "duration", "quantity", "limit"] as const;
export const HABIT_FREQUENCIES = ["daily", "weekdays", "weekly_count", "interval"] as const;

export const habitSchema = z
  .object({
    ...base,
    title,
    description: text,
    habit_type: z.enum(HABIT_TYPES).default("boolean"),
    target_value: nonNeg.nullable().default(null),
    unit: shortText,
    frequency: z.enum(HABIT_FREQUENCIES).default("daily"),
    schedule_config: z
      .object({
        /** weekdays: дни недели ISO 1–7. */
        weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
        /** weekly_count: сколько раз в неделю. */
        times_per_week: z.number().int().min(1).max(7).optional(),
        /** interval: каждые N дней. */
        interval_days: z.number().int().min(1).max(365).optional(),
      })
      .default({}),
    start_date: date,
    end_date: dateNull,
    is_active: z.boolean().default(true),
  })
  .refine((h) => dateOrder(h.start_date, h.end_date), { path: ["end_date"], message: "Дата окончания раньше даты начала" })
  .refine((h) => h.habit_type === "boolean" || h.target_value !== null, { path: ["target_value"], message: "Укажите целевое значение" })
  .refine((h) => h.frequency !== "weekdays" || (h.schedule_config.weekdays?.length ?? 0) > 0, {
    path: ["schedule_config"],
    message: "Выберите хотя бы один день недели",
  });

export const HABIT_LOG_STATUSES = ["done", "partial", "skipped", "missed"] as const;

export const habitLogSchema = z.object({
  ...base,
  habit_id: id,
  log_date: date,
  value: nonNeg.default(0),
  status: z.enum(HABIT_LOG_STATUSES).default("done"),
  note: text,
});

export const TASK_STATUSES = ["todo", "in_progress", "done", "cancelled"] as const;

export const taskSchema = z
  .object({
    ...base,
    project_id: ref,
    goal_id: ref,
    parent_task_id: ref,
    category_id: ref,
    title,
    description: text,
    priority,
    status: z.enum(TASK_STATUSES).default("todo"),
    due_date: dateNull,
    due_time: time.nullable().default(null),
    completed_at: isoNull,
    recurrence_rule: z.custom<import("../lib/recurrence").RecurrenceRule>((v) => isValidRule(v), "Некорректное правило повторения").nullable().default(null),
    reminder_at: isoNull,
    sort_order: z.number().int().default(0),
  })
  .refine((t) => t.parent_task_id !== t.id, { path: ["parent_task_id"], message: "Задача не может быть подзадачей самой себя" })
  .refine((t) => !t.recurrence_rule || t.due_date !== null, { path: ["due_date"], message: "Для повторяющейся задачи нужна дата" });

export const PROJECT_STATUSES = ["planned", "active", "paused", "completed", "cancelled"] as const;

export const projectSchema = z
  .object({
    ...base,
    goal_id: ref,
    title,
    description: text,
    status: z.enum(PROJECT_STATUSES).default("active"),
    priority,
    start_date: dateNull,
    deadline: dateNull,
    completed_at: isoNull,
  })
  .refine((p) => dateOrder(p.start_date, p.deadline), { path: ["deadline"], message: "Дедлайн раньше даты начала" });

export const COURSE_STATUSES = ["planned", "in_progress", "completed", "dropped"] as const;

export const courseSchema = z
  .object({
    ...base,
    title,
    platform: shortText,
    url: z.string().trim().max(2000).refine((v) => v === "" || /^https?:\/\//i.test(v), "Ссылка должна начинаться с http:// или https://").default(""),
    description: text,
    status: z.enum(COURSE_STATUSES).default("planned"),
    progress: num.min(0, "От 0 до 100").max(100, "От 0 до 100").default(0),
    start_date: dateNull,
    end_date: dateNull,
  })
  .refine((c) => dateOrder(c.start_date, c.end_date), { path: ["end_date"], message: "Дата окончания раньше даты начала" });

export const courseLessonSchema = z.object({
  ...base,
  course_id: id,
  title,
  description: text,
  sort_order: z.number().int().default(0),
  status: z.enum(["todo", "done"]).default("todo"),
  completed_at: isoNull,
});

export const BOOK_STATUSES = ["planned", "reading", "finished", "dropped"] as const;

export const bookSchema = z
  .object({
    ...base,
    title,
    author: shortText,
    total_pages: nonNeg.int("Целое число").nullable().default(null),
    current_page: nonNeg.int("Целое число").default(0),
    status: z.enum(BOOK_STATUSES).default("planned"),
    rating: z.number().int().min(1).max(5).nullable().default(null),
    start_date: dateNull,
    finish_date: dateNull,
    notes: text,
  })
  .refine((b) => b.total_pages === null || b.current_page <= b.total_pages, { path: ["current_page"], message: "Больше, чем страниц в книге" })
  .refine((b) => dateOrder(b.start_date, b.finish_date), { path: ["finish_date"], message: "Дата окончания раньше даты начала" });

export const SKILL_STATUSES = ["planned", "learning", "mastered"] as const;

export const skillSchema = z
  .object({
    ...base,
    parent_skill_id: ref,
    title,
    category: shortText,
    description: text,
    level: z.number().int().min(0, "От 0 до 10").max(10, "От 0 до 10").default(0),
    status: z.enum(SKILL_STATUSES).default("planned"),
    /** Практические задания и история развития — свободный текст. */
    practice: text,
  })
  .refine((s) => s.parent_skill_id !== s.id, { path: ["parent_skill_id"], message: "Навык не может быть родителем самого себя" });

export const timeEntrySchema = z
  .object({
    ...base,
    project_id: ref,
    task_id: ref,
    category_id: ref,
    title: shortText,
    started_at: iso,
    /** null — таймер ещё идёт. */
    ended_at: isoNull,
    duration_seconds: nonNeg.int().default(0),
    note: text,
  })
  .refine((e) => !e.ended_at || Date.parse(e.ended_at) >= Date.parse(e.started_at), { path: ["ended_at"], message: "Окончание раньше начала" });

export const ACCOUNT_TYPES = ["cash", "card", "bank", "savings", "other"] as const;

export const accountSchema = z.object({
  ...base,
  name: title,
  currency,
  account_type: z.enum(ACCOUNT_TYPES).default("card"),
  opening_balance: money.default("0"),
  /** Цель накопления (для накопительных счетов и финансовых целей). */
  target_amount: positiveMoney.nullable().default(null),
  is_active: z.boolean().default(true),
});

export const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const;

export const transactionSchema = z
  .object({
    ...base,
    account_id: id,
    transaction_type: z.enum(TRANSACTION_TYPES),
    category_id: ref,
    amount: positiveMoney,
    currency,
    transaction_date: date,
    description: text,
    /** Только для переводов: счёт зачисления и сумма зачисления (если валюты разные). */
    to_account_id: ref,
    to_amount: positiveMoney.nullable().default(null),
  })
  .refine((t) => t.transaction_type !== "transfer" || t.to_account_id !== null, { path: ["to_account_id"], message: "Выберите счёт зачисления" })
  .refine((t) => t.transaction_type !== "transfer" || t.to_account_id !== t.account_id, { path: ["to_account_id"], message: "Счета должны различаться" })
  .refine((t) => t.transaction_type === "transfer" || t.to_account_id === null, { path: ["to_account_id"], message: "Счёт зачисления указывается только для перевода" });

export const budgetSchema = z
  .object({
    ...base,
    category_id: ref,
    name: shortText,
    amount: positiveMoney,
    currency,
    period_type: z.enum(["weekly", "monthly", "yearly", "custom"]).default("monthly"),
    start_date: date,
    end_date: dateNull,
  })
  .refine((b) => dateOrder(b.start_date, b.end_date), { path: ["end_date"], message: "Дата окончания раньше даты начала" });

export const BUILTIN_METRICS = ["sleep", "weight", "water", "steps", "workout", "activity", "wellbeing"] as const;

export const healthRecordSchema = z.object({
  ...base,
  /** Ключ встроенного показателя либо id пользовательского показателя. */
  metric_type: z.string().trim().min(1).max(64),
  value: nonNeg,
  unit: shortText,
  recorded_at: iso,
  note: text,
});

export const customMetricSchema = z.object({
  ...base,
  name: title,
  unit: shortText,
});

export const noteSchema = z.object({
  ...base,
  category_id: ref,
  title,
  content: text,
  content_format: z.enum(["markdown", "plain"]).default("markdown"),
  is_favorite: z.boolean().default(false),
});

export const tagSchema = z.object({
  ...base,
  name: z.string().trim().min(1, "Введите название").max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#64748b"),
});

export const journalEntrySchema = z.object({
  ...base,
  entry_date: date,
  title: shortText,
  content: text,
  mood: z.number().int().min(1).max(5).nullable().default(null),
  events: text,
  achievements: text,
  reflection: text,
  tags: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
});

export const lifeBalanceSchema = z.object({
  ...base,
  category_id: id,
  score: z.number().int().min(1, "Оценка от 1 до 10").max(10, "Оценка от 1 до 10"),
  assessment_date: date,
  note: text,
});

export const EVENT_TYPES = ["personal", "workout", "study"] as const;

export const eventSchema = z
  .object({
    ...base,
    title,
    description: text,
    event_type: z.enum(EVENT_TYPES).default("personal"),
    start_date: date,
    start_time: time.nullable().default(null),
    end_date: dateNull,
    end_time: time.nullable().default(null),
  })
  .refine((e) => dateOrder(e.start_date, e.end_date), { path: ["end_date"], message: "Окончание раньше начала" });

export const LINKABLE_TYPES = ["goal", "habit", "task", "project", "note", "tag", "course", "skill", "book", "time_entry", "health_record"] as const;

/** Универсальная связь «многие-ко-многим» между сущностями. */
export const entityLinkSchema = z.object({
  ...base,
  from_type: z.enum(LINKABLE_TYPES),
  from_id: id,
  to_type: z.enum(LINKABLE_TYPES),
  to_id: id,
});

export const savedFilterSchema = z.object({
  ...base,
  module: z.string().min(1).max(64),
  name: title,
  config: z.record(z.string(), z.unknown()).default({}),
});

export const currencyDefSchema = z.object({
  code: currency,
  name: z.string().trim().min(1).max(100),
  symbol: z.string().trim().min(1).max(8),
  decimals: z.number().int().min(0).max(MAX_DECIMALS),
});

export const userSettingsSchema = z.object({
  ...base,
  display_name: shortText,
  theme: z.enum(["system", "light", "dark"]).default("system"),
  timezone: z.string().default("auto"),
  language: z.string().default("ru"),
  default_currency: currency.default("KZT"),
  week_start: z.union([z.literal(1), z.literal(7)]).default(1),
  idle_timeout_minutes: z.number().int().min(1).max(1440).default(30),
  notification_settings: z.object({ task_reminders: z.boolean().default(false) }).default({ task_reminders: false }),
  dashboard_layout: z
    .object({
      order: z.array(z.string()).default([]),
      hidden: z.array(z.string()).default([]),
      period: z.enum(["day", "week", "month"]).default("week"),
    })
    .default({ order: [], hidden: [], period: "week" }),
  currencies: z.array(currencyDefSchema).default([]),
  units: z.object({ weight: z.string().default("кг"), water: z.string().default("мл"), distance: z.string().default("км") }).default({ weight: "кг", water: "мл", distance: "км" }),
});

export const schemas = {
  categories: categorySchema,
  goals: goalSchema,
  goal_milestones: goalMilestoneSchema,
  habits: habitSchema,
  habit_logs: habitLogSchema,
  tasks: taskSchema,
  projects: projectSchema,
  courses: courseSchema,
  course_lessons: courseLessonSchema,
  books: bookSchema,
  skills: skillSchema,
  time_entries: timeEntrySchema,
  accounts: accountSchema,
  transactions: transactionSchema,
  budgets: budgetSchema,
  health_records: healthRecordSchema,
  custom_metrics: customMetricSchema,
  notes: noteSchema,
  tags: tagSchema,
  journal_entries: journalEntrySchema,
  life_balance: lifeBalanceSchema,
  events: eventSchema,
  entity_links: entityLinkSchema,
  saved_filters: savedFilterSchema,
  user_settings: userSettingsSchema,
} as const;

export type TableName = keyof typeof schemas;
export const TABLE_NAMES = Object.keys(schemas) as TableName[];

export type Row<T extends TableName> = z.output<(typeof schemas)[T]>;
type BaseKeys = "id" | "created_at" | "updated_at" | "deleted_at" | "archived_at" | "version";
/** Данные для создания записи: служебные поля заполняет репозиторий. */
export type NewRow<T extends TableName> = Omit<z.input<(typeof schemas)[T]>, BaseKeys>;
export type Patch<T extends TableName> = Partial<Omit<Row<T>, BaseKeys>>;

export type Category = Row<"categories">;
export type Goal = Row<"goals">;
export type GoalMilestone = Row<"goal_milestones">;
export type Habit = Row<"habits">;
export type HabitLog = Row<"habit_logs">;
export type Task = Row<"tasks">;
export type Project = Row<"projects">;
export type Course = Row<"courses">;
export type CourseLesson = Row<"course_lessons">;
export type Book = Row<"books">;
export type Skill = Row<"skills">;
export type TimeEntry = Row<"time_entries">;
export type Account = Row<"accounts">;
export type Transaction = Row<"transactions">;
export type Budget = Row<"budgets">;
export type HealthRecord = Row<"health_records">;
export type CustomMetric = Row<"custom_metrics">;
export type Note = Row<"notes">;
export type Tag = Row<"tags">;
export type JournalEntry = Row<"journal_entries">;
export type LifeBalance = Row<"life_balance">;
export type CalendarEvent = Row<"events">;
export type EntityLink = Row<"entity_links">;
export type SavedFilter = Row<"saved_filters">;
export type UserSettings = Row<"user_settings">;
export type Priority = (typeof PRIORITIES)[number];

/** Дочерние таблицы, удаляемые вместе с родителем (совпадает с ON DELETE CASCADE на сервере). */
export const CASCADES: Partial<Record<TableName, { table: TableName; field: string }[]>> = {
  goals: [{ table: "goal_milestones", field: "goal_id" }],
  habits: [{ table: "habit_logs", field: "habit_id" }],
  courses: [{ table: "course_lessons", field: "course_id" }],
};

/** Ссылки, обнуляемые при окончательном удалении записи (ON DELETE SET NULL на сервере). */
export const NULLIFY: Partial<Record<TableName, { table: TableName; field: string }[]>> = {
  categories: [
    { table: "categories", field: "parent_id" },
    { table: "goals", field: "category_id" },
    { table: "tasks", field: "category_id" },
    { table: "time_entries", field: "category_id" },
    { table: "transactions", field: "category_id" },
    { table: "budgets", field: "category_id" },
    { table: "notes", field: "category_id" },
  ],
  goals: [
    { table: "goals", field: "parent_goal_id" },
    { table: "tasks", field: "goal_id" },
    { table: "projects", field: "goal_id" },
  ],
  projects: [
    { table: "tasks", field: "project_id" },
    { table: "time_entries", field: "project_id" },
  ],
  tasks: [
    { table: "tasks", field: "parent_task_id" },
    { table: "time_entries", field: "task_id" },
  ],
  skills: [{ table: "skills", field: "parent_skill_id" }],
};

/** Имя типа сущности в связях → таблица. */
export const LINK_TABLES: Record<(typeof LINKABLE_TYPES)[number], TableName> = {
  goal: "goals",
  habit: "habits",
  task: "tasks",
  project: "projects",
  note: "notes",
  tag: "tags",
  course: "courses",
  skill: "skills",
  book: "books",
  time_entry: "time_entries",
  health_record: "health_records",
};

/** Локальный id единственной строки настроек (на сервере ключом служит user_id). */
export const SETTINGS_ID = "00000000-0000-4000-8000-000000000001";
