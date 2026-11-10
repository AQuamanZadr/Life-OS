import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { TodayDate } from "@/components/today-date";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { sections } from "@/lib/nav";

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Главная" description={<TodayDate />} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sections.slice(1).map(({ href, title, description, icon: Icon }) => (
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
                Пока нет данных
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
