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
  // У раздела есть собственная страница (иначе показывается заглушка).
  ready: boolean;
};

function section(
  slug: string,
  title: string,
  description: string,
  icon: LucideIcon,
  ready = false,
): Section {
  return { slug, href: slug ? `/${slug}` : "/", title, description, icon, ready };
}

export const sections: Section[] = [
  section("", "Главная", "Обзор и общая статистика", LayoutDashboard, true),
  section("goals", "Цели", "Цели и прогресс", Target, true),
  section("habits", "Привычки", "Ежедневные привычки", Repeat, true),
  section("tasks", "Задачи", "Список дел", CheckSquare, true),
  section("calendar", "Календарь", "События и планы", CalendarDays, true),
  section("projects", "Проекты", "Проекты и этапы", FolderKanban, true),
  section("learning", "Обучение", "Курсы, книги и навыки", GraduationCap),
  section("time", "Время", "Учёт времени", Clock, true),
  section("finance", "Финансы", "Доходы и расходы", Wallet, true),
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
