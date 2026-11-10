import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckSquare,
  Clock,
  FolderKanban,
  GraduationCap,
  HeartPulse,
  LayoutDashboard,
  NotebookPen,
  Repeat,
  Scale,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type Section = {
  slug: string;
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

function section(
  slug: string,
  title: string,
  description: string,
  icon: LucideIcon,
): Section {
  return { slug, href: slug ? `/${slug}` : "/", title, description, icon };
}

export const sections: Section[] = [
  section("", "Главная", "Обзор и общая статистика", LayoutDashboard),
  section("goals", "Цели", "Цели и прогресс", Target),
  section("habits", "Привычки", "Ежедневные привычки", Repeat),
  section("tasks", "Задачи", "Список дел", CheckSquare),
  section("calendar", "Календарь", "События и планы", CalendarDays),
  section("projects", "Проекты", "Проекты и этапы", FolderKanban),
  section("learning", "Обучение", "Курсы, книги и навыки", GraduationCap),
  section("time", "Время", "Учёт времени", Clock),
  section("finance", "Финансы", "Доходы и расходы", Wallet),
  section("health", "Здоровье", "Показатели здоровья", HeartPulse),
  section("knowledge", "Знания", "Заметки и база знаний", BookOpen),
  section("journal", "Дневник", "Личные записи", NotebookPen),
  section("balance", "Баланс жизни", "Баланс жизненных сфер", Scale),
  section("analytics", "Аналитика", "Аналитика и отчёты", BarChart3),
];

export function findSection(slug: string): Section | undefined {
  return sections.find((s) => s.slug === slug);
}

export function searchSections(query: string): Section[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return sections.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.slug.includes(q),
  );
}
