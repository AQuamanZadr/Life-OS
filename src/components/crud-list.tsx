"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { MoreVertical, Plus, Search, Star, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button, EmptyState, Input, Menu, Modal, Select, Tabs, useConfirm, useToast } from "@/components/ui";
import { EntityForm, type FieldDef } from "@/components/entity-form";
import { getDb } from "@/core/db/db";
import { archiveRecord, createRecord, inScope, purgeRecord, restoreRecord, trashRecord, unarchiveRecord, type Scope } from "@/core/db/repo";
import type { Row, TableName } from "@/core/db/schema";

export interface FilterDef<R> {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  /** По умолчанию сравнивается поле записи с тем же именем. */
  match?: (row: R, value: string) => boolean;
}

export interface SortDef<R> {
  key: string;
  label: string;
  compare: (a: R, b: R) => number;
}

export interface CrudListProps<T extends TableName> {
  table: T;
  /** Ключ модуля для сохранённых фильтров. */
  module: string;
  fields: FieldDef[] | ((row?: Row<T>) => FieldDef[]);
  labels: { create: string; edit: string; empty: string; emptyHint?: string };
  searchKeys?: string[];
  filters?: FilterDef<Row<T>>[];
  /** Поле с датой (YYYY-MM-DD или ISO) для фильтра по периоду. */
  dateKey?: string;
  sorts?: SortDef<Row<T>>[];
  defaults?: Record<string, unknown>;
  transform?: (data: Record<string, unknown>, existing?: Row<T>) => Record<string, unknown>;
  where?: (row: Row<T>) => boolean;
  render: (row: Row<T>) => ReactNode;
  href?: (row: Row<T>) => string;
  /** Создание на отдельной странице вместо модального окна. */
  newHref?: string;
  editHref?: (row: Row<T>) => string;
  extraActions?: (row: Row<T>) => { label: string; onSelect: () => void }[];
  leading?: (row: Row<T>) => ReactNode;
  pageSize?: number;
  toolbarExtra?: ReactNode;
}

const SCOPES: { value: Scope; label: string }[] = [
  { value: "active", label: "Активные" },
  { value: "archived", label: "Архив" },
  { value: "trash", label: "Корзина" },
];

interface FilterState {
  q: string;
  values: Record<string, string>;
  sort: string;
  from: string;
  to: string;
}

const EMPTY: FilterState = { q: "", values: {}, sort: "", from: "", to: "" };

