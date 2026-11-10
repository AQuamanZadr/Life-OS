/**
 * Интеграционные тесты: движок синхронизации + SupabaseRemote против настоящих
 * PostgreSQL и PostgREST со схемой из supabase/migrations.
 * Запуск: scripts/test-integration.sh (в CI — задание integration).
 */
import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, LifeOsDb, setDb } from "@/core/db/db";
import { createRecord, purgeRecord, updateRecord } from "@/core/db/repo";
import { SETTINGS_ID } from "@/core/db/schema";
import { pendingCount, resolveConflict, syncNow } from "@/core/sync/engine";
import { SupabaseRemote } from "@/core/sync/supabase";
import { accountBalance } from "@/modules/finance/domain";
import { normalizeAmount } from "@/core/lib/money";
import { buildBackup, restoreBackup } from "@/core/backup/backup";

const URL = process.env.PGRST_URL!;
const SECRET = process.env.PGRST_JWT_SECRET!;
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function jwt(sub: string, exp = Math.floor(Date.now() / 1000) + 3600): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role: "authenticated", exp })}`;
  return `${body}.${createHmac("sha256", SECRET).update(body).digest("base64url")}`;
}

interface Net {
  /** Сколько следующих ответов «потерять» уже после того, как сервер выполнил запрос. */
  dropResponses: number;
  offline: boolean;
}

function client(sub: string, net: Net = { dropResponses: 0, offline: false }, exp?: number): SupabaseClient {
  return createClient(URL, "anon", {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => jwt(sub, exp),
    global: {
      fetch: async (input, init) => {
        if (net.offline) throw new TypeError("fetch failed");
        const res = await fetch(String(input).replace("/rest/v1", ""), init);
        if (net.dropResponses > 0 && init?.method && init.method !== "GET") {
          net.dropResponses--;
          await res.arrayBuffer();
          throw new TypeError("fetch failed");
        }
        return res;
      },
    },
  });
}

/** Отдельное «устройство» — своя локальная база. */
async function device<T>(db: LifeOsDb, fn: () => Promise<T>): Promise<T> {
  const prev = getDb();
  setDb(db);
  try {
    return await fn();
  } finally {
    setDb(prev);
  }
}

let seq = 0;
async function newDevice(): Promise<LifeOsDb> {
  const db = new LifeOsDb(`it-device-${process.pid}-${Date.now()}-${seq++}`);
  await db.open();
  return db;
}

const TABLES = ["entity_links", "saved_filters", "events", "life_balance", "journal_entries", "notes", "health_records", "custom_metrics", "budgets", "transactions", "accounts", "time_entries", "skills", "books", "course_lessons", "courses", "tasks", "projects", "habit_logs", "habits", "goal_milestones", "goals", "tags", "categories", "user_settings"];

beforeEach(async () => {
  for (const sub of [USER_A, USER_B]) {
    const c = client(sub);
    for (const t of TABLES) {
      const { error } = await c.from(t).delete().not("id", "is", null);
      if (error) throw new Error(`${t}: ${error.message}`);
    }
  }
});

describe("SupabaseRemote на настоящем PostgreSQL", () => {
  it("записи всех модулей доходят до второго устройства без искажений", async () => {
    const remote = new SupabaseRemote(client(USER_A), USER_A);
    const cat = await createRecord("categories", { name: "Еда", type: "expense" });
    const area = await createRecord("categories", { name: "Здоровье", type: "life_area" });
    const goal = await createRecord("goals", { title: "Марафон", goal_type: "numeric", target_value: 42.195, current_value: 10.5, unit: "км", deadline: "2027-05-01", category_id: cat.id });
    await createRecord("goal_milestones", { goal_id: goal.id, title: "10 км", completed_at: "2026-11-01T08:00:00.000Z" });
    const habit = await createRecord("habits", { title: "Бег", start_date: "2026-01-01", frequency: "weekdays", schedule_config: { weekdays: [1, 3, 5] } });
    await createRecord("habit_logs", { habit_id: habit.id, log_date: "2026-11-09", value: 1 });
    const project = await createRecord("projects", { title: "Подготовка", goal_id: goal.id });
    const task = await createRecord("tasks", { title: "Купить кроссовки", project_id: project.id, goal_id: goal.id, due_date: "2026-11-15", due_time: "09:30", recurrence_rule: { freq: "weekly", interval: 2, weekdays: [1] } });
    await createRecord("tasks", { title: "Подзадача", parent_task_id: task.id });
    const course = await createRecord("courses", { title: "Курс", url: "https://example.com/c", progress: 12.5 });
    await createRecord("course_lessons", { course_id: course.id, title: "Урок 1" });
    await createRecord("books", { title: "Книга", total_pages: 300, current_page: 10, rating: 5 });
    const skill = await createRecord("skills", { title: "Бег", level: 3 });
    await createRecord("time_entries", { started_at: "2026-11-10T10:00:00.000Z", ended_at: "2026-11-10T11:00:00.000Z", duration_seconds: 3600, project_id: project.id, task_id: task.id });
    const account = await createRecord("accounts", { name: "Карта", currency: "KZT", opening_balance: "99999999999999999999.99" });
    const usd = await createRecord("accounts", { name: "USD", currency: "USD", opening_balance: "0", account_type: "savings", target_amount: "1000" });
    await createRecord("transactions", { account_id: account.id, transaction_type: "expense", amount: "0.10", currency: "KZT", transaction_date: "2026-11-10", category_id: cat.id });
    await createRecord("transactions", { account_id: account.id, transaction_type: "expense", amount: "0.20", currency: "KZT", transaction_date: "2026-11-10" });
    await createRecord("transactions", { account_id: account.id, transaction_type: "transfer", amount: "470.00", currency: "KZT", transaction_date: "2026-11-10", to_account_id: usd.id, to_amount: "1.00" });
    await createRecord("budgets", { category_id: cat.id, amount: "50000", currency: "KZT", start_date: "2026-11-01" });
    const metric = await createRecord("custom_metrics", { name: "Пульс", unit: "уд/мин" });
    await createRecord("health_records", { metric_type: metric.id, value: 58, recorded_at: "2026-11-10T02:00:00.000Z" });
    await createRecord("health_records", { metric_type: "weight", value: 72.35, unit: "кг", recorded_at: "2026-11-10T02:00:00.000Z" });
    const note = await createRecord("notes", { title: "План", content: "# Заголовок\n- пункт «один»\n- emoji 🏃", is_favorite: true });
    const tag = await createRecord("tags", { name: "спорт" });
    await createRecord("entity_links", { from_type: "note", from_id: note.id, to_type: "tag", to_id: tag.id });
    await createRecord("entity_links", { from_type: "goal", from_id: goal.id, to_type: "habit", to_id: habit.id });
    await createRecord("entity_links", { from_type: "course", from_id: course.id, to_type: "skill", to_id: skill.id });
    await createRecord("journal_entries", { entry_date: "2026-11-10", content: "День", mood: 4, tags: ["бег", "утро"] });
    await createRecord("life_balance", { category_id: area.id, score: 7, assessment_date: "2026-11-01" });
    await createRecord("events", { title: "Забег", start_date: "2026-11-20", start_time: "07:00", event_type: "workout" });
    await createRecord("saved_filters", { module: "tasks", name: "Срочные", config: { priority: "high", nested: { a: [1, 2] } } });
    await createRecord("user_settings", { default_currency: "KZT", theme: "dark", currencies: [{ code: "BTC", name: "Bitcoin", symbol: "₿", decimals: 8 }] }, { id: SETTINGS_ID });

    const total = await pendingCount();
    const res = await syncNow(remote);
    expect(res).toMatchObject({ pushed: total, conflicts: 0, failed: 0, error: null });
    expect(await pendingCount()).toBe(0);
    const source = await buildBackup();

    const second = await newDevice();
    await device(second, async () => {
      const r1 = await syncNow(new SupabaseRemote(client(USER_A), USER_A));
      expect(r1).toMatchObject({ pulled: total, pushed: 0, error: null });
      const copy = await buildBackup();
      expect(copy.counts).toEqual(source.counts);
      for (const table of Object.keys(source.tables)) {
        const byId = new Map(copy.tables[table].map((r) => [r.id, r]));
        for (const row of source.tables[table]) expect(byId.get(row.id), `${table}/${row.id}`).toEqual({ ...row, version: 1 });
      }
      // Точность денег сохранена сквозь NUMERIC и JSON.
      const txs = await getDb().transactions.toArray();
      expect(normalizeAmount(accountBalance((await getDb().accounts.get(account.id))!, txs))).toBe("99999999999999999529.69");
      // Повторная синхронизация ничего не меняет.
      expect(await syncNow(new SupabaseRemote(client(USER_A), USER_A))).toMatchObject({ pulled: 0, pushed: 0 });
    });
  });

  it("потерянный ответ сервера не приводит к дублированию финансовой операции", async () => {
    const net: Net = { dropResponses: 0, offline: false };
    const remote = new SupabaseRemote(client(USER_A, net), USER_A);
    const account = await createRecord("accounts", { name: "Карта", currency: "KZT", opening_balance: "1000" });
    await syncNow(remote);
    await createRecord("transactions", { account_id: account.id, transaction_type: "expense", amount: "250", currency: "KZT", transaction_date: "2026-11-10" });
    net.dropResponses = 1;
    const first = await syncNow(remote);
    expect(first.offline).toBe(true);
    expect(await pendingCount()).toBe(1);
    const second = await syncNow(remote);
    expect(second).toMatchObject({ pushed: 1, conflicts: 0, failed: 0 });
    await syncNow(remote);
    const { data } = await client(USER_A).from("transactions").select("id");
    expect(data).toHaveLength(1);
    expect(await getDb().sync_conflicts.count()).toBe(0);
  });

  it("потерянный ответ на обновление обрабатывается идемпотентно", async () => {
    const net: Net = { dropResponses: 0, offline: false };
    const remote = new SupabaseRemote(client(USER_A, net), USER_A);
    const task = await createRecord("tasks", { title: "a" });
    await syncNow(remote);
    await updateRecord("tasks", task.id, { title: "b" });
    net.dropResponses = 1;
    await syncNow(remote);
    const res = await syncNow(remote);
    expect(res.conflicts).toBe(0);
    expect((await getDb().tasks.get(task.id))!.version).toBe(2);
    const { data } = await client(USER_A).from("tasks").select("title,version").eq("id", task.id).single();
    expect(data).toEqual({ title: "b", version: 2 });
  });

  it("офлайн: изменения копятся и уходят после восстановления связи", async () => {
    const net: Net = { dropResponses: 0, offline: true };
    const remote = new SupabaseRemote(client(USER_A, net), USER_A);
    await createRecord("tasks", { title: "офлайн" });
    await createRecord("notes", { title: "офлайн" });
    expect(await syncNow(remote)).toMatchObject({ offline: true, pushed: 0 });
    expect(await pendingCount()).toBe(2);
    net.offline = false;
    expect(await syncNow(remote)).toMatchObject({ offline: false, pushed: 2, error: null });
  });

  it("конфликт двух устройств обнаруживается и разрешается вручную", async () => {
    const remote = () => new SupabaseRemote(client(USER_A), USER_A);
    const task = await createRecord("tasks", { title: "исходное" });
    await syncNow(remote());
    const phone = await newDevice();
    await device(phone, async () => {
      await syncNow(remote());
      await updateRecord("tasks", task.id, { title: "с телефона" });
      expect(await syncNow(remote())).toMatchObject({ pushed: 1, conflicts: 0 });
    });
    await updateRecord("tasks", task.id, { title: "с компьютера" });
    const res = await syncNow(remote());
    expect(res.conflicts).toBe(1);
    const { data } = await client(USER_A).from("tasks").select("title").eq("id", task.id).single();
    expect(data!.title).toBe("с телефона");
    const [conflict] = await getDb().sync_conflicts.toArray();
    expect(conflict.remote).toMatchObject({ title: "с телефона", version: 2 });
    await resolveConflict(conflict.id, "local");
    expect(await syncNow(remote())).toMatchObject({ pushed: 1, conflicts: 0 });
    await device(phone, async () => {
      await syncNow(remote());
      expect((await getDb().tasks.get(task.id))!.title).toBe("с компьютера");
    });
  });

  it("сервер отклоняет второй активный таймер с другого устройства", async () => {
    const remote = () => new SupabaseRemote(client(USER_A), USER_A);
    await createRecord("time_entries", { started_at: "2026-11-10T10:00:00.000Z" });
    await syncNow(remote());
    const phone = await newDevice();
    await device(phone, async () => {
      // Телефон ещё не знает о таймере на компьютере.
      await createRecord("time_entries", { started_at: "2026-11-10T10:05:00.000Z" });
      const res = await syncNow(remote());
      expect(res.failed).toBe(1);
      const [op] = await getDb().sync_operations.where("status").equals("failed").toArray();
      expect(op.last_error).toContain("time_entries_one_active_idx");
    });
    const { data } = await client(USER_A).from("time_entries").select("id");
    expect(data).toHaveLength(1);
  });

  it("окончательное удаление доходит до второго устройства", async () => {
    const remote = () => new SupabaseRemote(client(USER_A), USER_A);
    const goal = await createRecord("goals", { title: "Цель", goal_type: "milestones" });
    await createRecord("goal_milestones", { goal_id: goal.id, title: "Этап" });
    await syncNow(remote());
    const phone = await newDevice();
    await device(phone, () => syncNow(remote()));
    await purgeRecord("goals", goal.id);
    expect(await syncNow(remote())).toMatchObject({ failed: 0, conflicts: 0 });
    await device(phone, async () => {
      await syncNow(remote());
      expect(await getDb().goals.count()).toBe(0);
      expect(await getDb().goal_milestones.count()).toBe(0);
    });
  });

  it("настройки синхронизируются между устройствами", async () => {
    const remote = () => new SupabaseRemote(client(USER_A), USER_A);
    await createRecord("user_settings", { theme: "dark" }, { id: SETTINGS_ID });
    await syncNow(remote());
    const phone = await newDevice();
    await device(phone, async () => {
      await syncNow(remote());
      expect((await getDb().user_settings.get(SETTINGS_ID))!.theme).toBe("dark");
      await updateRecord("user_settings", SETTINGS_ID, { theme: "light" });
      expect(await syncNow(remote())).toMatchObject({ pushed: 1, failed: 0 });
    });
    await syncNow(remote());
    expect((await getDb().user_settings.get(SETTINGS_ID))!.theme).toBe("light");
  });

  it("восстановление из резервной копии приводит облако к состоянию копии", async () => {
    const remote = () => new SupabaseRemote(client(USER_A), USER_A);
    const account = await createRecord("accounts", { name: "Карта", currency: "KZT", opening_balance: "0" });
    const tx = await createRecord("transactions", { account_id: account.id, transaction_type: "income", amount: "500", currency: "KZT", transaction_date: "2026-11-10" });
    const note = await createRecord("notes", { title: "важная" });
    await syncNow(remote());
    const backup = await buildBackup();
    await purgeRecord("notes", note.id);
    await updateRecord("transactions", tx.id, { amount: "1.00" });
    await createRecord("tasks", { title: "лишняя" });
    await syncNow(remote());
    await restoreBackup(backup, "replace");
    expect(await syncNow(remote())).toMatchObject({ failed: 0, conflicts: 0, error: null });
    const c = client(USER_A);
    expect((await c.from("notes").select("id")).data).toHaveLength(1);
    expect((await c.from("tasks").select("id")).data).toHaveLength(0);
    const txs = (await c.from("transactions").select("amount:amount::text")).data as unknown as { amount: string }[];
    expect(txs).toHaveLength(1);
    expect(normalizeAmount(txs[0].amount)).toBe("500.00");
  });

  it("другой пользователь не видит и не получает чужие данные", async () => {
    await createRecord("tasks", { title: "секрет" });
    await createRecord("health_records", { metric_type: "weight", value: 70, recorded_at: "2026-11-10T00:00:00.000Z" });
    await syncNow(new SupabaseRemote(client(USER_A), USER_A));
    const stranger = await newDevice();
    await device(stranger, async () => {
      const res = await syncNow(new SupabaseRemote(client(USER_B), USER_B));
      expect(res).toMatchObject({ pulled: 0, error: null });
      expect(await getDb().tasks.count()).toBe(0);
      expect(await getDb().health_records.count()).toBe(0);
    });
    const res = await fetch(`${URL}/tasks?select=id`);
    expect(res.ok).toBe(false);
  });

  it("истёкшая сессия не теряет изменения", async () => {
    await createRecord("tasks", { title: "ждёт входа" });
    const res = await syncNow(new SupabaseRemote(client(USER_A, undefined, 1000), USER_A));
    expect(res.error).toContain("Сессия истекла");
    expect(await pendingCount()).toBe(1);
    expect(await syncNow(new SupabaseRemote(client(USER_A), USER_A))).toMatchObject({ pushed: 1 });
  });
});
