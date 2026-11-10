"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { EntityForm, type EntityFormProps } from "@/components/entity-form";
import { Badge, Card, CardTitle, EmptyState, PageHeader, Select, useToast } from "@/components/ui";
import { getDb } from "@/core/db/db";
import type { Priority, Row, TableName } from "@/core/db/schema";
import { LINK_TABLES } from "@/core/db/schema";
import { PRIORITY_LABELS, PRIORITY_TONES } from "@/core/labels";
import { diffDays, formatDate, formatDateTime, type DateStr } from "@/core/lib/dates";
import { linkEntities, unlinkEntities } from "@/modules/actions";

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "medium") return null;
  return <Badge tone={PRIORITY_TONES[priority]}>{PRIORITY_LABELS[priority]}</Badge>;
}

/** Подпись срока: «сегодня», «через 3 дн.», «просрочено на 2 дн.». */
export function DueBadge({ date, today, done }: { date: DateStr | null; today: DateStr; done?: boolean }) {
  if (!date) return null;
  const d = diffDays(today, date);
  if (done) return <Badge>{formatDate(date, { year: false })}</Badge>;
  if (d < 0) return <Badge tone="danger">просрочено на {-d} дн.</Badge>;
  if (d === 0) return <Badge tone="warning">сегодня</Badge>;
  if (d === 1) return <Badge tone="primary">завтра</Badge>;
  return <Badge>{d <= 14 ? `через ${d} дн.` : formatDate(date, { year: false })}</Badge>;
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
      <ArrowLeft size={15} /> {label}
    </Link>
  );
}

export function useRouteId(): string {
  const params = useParams<{ id: string }>();
  return String(params?.id ?? "");
}

/** Загружает запись по id из маршрута. undefined — загрузка, null — не найдена. */
export function useRecord<T extends TableName>(table: T, id: string): Row<T> | null | undefined {
  return useLiveQuery(async () => (id ? ((await getDb().rows(table).get(id)) ?? null) : null), [table, id]);
}

export function NotFound({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <>
      <BackLink href={backHref} label={backLabel} />
      <EmptyState title="Запись не найдена" hint="Возможно, она была удалена или ещё не синхронизирована на это устройство." />
    </>
  );
}

/** Страница-форма для маршрутов вида /goals/new и /goals/[id]/edit. */
export function FormPage<T extends TableName>({ title, backHref, backLabel, doneHref, ...form }: { title: string; backHref: string; backLabel: string; doneHref: (row: Row<T>) => string } & Omit<EntityFormProps<T>, "onDone" | "onCancel">) {
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <BackLink href={backHref} label={backLabel} />
      <PageHeader title={title} />
      <Card className="max-w-2xl">
        <EntityForm
          {...form}
          onCancel={() => router.push(backHref)}
          onDone={(row) => {
            toast("Сохранено", "success");
            router.push(doneHref(row));
          }}
        />
      </Card>
    </>
  );
}

/** История изменений записи из журнала аудита. */
export function History({ table, id }: { table: string; id: string }) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const logs = useLiveQuery(() => getDb().audit_logs.where("[entity_type+entity_id]").equals([table, id]).toArray(), [table, id]);
  const sorted = useMemo(() => [...(logs ?? [])].sort((a, b) => b.changed_at.localeCompare(a.changed_at)).slice(0, 30), [logs]);
  const actionLabels: Record<string, string> = { create: "Создание", update: "Изменение", archive: "В архив", unarchive: "Из архива", trash: "В корзину", restore: "Восстановление", delete: "Удаление", import: "Импорт", sync: "Синхронизация" };
  return (
    <Card>
      <CardTitle>История изменений</CardTitle>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted">Изменений пока нет.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {sorted.map((l) => (
            <li key={l.id} className="flex flex-wrap gap-x-2">
              <span className="text-muted">{formatDateTime(l.changed_at, tz)}</span>
              <span className="font-medium">{actionLabels[l.action] ?? l.action}</span>
              <span className="min-w-0 break-words text-muted">{l.change_summary}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type LinkType = keyof typeof LINK_TABLES;

/**
 * Связи «многие-ко-многим» с сущностями другого типа. Хранится только ссылка —
 * данные связанной записи не копируются.
 */
export function LinkPicker({ title, fromType, fromId, toType, hrefBase, reverse, empty }: { title: string; fromType: LinkType; fromId: string; toType: LinkType; hrefBase?: string; reverse?: boolean; empty?: string }) {
  const targetTable = LINK_TABLES[toType];
  const links = useLiveQuery(() => getDb().entity_links.toArray(), []);
  const targets = useLiveQuery(() => getDb().table(targetTable).toArray(), [targetTable]) as Record<string, unknown>[] | undefined;
  const linkedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const l of links ?? []) {
      if (l.deleted_at) continue;
      if (l.from_type === fromType && l.from_id === fromId && l.to_type === toType) ids.add(l.to_id);
      // Связь симметрична: показываем её с обеих сторон.
      if (l.to_type === fromType && l.to_id === fromId && l.from_type === toType) ids.add(l.from_id);
    }
    return ids;
  }, [links, fromType, fromId, toType]);
  const name = (r: Record<string, unknown>) => String(r.title ?? r.name ?? "");
  const all = (targets ?? []).filter((r) => !r.deleted_at && r.id !== fromId);
  const linked = all.filter((r) => linkedIds.has(String(r.id)));
  const available = all.filter((r) => !linkedIds.has(String(r.id)) && !r.archived_at).sort((a, b) => name(a).localeCompare(name(b), "ru"));

  const add = (toId: string) => (reverse ? linkEntities(toType, toId, fromType, fromId) : linkEntities(fromType, fromId, toType, toId));
  const remove = async (toId: string) => {
    await unlinkEntities(fromType, fromId, toType, toId);
    await unlinkEntities(toType, toId, fromType, fromId);
  };

  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      {linked.length === 0 ? (
        <p className="mb-2 text-sm text-muted">{empty ?? "Связей пока нет."}</p>
      ) : (
        <ul className="mb-3 flex flex-wrap gap-2">
          {linked.map((r) => (
            <li key={String(r.id)} className="flex items-center gap-1 rounded-full bg-subtle py-1 pl-3 pr-1 text-sm">
              {hrefBase ? (
                <Link href={`${hrefBase}/${String(r.id)}`} className="hover:underline">
                  {name(r)}
                </Link>
              ) : (
                name(r)
              )}
              <button type="button" aria-label={`Убрать связь: ${name(r)}`} className="rounded-full p-1 hover:bg-border" onClick={() => void remove(String(r.id))}>
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {available.length > 0 && (
        <Select aria-label={`Добавить: ${title}`} value="" onChange={(e) => e.target.value && void add(e.target.value)}>
          <option value="">+ Добавить связь…</option>
          {available.map((r) => (
            <option key={String(r.id)} value={String(r.id)}>
              {name(r)}
            </option>
          ))}
        </Select>
      )}
    </Card>
  );
}

export function Row2({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>;
}
