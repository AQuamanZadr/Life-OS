import { describe, expect, it } from "vitest";
import { defaultTaskFilter, filterTasks, isOverdue } from "./filter";
import { taskInputSchema, type Task } from "./schema";

function task(over: Partial<Task>): Task {
  return {
    id: over.id ?? "1",
    title: "Задача",
    notes: "",
    status: "todo",
    priority: "medium",
    dueDate: null,
    projectId: null,
    goalId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    deletedAt: null,
    ...over,
  };
}

describe("filterTasks", () => {
  const tasks = [
    task({ id: "a", title: "Купить молоко" }),
    task({ id: "b", title: "Отчёт", status: "done" }),
    task({ id: "c", title: "Позвонить", deletedAt: "2026-01-02T00:00:00.000Z" }),
    task({ id: "d", title: "Налоги", priority: "high", notes: "до конца МЕСЯЦА" }),
  ];

  it("по умолчанию скрывает выполненные и удалённые", () => {
    expect(filterTasks(tasks, defaultTaskFilter).map((t) => t.id)).toEqual([
      "d",
      "a",
    ]);
  });

  it("никогда не показывает удалённые", () => {
    const ids = filterTasks(tasks, { ...defaultTaskFilter, status: "all" }).map(
      (t) => t.id,
    );
    expect(ids).not.toContain("c");
    expect(ids).toHaveLength(3);
  });

  it("ищет по названию и заметкам без учёта регистра", () => {
    const find = (query: string) =>
      filterTasks(tasks, { ...defaultTaskFilter, query }).map((t) => t.id);
    expect(find("МОЛОКО")).toEqual(["a"]);
    expect(find("месяца")).toEqual(["d"]);
  });

  it("фильтрует по статусу и приоритету", () => {
    expect(
      filterTasks(tasks, { ...defaultTaskFilter, status: "done" }).map((t) => t.id),
    ).toEqual(["b"]);
    expect(
      filterTasks(tasks, { ...defaultTaskFilter, priority: "high" }).map((t) => t.id),
    ).toEqual(["d"]);
  });

  it("сортирует: срок раньше — выше, без срока и выполненные — в конце", () => {
    const list = [
      task({ id: "none" }),
      task({ id: "done", status: "done", dueDate: "2026-01-01" }),
      task({ id: "late", dueDate: "2026-03-01" }),
      task({ id: "soon", dueDate: "2026-02-01" }),
    ];
    expect(
      filterTasks(list, { ...defaultTaskFilter, status: "all" }).map((t) => t.id),
    ).toEqual(["soon", "late", "none", "done"]);
  });
});

describe("isOverdue", () => {
  it("срок сегодня — не просрочено, вчера — просрочено", () => {
    expect(isOverdue(task({ dueDate: "2026-05-10" }), "2026-05-10")).toBe(false);
    expect(isOverdue(task({ dueDate: "2026-05-09" }), "2026-05-10")).toBe(true);
  });

  it("выполненная задача не считается просроченной", () => {
    expect(
      isOverdue(task({ dueDate: "2026-05-09", status: "done" }), "2026-05-10"),
    ).toBe(false);
  });
});

describe("taskInputSchema", () => {
  const base = {
    title: "  Задача  ",
    notes: "",
    status: "todo",
    priority: "medium",
    dueDate: null,
  };

  it("обрезает пробелы в названии", () => {
    expect(taskInputSchema.parse(base).title).toBe("Задача");
  });

  it("отклоняет пустое название и несуществующую дату", () => {
    expect(taskInputSchema.safeParse({ ...base, title: "   " }).success).toBe(false);
    expect(
      taskInputSchema.safeParse({ ...base, dueDate: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      taskInputSchema.safeParse({ ...base, dueDate: "2026-02-28" }).success,
    ).toBe(true);
  });
});
