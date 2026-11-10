import { describe, expect, it } from "vitest";
import { getDb } from "../db/db";
import { createRecord, purgeRecord, trashRecord, updateRecord } from "../db/repo";
import { MemoryRemote } from "./memory-remote";
import { pendingCount, resolveConflict, sameContent, syncNow, toLocalRow } from "./engine";
import { accountBalance } from "@/modules/finance/domain";
import { normalizeAmount } from "../lib/money";
import type { Transaction } from "../db/schema";

describe("синхронизация: отправка", () => {
  it("отправляет новые записи и запоминает версию сервера", async () => {
    const remote = new MemoryRemote();
    const task = await createRecord("tasks", { title: "Задача" });
    const res = await syncNow(remote);
    expect(res).toMatchObject({ pushed: 1, conflicts: 0, failed: 0, offline: false });
    expect(remote.rows("tasks")).toHaveLength(1);
    expect((await getDb().tasks.get(task.id))!.version).toBe(1);
    expect(await pendingCount()).toBe(0);
    await updateRecord("tasks", task.id, { title: "Задача 2" });
    await syncNow(remote);
    expect(remote.rows("tasks")[0]).toMatchObject({ title: "Задача 2", version: 2 });
    expect((await getDb().tasks.get(task.id))!.version).toBe(2);
  });

  it("без сети изменения остаются в очереди и уходят после восстановления связи", async () => {
    const remote = new MemoryRemote();
    remote.offline = true;
    await createRecord("tasks", { title: "офлайн-задача" });
    await createRecord("notes", { title: "офлайн-заметка" });
    const res = await syncNow(remote);
    expect(res.offline).toBe(true);
    expect(await pendingCount()).toBe(2);
    expect(remote.rows("tasks")).toHaveLength(0);
    remote.offline = false;
    const again = await syncNow(remote);
    expect(again).toMatchObject({ pushed: 2, offline: false, error: null });
    expect(await pendingCount()).toBe(0);
    expect(remote.rows("tasks")).toHaveLength(1);
    expect(remote.rows("notes")).toHaveLength(1);
  });

  it("повторная отправка после потерянного ответа не создаёт дублей", async () => {
    const remote = new MemoryRemote();
    const account = await createRecord("accounts", { name: "Карта", currency: "KZT", opening_balance: "1000" });
    await syncNow(remote);
    await createRecord("transactions", { account_id: account.id, transaction_type: "expense", amount: "250.00", currency: "KZT", transaction_date: "2026-11-10" });
    remote.dropResponses = 1;
    const first = await syncNow(remote);
    expect(first.offline).toBe(true);
    expect(remote.rows("transactions")).toHaveLength(1);
    expect(await pendingCount()).toBe(1);
    await syncNow(remote);
    await syncNow(remote);
    expect(remote.rows("transactions")).toHaveLength(1);
    expect(await pendingCount()).toBe(0);
    expect(await getDb().sync_conflicts.count()).toBe(0);
    const txs = remote.rows("transactions").map((r) => toLocalRow(r)) as Transaction[];
    expect(normalizeAmount(accountBalance(account, txs))).toBe("750.00");
    expect((await getDb().transactions.toArray())[0].version).toBe(1);
  });

  it("потерянный ответ на обновление тоже обрабатывается идемпотентно", async () => {
    const remote = new MemoryRemote();
    const task = await createRecord("tasks", { title: "a" });
    await syncNow(remote);
    await updateRecord("tasks", task.id, { title: "b" });
    remote.dropResponses = 1;
    await syncNow(remote);
    expect(remote.rows("tasks")[0].version).toBe(2);
    const res = await syncNow(remote);
    expect(res.conflicts).toBe(0);
    expect(remote.rows("tasks")[0]).toMatchObject({ title: "b", version: 2 });
    expect((await getDb().tasks.get(task.id))!.version).toBe(2);
  });

  it("параллельные запуски синхронизации объединяются", async () => {
    const remote = new MemoryRemote();
    await createRecord("tasks", { title: "x" });
    const [a, b] = await Promise.all([syncNow(remote), syncNow(remote)]);
    expect(a).toBe(b);
    expect(remote.rows("tasks")).toHaveLength(1);
  });

  it("дожидается связанной записи при нарушении порядка", async () => {
    const remote = new MemoryRemote();
    const task = await createRecord("tasks", { title: "Задача" });
    const project = await createRecord("projects", { title: "Проект" });
    await updateRecord("tasks", task.id, { project_id: project.id });
    await updateRecord("projects", project.id, { title: "Проект 2" });
    // Теперь операция задачи стоит в очереди раньше операции проекта.
    const res = await syncNow(remote);
    expect(res).toMatchObject({ pushed: 2, failed: 0 });
    expect(remote.rows("tasks")[0].project_id).toBe(project.id);
  });

  it("запись, отклонённая сервером, помечается ошибкой и не блокирует остальные", async () => {
    const remote = new MemoryRemote();
    await createRecord("time_entries", { started_at: "2026-11-10T10:00:00.000Z" });
    await syncNow(remote);
    // На другом устройстве уже идёт таймер — сервер отклонит наш.
    remote.serverEdit("time_entries", remote.rows("time_entries")[0].id, {});
    await getDb().time_entries.clear();
    await createRecord("time_entries", { started_at: "2026-11-10T12:00:00.000Z" });
    await createRecord("tasks", { title: "проходит" });
    const res = await syncNow(remote);
    expect(res.failed).toBe(1);
    expect(remote.rows("tasks")).toHaveLength(1);
    const failed = await getDb().sync_operations.where("status").equals("failed").toArray();
    expect(failed).toHaveLength(1);
    expect(failed[0].last_error).toContain("таймер");
  });

  it("удаление отправляется и идемпотентно", async () => {
    const remote = new MemoryRemote();
    const task = await createRecord("tasks", { title: "x" });
    await syncNow(remote);
    await purgeRecord("tasks", task.id);
    remote.dropResponses = 1;
    await syncNow(remote);
    await syncNow(remote);
    expect(remote.rows("tasks")).toHaveLength(0);
    expect(await pendingCount()).toBe(0);
  });
});

