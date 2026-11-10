import Link from "next/link";
import { ActiveCount } from "@/components/active-count";
import { PageHeader } from "@/components/layout/page-header";
import { TodayDate } from "@/components/today-date";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FinanceSummary } from "@/features/finance/finance-summary";
import { HabitsSummary } from "@/features/habits/habits-summary";
import { TasksSummary } from "@/features/tasks/tasks-summary";
import { TimeSummary } from "@/features/time/time-summary";
import { sections } from "@/lib/nav";

// Сводки реализованных разделов; у остальных — «Пока нет данных».
const summaries: Record<string, React.ReactNode> = {
  goals: <ActiveCount table="goals" label="В работе" />,
  projects: <ActiveCount table="projects" label="Активных" />,
  finance: <FinanceSummary />,
  habits: <HabitsSummary />,
  tasks: <TasksSummary />,
  time: <TimeSummary />,
};

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Главная" description={<TodayDate />} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sections.slice(1).map(({ slug, href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="group rounded-xl outline-none">
            <Card className="h-full transition-colors group-hover:border-ring/40 group-focus-visible:ring-2 group-focus-visible:ring-ring/50">
              <CardHeader className="flex-row items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent">
                  <Icon className="size-4" />
                </span>
                <div>
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {summaries[slug] ?? "Пока нет данных"}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
