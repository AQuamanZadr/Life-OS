/** Русские подписи для значений перечислений и названия разделов. */

export const PRIORITY_LABELS = { low: "Низкий", medium: "Средний", high: "Высокий", critical: "Критический" } as const;
export const PRIORITY_TONES = { low: "neutral", medium: "primary", high: "warning", critical: "danger" } as const;

export const GOAL_TYPE_LABELS = { numeric: "Числовая", percent: "Процентная", milestones: "По этапам", date: "К дате", composite: "Составная" } as const;
export const GOAL_STATUS_LABELS = { active: "Активна", paused: "На паузе", completed: "Достигнута", cancelled: "Отменена" } as const;

export const HABIT_TYPE_LABELS = { boolean: "Выполнено / не выполнено", numeric: "Числовое значение", duration: "Продолжительность", quantity: "Количество", limit: "Ограничение (не больше)" } as const;
export const HABIT_FREQUENCY_LABELS = { daily: "Каждый день", weekdays: "По дням недели", weekly_count: "N раз в неделю", interval: "Каждые N дней" } as const;

export const TASK_STATUS_LABELS = { todo: "К выполнению", in_progress: "В работе", done: "Готово", cancelled: "Отменена" } as const;
export const PROJECT_STATUS_LABELS = { planned: "Запланирован", active: "В работе", paused: "На паузе", completed: "Завершён", cancelled: "Отменён" } as const;
export const COURSE_STATUS_LABELS = { planned: "В планах", in_progress: "Прохожу", completed: "Пройден", dropped: "Брошен" } as const;
export const BOOK_STATUS_LABELS = { planned: "В планах", reading: "Читаю", finished: "Прочитана", dropped: "Брошена" } as const;
export const SKILL_STATUS_LABELS = { planned: "В планах", learning: "Осваиваю", mastered: "Освоен" } as const;

export const ACCOUNT_TYPE_LABELS = { cash: "Наличные", card: "Карта", bank: "Банковский счёт", savings: "Накопления", other: "Другое" } as const;
export const TRANSACTION_TYPE_LABELS = { income: "Доход", expense: "Расход", transfer: "Перевод" } as const;
export const BUDGET_PERIOD_LABELS = { weekly: "Неделя", monthly: "Месяц", yearly: "Год", custom: "Свой период" } as const;

export const EVENT_TYPE_LABELS = { personal: "Личное событие", workout: "Тренировка", study: "Учебное занятие" } as const;
export const CATEGORY_TYPE_LABELS = { general: "Общие", goal: "Цели", task: "Задачи", time: "Время", income: "Доходы", expense: "Расходы", note: "Заметки", life_area: "Сферы жизни" } as const;

export const MOOD_LABELS = ["", "Очень плохо", "Плохо", "Нормально", "Хорошо", "Отлично"] as const;
export const MOOD_EMOJI = ["", "😞", "🙁", "😐", "🙂", "😄"] as const;

export interface MetricDef {
  key: string;
  name: string;
  unit: string;
  /** sum — значения за день складываются (вода, шаги); last — берётся последнее (вес). */
  aggregate: "sum" | "last" | "avg";
}

export const BUILTIN_METRIC_DEFS: MetricDef[] = [
  { key: "sleep", name: "Сон", unit: "ч", aggregate: "sum" },
  { key: "weight", name: "Вес", unit: "кг", aggregate: "last" },
  { key: "water", name: "Вода", unit: "мл", aggregate: "sum" },
  { key: "steps", name: "Шаги", unit: "шагов", aggregate: "sum" },
  { key: "workout", name: "Тренировка", unit: "мин", aggregate: "sum" },
  { key: "activity", name: "Физическая активность", unit: "мин", aggregate: "sum" },
  { key: "wellbeing", name: "Самочувствие", unit: "из 10", aggregate: "avg" },
];

export const TABLE_LABELS: Record<string, string> = {
  categories: "Категории",
  goals: "Цели",
  goal_milestones: "Этапы целей",
  habits: "Привычки",
  habit_logs: "Отметки привычек",
  tasks: "Задачи",
  projects: "Проекты",
  courses: "Курсы",
  course_lessons: "Уроки",
  books: "Книги",
  skills: "Навыки",
  time_entries: "Записи времени",
  accounts: "Счета",
  transactions: "Финансовые операции",
  budgets: "Бюджеты",
  health_records: "Показатели здоровья",
  custom_metrics: "Свои показатели",
  notes: "Заметки",
  tags: "Теги",
  journal_entries: "Дневник",
  life_balance: "Оценки баланса",
  events: "События",
  entity_links: "Связи",
  saved_filters: "Сохранённые фильтры",
  user_settings: "Настройки",
};

export function options<T extends string>(labels: Record<T, string>): { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}