/** Универсальный список сущностей: поиск, фильтры, сортировка, архив, корзина, пагинация. */
export function CrudList<T extends TableName>(props: CrudListProps<T>) {
  const { table, module, labels, searchKeys = ["title", "description"], filters = [], sorts = [], pageSize = 50 } = props;
  const confirm = useConfirm();
  const toast = useToast();
  const rows = useLiveQuery(() => getDb().rows(table).toArray(), [table]);
  const saved = useLiveQuery(() => getDb().saved_filters.where("module").equals(module).toArray(), [module]);
  const [scope, setScope] = useState<Scope>("active");
  const [state, setState] = useState<FilterState>(EMPTY);
  const [limit, setLimit] = useState(pageSize);
  const [editing, setEditing] = useState<Row<T> | "new" | null>(null);
  const [savingName, setSavingName] = useState<string | null>(null);

  const base = useMemo(() => (rows ?? []).filter((r) => !props.where || props.where(r)), [rows, props]);
  const counts = useMemo(() => ({ active: base.filter((r) => inScope(r, "active")).length, archived: base.filter((r) => inScope(r, "archived")).length, trash: base.filter((r) => inScope(r, "trash")).length }), [base]);

  const filtered = useMemo(() => {
    const q = state.q.trim().toLowerCase();
    let list = base.filter((r) => inScope(r, scope));
    if (q) list = list.filter((r) => searchKeys.some((k) => String((r as Record<string, unknown>)[k] ?? "").toLowerCase().includes(q)));
    for (const f of filters) {
      const v = state.values[f.key];
      if (!v) continue;
      list = list.filter((r) => (f.match ? f.match(r, v) : String((r as Record<string, unknown>)[f.key] ?? "") === v));
    }
    if (props.dateKey && (state.from || state.to)) {
      list = list.filter((r) => {
        const d = String((r as Record<string, unknown>)[props.dateKey!] ?? "").slice(0, 10);
        return !!d && (!state.from || d >= state.from) && (!state.to || d <= state.to);
      });
    }
    const sort = sorts.find((s) => s.key === state.sort) ?? sorts[0];
    return sort ? [...list].sort(sort.compare) : [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [base, scope, state, searchKeys, filters, sorts, props.dateKey]);

  const visible = filtered.slice(0, limit);
  const fieldsFor = (row?: Row<T>) => (typeof props.fields === "function" ? props.fields(row) : props.fields);
  const isFiltered = !!state.q || !!state.from || !!state.to || Object.values(state.values).some(Boolean);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast(done, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось выполнить действие", "error");
    }
  };

  const actions = (row: Row<T>) => {
    const items: { label: string; onSelect: () => void; danger?: boolean }[] = [];
    if (row.deleted_at) {
      items.push({ label: "Восстановить", onSelect: () => void act(() => restoreRecord(table, row.id), "Запись восстановлена") });
      items.push({
        label: "Удалить навсегда",
        danger: true,
        onSelect: async () => {
          if (await confirm({ title: "Удалить навсегда?", message: "Запись и связанные с ней данные будут удалены без возможности восстановления.", confirmLabel: "Удалить навсегда", danger: true })) {
            void act(() => purgeRecord(table, row.id), "Запись удалена");
          }
        },
      });
      return items;
    }
    items.push({ label: "Изменить", onSelect: () => (props.editHref ? (window.location.href = props.editHref(row)) : setEditing(row)) });
    for (const extra of props.extraActions?.(row) ?? []) items.push(extra);
    if (row.archived_at) items.push({ label: "Вернуть из архива", onSelect: () => void act(() => unarchiveRecord(table, row.id), "Запись возвращена из архива") });
    else items.push({ label: "В архив", onSelect: () => void act(() => archiveRecord(table, row.id), "Запись перемещена в архив") });
    items.push({ label: "Удалить", danger: true, onSelect: () => void act(() => trashRecord(table, row.id), "Запись перемещена в корзину") });
    return items;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs label="Раздел списка" value={scope} onChange={(v) => (setScope(v), setLimit(pageSize))} options={SCOPES.map((s) => ({ ...s, count: counts[s.value as "active" | "archived" | "trash"] }))} />
        <div className="flex items-center gap-2">
          {props.toolbarExtra}
          {props.newHref ? (
            <Link href={props.newHref} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90">
              <Plus size={16} /> {labels.create}
            </Link>
          ) : (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus size={16} /> {labels.create}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input aria-label="Поиск" placeholder="Поиск…" className="pl-9" value={state.q} onChange={(e) => setState({ ...state, q: e.target.value })} />
        </div>
        {filters.map((f) => (
          <Select key={f.key} aria-label={f.label} className="w-auto max-w-44" value={state.values[f.key] ?? ""} onChange={(e) => setState({ ...state, values: { ...state.values, [f.key]: e.target.value } })}>
            <option value="">{f.label}: все</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ))}
        {props.dateKey && (
          <>
            <Input type="date" aria-label="Дата с" className="w-auto" value={state.from} onChange={(e) => setState({ ...state, from: e.target.value })} />
            <Input type="date" aria-label="Дата по" className="w-auto" value={state.to} onChange={(e) => setState({ ...state, to: e.target.value })} />
          </>
        )}
        {sorts.length > 1 && (
          <Select aria-label="Сортировка" className="w-auto max-w-48" value={state.sort || sorts[0].key} onChange={(e) => setState({ ...state, sort: e.target.value })}>
            {sorts.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        )}
        {(saved?.length ?? 0) > 0 && (
          <Select
            aria-label="Сохранённые фильтры"
            className="w-auto max-w-48"
            value=""
            onChange={(e) => {
              const f = saved?.find((s) => s.id === e.target.value);
              if (f) setState({ ...EMPTY, ...(f.config as Partial<FilterState>) });
            }}
          >
            <option value="">Сохранённые фильтры</option>
            {saved?.filter((s) => !s.deleted_at).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
        {isFiltered && (
          <>
            <Button size="sm" variant="ghost" onClick={() => setSavingName("")} aria-label="Сохранить фильтр">
              <Star size={15} /> Сохранить
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setState(EMPTY)}>
              Сбросить
            </Button>
          </>
        )}
      </div>

      {savingName !== null && (
        <form
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!savingName.trim()) return;
            await createRecord("saved_filters", { module, name: savingName, config: { ...state } });
            setSavingName(null);
            toast("Фильтр сохранён", "success");
          }}
        >
          <Input aria-label="Название фильтра" placeholder="Название фильтра" className="min-w-40 flex-1" value={savingName} onChange={(e) => setSavingName(e.target.value)} autoFocus />
          <Button type="submit" variant="primary" size="sm">
            Сохранить
          </Button>
          <Button size="sm" onClick={() => setSavingName(null)}>
            Отмена
          </Button>
          {saved?.filter((s) => !s.deleted_at).map((s) => (
            <Button key={s.id} size="sm" variant="ghost" onClick={() => void purgeRecord("saved_filters", s.id)} aria-label={`Удалить фильтр ${s.name}`}>
              <Trash2 size={14} /> {s.name}
            </Button>
          ))}
        </form>
      )}

      {rows === undefined ? (
        <p className="py-8 text-center text-sm text-muted">Загрузка…</p>
      ) : visible.length === 0 ? (
        <EmptyState title={isFiltered ? "Ничего не найдено" : scope === "active" ? labels.empty : scope === "archived" ? "Архив пуст" : "Корзина пуста"} hint={isFiltered ? "Измените условия поиска или сбросьте фильтры." : scope === "active" ? labels.emptyHint : undefined} />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Список записей">
          {visible.map((row) => {
            const href = !row.deleted_at && props.href ? props.href(row) : null;
            return (
              <li key={row.id} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
                {props.leading && !row.deleted_at && props.leading(row)}
                {href ? (
                  <Link href={href} className="min-w-0 flex-1 hover:opacity-80">
                    {props.render(row)}
                  </Link>
                ) : (
                  <div className="min-w-0 flex-1">{props.render(row)}</div>
                )}
                <Menu label="Действия с записью" trigger={<MoreVertical size={18} />} items={actions(row)} />
              </li>
            );
          })}
        </ul>
      )}

      {filtered.length > limit && (
        <Button className="self-center" onClick={() => setLimit(limit + pageSize)}>
          Показать ещё ({filtered.length - limit})
        </Button>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? labels.create : labels.edit}>
        {editing !== null && (
          <EntityForm
            key={editing === "new" ? "new" : editing.id}
            table={table}
            fields={fieldsFor(editing === "new" ? undefined : editing)}
            row={editing === "new" ? undefined : editing}
            defaults={props.defaults}
            transform={props.transform}
            onCancel={() => setEditing(null)}
            onDone={() => {
              setEditing(null);
              toast("Сохранено", "success");
            }}
          />
        )}
      </Modal>
    </div>
  );
}