describe("синхронизация: загрузка", () => {
  it("загружает изменения с сервера и не поднимает их обратно", async () => {
    const remote = new MemoryRemote();
    const task = await createRecord("tasks", { title: "a" });
    await syncNow(remote);
    remote.serverEdit("tasks", task.id, { title: "изменено на телефоне" });
    const res = await syncNow(remote);
    expect(res.pulled).toBe(1);
    expect(await getDb().tasks.get(task.id)).toMatchObject({ title: "изменено на телефоне", version: 2 });
    expect(await pendingCount()).toBe(0);
    const calm = await syncNow(remote);
    expect(calm).toMatchObject({ pushed: 0, pulled: 0 });
  });

  it("второе устройство получает все данные без дублей", async () => {
    const remote = new MemoryRemote();
    const goal = await createRecord("goals", { title: "Цель", goal_type: "milestones" });
    await createRecord("goal_milestones", { goal_id: goal.id, title: "Этап" });
    await syncNow(remote);
    // «Новое устройство»: пустая локальная база.
    const db = getDb();
    await Promise.all(db.tables.map((t) => t.clear()));
    await syncNow(remote);
    await syncNow(remote);
    expect(await db.goals.count()).toBe(1);
    expect(await db.goal_milestones.count()).toBe(1);
    expect(await pendingCount()).toBe(0);
  });

  it("удаление на другом устройстве приходит как tombstone", async () => {
    const remote = new MemoryRemote();
    const task = await createRecord("tasks", { title: "x" });
    await syncNow(remote);
    await remote.remove("tasks", task.id);
    await syncNow(remote);
    expect(await getDb().tasks.count()).toBe(0);
  });

  it("приводит серверные значения к локальной форме", () => {
    const row = toLocalRow({ id: "x", user_id: "u", last_op_id: null, server_updated_at: "t", amount: "1500.50000000", created_at: "2026-11-10T03:40:00.123456+00:00", title: "1.50" });
    expect(row).toEqual({ id: "x", amount: "1500.50", created_at: "2026-11-10T03:40:00.123Z", title: "1.50" });
    expect(sameContent({ amount: "10.5", a: null }, { amount: "10.50000000", version: 9 })).toBe(true);
    expect(sameContent({ title: "a" }, { title: "b" })).toBe(false);
  });
});

