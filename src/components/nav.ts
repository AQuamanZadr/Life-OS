import { BarChart3, BookOpen, CalendarDays, CheckSquare, FileText, FolderKanban, GraduationCap, HeartPulse, LayoutDashboard, NotebookPen, PieChart, Repeat, Settings, Target, Timer, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Главная", icon: LayoutDashboard },
  { href: "/goals", label: "Цели", icon: Target },
  { href: "/habits", label: "Привычки", icon: Repeat },
  { href: "/tasks", label: "Задачи", icon: CheckSquare },
  { href: "/calendar", label: "Календарь", icon: CalendarDays },
  { href: "/learning", label: "Обучение", icon: GraduationCap },
  { href: "/projects", label: "Проекты", icon: FolderKanban },
  { href: "/time", label: "Время", icon: Timer },
  { href: "/finance", label: "Финансы", icon: Wallet },
  { href: "/health", label: "Здоровье", icon: HeartPulse },
  { href: "/knowledge", label: "База знаний", icon: BookOpen },
  { href: "/journal", label: "Дневник", icon: NotebookPen },
  { href: "/life-balance", label: "Life Balance", icon: PieChart },
  { href: "/analytics", label: "Аналитика", icon: BarChart3 },
  { href: "/reports", label: "Отчёты", icon: FileText },
  { href: "/settings", label: "Настройки", icon: Settings },
];
