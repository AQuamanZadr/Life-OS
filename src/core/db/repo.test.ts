import { describe, expect, it } from "vitest";
import { getDb } from "./db";
import { archiveRecord, BusinessRuleError, createRecord, listRecords, purgeRecord, restoreRecord, trashRecord, unarchiveRecord, updateRecord, ValidationError } from "./repo";
import { deterministicId, newId } from "../lib/ids";

const ops = () => getDb().sync_operations.orderBy("seq").toArray();

describe("репозиторий: CRUD", () => {
  it("создаёт запись, ставит её в очередь синхронизации и в журнал", async () => {
    const task = await createRecord("tasks", { title: "  Купить хлеб  " });
    expect(task.title).toBe("Купить хлеб");
    expect(task.status).toBe("todo");
    expect(task.version).toBe(0);
    expect(await getDb().tasks.count()).toBe(1);
    const queue = await ops();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ operation_type: "upsert", entity_type: "tasks", entity_id: task.id, status: "pending", base_version: 0 });
    expect(await getDb().audit_logs.count()).toBe(1);
  });

  it("двойное сохранение одной формы не создаёт дубль", async () => {
    const id = newId();
    const [a, b] = await Promise.all([createRecord("tasks", { title: "Один раз" }, { id }), createRecord("tasks", { title: "Один раз" }, { id })]);
    expect(a.id).toBe(b.id);
    await createRecord("tasks", { title: "Один раз" }, { id });
    expect(await getDb().tasks.count()).toBe(1);
    expect(await ops()).toHaveLength(1);
  });

  it("отклоняет некорректные данные и ничего не сохраняет", async () => {
    await expect(createRecord("tasks", { title: "" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createRecord("tasks", { title: "x", due_date: "2026-02-30" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createRecord("habits", { title: "x", start_date: "2026-01-01", habit_type: "numeric", target_value: -1 })).rejects.toBeInstanceOf(ValidationError);
    expect(await getDb().tasks.count()).toBe(0);
    expect(await ops()).toHaveLength(0);
    const err = await createRecord("tasks", { title: "" }).catch((e) => e as ValidationError);
    expect(err.fields.title).toBeTruthy();
  });

  it("обновление объединяется с неотправленной операцией", async () => {
    const task = await createRecord("tasks", { title: "a" });
    await updateRecord("tasks", task.id, { title: "b" });
    const updated = await updateRecord("tasks", task.id, { status: "done" });
    expect(updated.title).toBe("b");
    expect(Date.parse(updated.updated_at)).toBeGreaterThanOrEqual(Date.parse(task.updated_at));
    const queue = await ops();
    expect(queue).toHaveLength(1);
    expect(queue[0].operation_payload).toMatchObject({ title: "b", status: "done" });
    expect(queue[0].base_version).toBe(0);
  });

  it("некорректное обновление не меняет запись", async () => {
    const task = await createRecord("tasks", { title: "a" });
    await expect(updateRecord("tasks", task.id, { title: "   " })).rejects.toBeInstanceOf(ValidationError);
    expect((await getDb().tasks.get(task.id))!.title).toBe("a");
  });

  it("архив, корзина и восстановление", async () => {
    const note = await createRecord("notes", { title: "Заметка" });
    await archiveRecord("notes", note.id);
    expect(await listRecords("notes", "active")).toHaveLength(0);
    expect(await listRecords("notes", "archived")).toHaveLength(1);
    await unarchiveRecord("notes", note.id);
    await trashRecord("notes", note.id);
    expect(await listRecords("notes", "active")).toHaveLength(0);
    expect(await listRecords("notes", "trash")).toHaveLength(1);
    await restoreRecord("notes", note.id);
    expect(await listRecords("notes", "active")).toHaveLength(1);
  });

  it("окончательное удаление каскадно убирает зависимые записи и связи", async () => {
    const goal = await createRecord("goals", { title: "Цель", goal_type: "milestones" });
    await createRecord("goal_milestones", { goal_id: goal.id, title: "Этап" });
    const task = await createRecord("tasks", { title: "Задача", goal_id: goal.id });
    const habit = await createRecord("habits", { title: "Привычка", start_date: "2026-01-01" });
    await createRecord("entity_links", { from_type: "goal", from_id: goal.id, to_type: "habit", to_id: habit.id });
    await purgeRecord("goals", goal.id);
    expect(await getDb().goals.count()).toBe(0);
    expect(await getDb().goal_milestones.count()).toBe(0);
    expect(await getDb().entity_links.count()).toBe(0);
    expect((await getDb().tasks.get(task.id))!.goal_id).toBeNull();
    expect(await getDb().habits.count()).toBe(1);
  });

  it("запись, созданная и удалённая до синхронизации, не уходит на сервер", async () => {
    const task = await createRecord("tasks", { title: "временная" });
    await purgeRecord("tasks", task.id);
    expect(await ops()).toHaveLength(0);
  });
});

describe("репозиторий: бизнес-правила", () => {
  it("запрещает второй активный таймер", async () => {
    const first = await createRecord("time_entries", { started_at: "2026-11-10T10:00:00.000Z" });
    await expect(createRecord("time_entries", { started_at: "2026-11-10T10:05:00.000Z" })).rejects.toBeInstanceOf(BusinessRuleError);
    const results = await Promise.allSettled([createRecord("time_entries", { started_at: "2026-11-10T10:06:00.000Z" }), createRecord("time_entries", { started_at: "2026-11-10T10:07:00.000Z" })]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    await updateRecord("time_entries", first.id, { ended_at: "2026-11-10T11:00:00.000Z", duration_seconds: 3600 });
    await expect(createRecord("time_entries", { started_at: "2026-11-10T11:05:00.000Z" })).resolves.toBeTruthy();
    expect(await getDb().time_entries.count()).toBe(2);
  });

  it("одновременный запуск двух таймеров создаёт только один", async () => {
    const results = await Promise.allSettled([createRecord("time_entries", { started_at: "2026-11-10T10:00:00.000Z" }), createRecord("time_entries", { started_at: "2026-11-10T10:00:01.000Z" })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await getDb().time_entries.count()).toBe(1);
  });

  it("одна запись привычки на день", async () => {
    const habit = await createRecord("habits", { title: "Чтение", start_date: "2026-01-01" });
    const id = deterministicId("habit-log", habit.id, "2026-11-10");
    await createRecord("habit_logs", { habit_id: habit.id, log_date: "2026-11-10", value: 1 }, { id });
    await createRecord("habit_logs", { habit_id: habit.id, log_date: "2026-11-10", value: 1 }, { id });
    await expect(createRecord("habit_logs", { habit_id: habit.id, log_date: "2026-11-10", value: 1 })).rejects.toBeInstanceOf(BusinessRuleError);
    expect(await getDb().habit_logs.count()).toBe(1);
  });

  it("запрещает циклическую вложенность", async () => {
    const a = await createRecord("tasks", { title: "a" });
    const b = await createRecord("tasks", { title: "b", parent_task_id: a.id });
    await expect(updateRecord("tasks", a.id, { parent_task_id: b.id })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateRecord("tasks", a.id, { parent_task_id: a.id })).rejects.toBeInstanceOf(ValidationError);
  });
});
