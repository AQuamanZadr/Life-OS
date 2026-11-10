import { describe, expect, it } from "vitest";
import { getDb } from "../db/db";
import { createRecord, purgeRecord, updateRecord } from "../db/repo";
import { buildBackup, isEncryptedBackup, restoreBackup, runAutoBackup, serializeBackup, testRestore, toCsv, verifyBackup } from "./backup";
import { MemoryRemote } from "../sync/memory-remote";
import { syncNow } from "../sync/engine";

async function seed() {
  const account = await createRecord("accounts", { name: "Карта", currency: "KZT", opening_balance: "100.50" });
  await createRecord("transactions", { account_id: account.id, transaction_type: "expense", amount: "10.25", currency: "KZT", transaction_date: "2026-11-10" });
  const goal = await createRecord("goals", { title: "Цель", goal_type: "milestones" });
  await createRecord("goal_milestones", { goal_id: goal.id, title: "Этап" });
  const note = await createRecord("notes", { title: "Заметка", content: "# Текст\n«кавычки» и emoji 🎯" });
  return { account, goal, note };
}

describe("резервные копии", () => {
  it("создаёт копию и проходит проверку целостности", async () => {
    await seed();
    const backup = await buildBackup();
    expect(backup.counts.transactions).toBe(1);
    const report = await verifyBackup(await serializeBackup(backup));
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.total).toBe(5);
  });

  it("шифрует копию и расшифровывает только верным паролем", async () => {
    await seed();
    const text = await serializeBackup(await buildBackup(), "correct horse battery");
    expect(isEncryptedBackup(text)).toBe(true);
    expect(text).not.toContain("Заметка");
    expect(text).not.toContain("10.25");
    expect((await verifyBackup(text)).ok).toBe(false);
    const wrong = await verifyBackup(text, "wrong password");
    expect(wrong.ok).toBe(false);
    expect(wrong.errors[0]).toContain("расшифровать");
    expect((await verifyBackup(text, "correct horse battery")).ok).toBe(true);
  }, 30_000);

  it("обнаруживает повреждение и подмену данных", async () => {
    await seed();
    const backup = await buildBackup();
    const tampered = structuredClone(backup);
    tampered.tables.transactions[0].amount = "9999.00";
    expect((await verifyBackup(JSON.stringify(tampered))).errors.join()).toContain("Контрольная сумма");
    expect((await verifyBackup("{не json")).ok).toBe(false);
    expect((await verifyBackup(JSON.stringify({ format: "other" }))).ok).toBe(false);
    const invalid = structuredClone(backup);
    invalid.tables.transactions[0].amount = "-5";
    expect((await verifyBackup(JSON.stringify(invalid))).ok).toBe(false);
    const truncated = (await serializeBackup(backup)).slice(0, -20);
    expect((await verifyBackup(truncated)).ok).toBe(false);
  });

  it("восстанавливает состояние после потери и порчи данных", async () => {
    const { note, account } = await seed();
    const backup = await buildBackup();
    await purgeRecord("notes", note.id);
    await updateRecord("accounts", account.id, { name: "Испорчено" });
    const extra = await createRecord("tasks", { title: "появилась после копии" });
    const res = await restoreBackup(backup, "replace");
    expect(res).toMatchObject({ created: 1, updated: 1, removed: 1 });
    const db = getDb();
    expect((await db.notes.get(note.id))!.content).toContain("🎯");
    expect((await db.accounts.get(account.id))!.name).toBe("Карта");
    expect(await db.tasks.get(extra.id)).toBeUndefined();
    const after = await buildBackup();
    expect(after.counts).toEqual(backup.counts);
  });

  it("режим объединения не удаляет новые записи", async () => {
    await seed();
    const backup = await buildBackup();
    const extra = await createRecord("tasks", { title: "новая" });
    const res = await restoreBackup(backup, "merge");
    expect(res).toMatchObject({ created: 0, updated: 0, removed: 0, unchanged: 5 });
    expect(await getDb().tasks.get(extra.id)).toBeTruthy();
  });

  it("повторное восстановление не создаёт дублей", async () => {
    await seed();
    const backup = await buildBackup();
    await restoreBackup(backup, "replace");
    await restoreBackup(backup, "replace");
    expect((await buildBackup()).counts).toEqual(backup.counts);
    expect(await getDb().transactions.count()).toBe(1);
  });

  it("восстановление синхронизируется с облаком без дублей", async () => {
    const remote = new MemoryRemote();
    const { note } = await seed();
    await syncNow(remote);
    const backup = await buildBackup();
    await purgeRecord("notes", note.id);
    await createRecord("tasks", { title: "лишняя" });
    await syncNow(remote);
    expect(remote.rows("notes")).toHaveLength(0);
    await restoreBackup(backup, "replace");
    const res = await syncNow(remote);
    expect(res).toMatchObject({ conflicts: 0, failed: 0 });
    expect(remote.rows("notes")).toHaveLength(1);
    expect(remote.rows("tasks")).toHaveLength(0);
    expect(remote.rows("transactions")).toHaveLength(1);
    expect(remote.rows("accounts")).toHaveLength(1);
  });

  it("тестовое восстановление не трогает рабочую базу", async () => {
    await seed();
    const backup = await buildBackup();
    const queued = await getDb().sync_operations.count();
    const res = await testRestore(backup);
    expect(res.ok).toBe(true);
    expect(res.records).toBe(5);
    expect(await getDb().sync_operations.count()).toBe(queued);
    expect((await buildBackup()).checksum).toBe(backup.checksum);
  });

  it("автоматическая копия создаётся не чаще раза в сутки и хранит последние пять", async () => {
    expect(await runAutoBackup()).toBe(false);
    await seed();
    expect(await runAutoBackup()).toBe(true);
    expect(await runAutoBackup()).toBe(false);
    for (let i = 0; i < 7; i++) await runAutoBackup(true);
    const autos = await getDb().backup_history.toArray();
    expect(autos).toHaveLength(5);
    expect((await verifyBackup(autos[0].content!)).ok).toBe(true);
  });
});

describe("экспорт CSV", () => {
  it("экранирует значения и защищает от формул", () => {
    const csv = toCsv([{ a: 'x "y"', b: "1,5", c: "=SUM(A1)", d: null, e: "-5.20", f: "строка\nдве" }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"x ""y"""');
    expect(csv).toContain('"1,5"');
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain(",-5.20,");
    expect(csv).toContain('"строка\nдве"');
    expect(toCsv([], ["a", "b"])).toBe("﻿a,b");
  });
});
