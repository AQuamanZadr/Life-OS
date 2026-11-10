import { describe, expect, it } from "vitest";
import { syncedTables, type SyncedTable } from "@/lib/db";
import { buildBackup, parseBackup, type BackupTables } from "./backup";

const at = "2026-11-10T10:00:00.000Z";
const base = { createdAt: at, updatedAt: at, deletedAt: null };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const goal = { ...base, id: id(1), title: "Цель", notes: "", status: "active", targetDate: null, progress: 10 };
const project = { ...base, id: id(2), title: "Проект", notes: "", status: "active", dueDate: null, goalId: id(1) };
const task = {
  ...base,
  id: id(3),
  title: "Задача",
  notes: "",
  status: "todo",
  priority: "medium",
  dueDate: null,
  projectId: id(2),
  goalId: null,
  completedAt: null,
};
const habit = { ...base, id: id(4), title: "Привычка", notes: "", status: "active", weekdays: [1, 2] };
const log = { ...base, id: id(5), habitId: id(4), date: "2026-11-10", done: true };
const tx = { ...base, id: id(6), type: "expense", amountMinor: 1050, date: "2026-11-10", category: "food", note: "" };

function tables(over: Partial<Record<SyncedTable, unknown[]>> = {}): BackupTables {
  return {
    goals: [goal],
    projects: [project],
    tasks: [task],
    habits: [habit],
    habit_logs: [log],
    transactions: [tx],
    ...over,
  } as BackupTables;
}

const none = Object.fromEntries(
  syncedTables.map((t) => [t, new Set<string>()]),
) as unknown as Record<
  SyncedTable,
  ReadonlySet<string>
>;

describe("резервная копия", () => {
  it("экспорт и разбор сохраняют все записи без изменений", () => {
    const parsed = parseBackup(buildBackup(tables(), at), none);
    expect(parsed).not.toBeNull();
    expect(parsed!.total).toBe(6);
    expect(parsed!.skipped).toBe(0);
    expect(parsed!.tables).toEqual(tables());
    expect(parsed!.tables.transactions[0]).toMatchObject({ amountMinor: 1050 });
  });

  it("отклоняет не-JSON и чужие файлы", () => {
    expect(parseBackup("не json", none)).toBeNull();
    expect(parseBackup(JSON.stringify({ hello: 1 }), none)).toBeNull();
    expect(
      parseBackup(JSON.stringify({ format: "life-os-backup", version: 99, exportedAt: at, tables: {} }), none),
    ).toBeNull();
  });

  it("пропускает некорректные записи, остальные сохраняет", () => {
    const bad = { ...tx, id: id(7), amountMinor: -5 };
    const parsed = parseBackup(buildBackup(tables({ transactions: [tx, bad, "мусор"] }), at), none)!;
    expect(parsed.tables.transactions).toHaveLength(1);
    expect(parsed.skipped).toBe(2);
  });

  it("обнуляет ссылку на отсутствующий проект и пропускает отметку без привычки", () => {
    const parsed = parseBackup(buildBackup(tables({ projects: [], habits: [] }), at), none)!;
    expect(parsed.tables.tasks[0]).toMatchObject({ projectId: null });
    expect(parsed.tables.habit_logs).toHaveLength(0);
    expect(parsed.skipped).toBe(1);
  });

  it("сохраняет ссылку, если запись уже есть на устройстве", () => {
    const existing = { ...none, projects: new Set([id(2)]) };
    const parsed = parseBackup(buildBackup(tables({ projects: [] }), at), existing)!;
    expect(parsed.tables.tasks[0]).toMatchObject({ projectId: id(2) });
  });
});
