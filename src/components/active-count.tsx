"use client";

import type { SyncedTable } from "@/lib/db";
import type { BaseRow } from "@/lib/schema";
import { useRows } from "@/lib/use-rows";

// Сводка для главной: сколько записей раздела в статусе «активно».
export function ActiveCount({ table, label }: { table: SyncedTable; label: string }) {
  const rows = useRows<BaseRow & { status: string }>(table);
  if (rows === undefined) return <>&nbsp;</>;
  if (rows.length === 0) return <>Пока нет данных</>;
  return (
    <span>
      {label}:{" "}
      <b className="font-semibold text-foreground">
        {rows.filter((r) => r.status === "active").length}
      </b>
      {" · "}всего: {rows.length}
    </span>
  );
}
