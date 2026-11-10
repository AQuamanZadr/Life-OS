import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { findSection, sections } from "@/lib/nav";

// Временная страница для разделов, которые ещё не реализованы.
export function generateStaticParams() {
  return sections.filter((s) => s.slug && !s.ready).map((s) => ({ section: s.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[section]">): Promise<Metadata> {
  const { section } = await params;
  return { title: findSection(section)?.title };
}

export default async function SectionPage({ params }: PageProps<"/[section]">) {
  const { section } = await params;
  const item = findSection(section);
  if (!item || !item.slug || item.ready) notFound();
  const Icon = item.icon;
  return (
    <>
      <PageHeader title={item.title} description={item.description} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-accent">
            <Icon className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground">
            Раздел ещё не реализован
          </p>
        </CardContent>
      </Card>
    </>
  );
}