describe("синхронизация: конфликты", () => {
  async function conflictSetup() {
    const remote = new MemoryRemote();
    const task = await createRecord("tasks", { title: "исходное" });
    await syncNow(remote);
    remote.serverEdit("tasks", task.id, { title: "с телефона" });
    await updateRecord("tasks", task.id, { title: "с компьютера" });
    const res = await syncNow(remote);
    return { remote, task, res };
  }

  it("не перезаписывает чужое изменение молча", async () => {
    const { remote, task, res } = await conflictSetup();
    expect(res.conflicts).toBe(1);
    expect(remote.rows("tasks")[0].title).toBe("с телефона");
    expect((await getDb().tasks.get(task.id))!.title).toBe("с компьютера");
    const conflicts = await getDb().sync_conflicts.toArray();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].local).toMatchObject({ title: "с компьютера" });
    expect(conflicts[0].remote).toMatchObject({ title: "с телефона" });
    // Повторная синхронизация не плодит конфликты.
    await syncNow(remote);
    expect(await getDb().sync_conflicts.count()).toBe(1);
  });

  it("ручное решение: оставить локальную версию", async () => {
    const { remote, task } = await conflictSetup();
    const [conflict] = await getDb().sync_conflicts.toArray();
    await resolveConflict(conflict.id, "local");
    await syncNow(remote);
    expect(remote.rows("tasks")[0]).toMatchObject({ title: "с компьютера", version: 3 });
    expect((await getDb().tasks.get(task.id))!.version).toBe(3);
    expect(await getDb().sync_conflicts.count()).toBe(0);
  });

  it("ручное решение: принять серверную версию", async () => {
    const { remote, task } = await conflictSetup();
    const [conflict] = await getDb().sync_conflicts.toArray();
    await resolveConflict(conflict.id, "remote");
    expect(await getDb().tasks.get(task.id)).toMatchObject({ title: "с телефона", version: 2 });
    expect(await pendingCount()).toBe(0);
    await syncNow(remote);
    expect(remote.rows("tasks")[0].title).toBe("с телефона");
  });

  it("одинаковые изменения на двух устройствах конфликтом не считаются", async () => {
    const remote = new MemoryRemote();
    const task = await createRecord("tasks", { title: "a" });
    await syncNow(remote);
    remote.serverEdit("tasks", task.id, { status: "done" });
    await updateRecord("tasks", task.id, { status: "done" });
    remote.serverEdit("tasks", task.id, { updated_at: (await getDb().tasks.get(task.id))!.updated_at });
    const res = await syncNow(remote);
    expect(res.conflicts).toBe(0);
    expect(await pendingCount()).toBe(0);
  });

  it("изменение записи, удалённой на другом устройстве, — конфликт", async () => {
    const remote = new MemoryRemote();
    const task = await createRecord("tasks", { title: "a" });
    await syncNow(remote);
    await remote.remove("tasks", task.id);
    await updateRecord("tasks", task.id, { title: "b" });
    const res = await syncNow(remote);
    expect(res.conflicts).toBe(1);
    expect(await getDb().tasks.count()).toBe(1);
    const [conflict] = await getDb().sync_conflicts.toArray();
    expect(conflict.remote).toBeNull();
    await resolveConflict(conflict.id, "local");
    await syncNow(remote);
    expect(remote.rows("tasks")).toHaveLength(1);
  });

  it("некритичные таблицы разрешаются автоматически по времени изменения", async () => {
    const remote = new MemoryRemote();
    const habit = await createRecord("habits", { title: "h", start_date: "2026-01-01" });
    const log = await createRecord("habit_logs", { habit_id: habit.id, log_date: "2026-11-10", value: 1 });
    await syncNow(remote);
    remote.serverEdit("habit_logs", log.id, { value: 5, updated_at: "2020-01-01T00:00:00.000Z" });
    await updateRecord("habit_logs", log.id, { value: 3 });
    const res = await syncNow(remote);
    expect(res.conflicts).toBe(0);
    expect(remote.rows("habit_logs")[0].value).toBe(3);

    remote.serverEdit("habit_logs", log.id, { value: 9, updated_at: "2099-01-01T00:00:00.000Z" });
    await updateRecord("habit_logs", log.id, { value: 4 });
    await syncNow(remote);
    expect((await getDb().habit_logs.get(log.id))!.value).toBe(9);
    expect(await pendingCount()).toBe(0);
  });

  it("изменение во время отправки не теряется", async () => {
    const remote = new MemoryRemote();
    const task = await createRecord("tasks", { title: "v1" });
    const origInsert = remote.insert.bind(remote);
    remote.insert = async (...args) => {
      const out = await origInsert(...args);
      // Пользователь правит запись, пока запрос ещё в пути.
      await updateRecord("tasks", task.id, { title: "v2" });
      return out;
    };
    await syncNow(remote);
    remote.insert = origInsert;
    expect((await getDb().tasks.get(task.id))!.title).toBe("v2");
    await syncNow(remote);
    expect(remote.rows("tasks")[0]).toMatchObject({ title: "v2", version: 2 });
    expect(await pendingCount()).toBe(0);
    expect(await getDb().sync_conflicts.count()).toBe(0);
  });

  it("корзина синхронизируется как обычное изменение", async () => {
    const remote = new MemoryRemote();
    const note = await createRecord("notes", { title: "n" });
    await syncNow(remote);
    await trashRecord("notes", note.id);
    await syncNow(remote);
    expect(remote.rows("notes")[0].deleted_at).toBeTruthy();
  });
});
