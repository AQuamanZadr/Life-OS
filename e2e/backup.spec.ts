import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("резервная копия: скачать, удалить данные, восстановить", async ({ page }) => {
  await page.goto("/tasks");
  await page.getByRole("main").getByRole("button", { name: "Новая задача" }).first().click();
  await page.getByRole("dialog").getByLabel("Название").fill("Важная задача");
  await page.getByRole("dialog").getByRole("button", { name: "Добавить" }).click();
  const row = page.locator("main li").filter({ hasText: "Важная задача" });
  await expect(row).toBeVisible();

  await page.goto("/finance");
  await page.getByRole("main").getByRole("button", { name: "Новая операция" }).click();
  await page.getByRole("dialog").getByLabel("Сумма").fill("1234,56");
  await page.getByRole("dialog").getByLabel("Категория").selectOption({ label: "Продукты" });
  await page.getByRole("dialog").getByRole("button", { name: "Добавить" }).click();
  await expect(page.locator('[data-stat="Расходы"]')).toContainText("1 234,56 ₽");

  await page.goto("/settings");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Скачать копию" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^life-os-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const backup = JSON.parse(await readFile(path, "utf8"));
  expect(backup.tables.tasks).toHaveLength(1);
  expect(backup.tables.transactions[0].amountMinor).toBe(123456);

  // Удаляем задачу
  await page.goto("/tasks");
  await row.locator('button[aria-label="Удалить"]').click();
  await page.getByRole("dialog").getByRole("button", { name: "Удалить" }).click();
  await expect(row).toHaveCount(0);

  // Чужой файл отклоняется
  await page.goto("/settings");
  await page.getByLabel("Файл резервной копии").setInputFiles({
    name: "other.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"hello":1}'),
  });
  await expect(page.getByText("Это не файл резервной копии LIFE OS.")).toBeVisible();

  // Восстановление
  await page.getByLabel("Файл резервной копии").setInputFiles(path);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("записей: 2");
  await dialog.getByRole("button", { name: "Восстановить" }).click();
  await expect(page.getByText("Восстановлено записей: 2.")).toBeVisible();

  await page.goto("/tasks");
  await expect(row).toBeVisible();
  await page.goto("/finance");
  // Операция не задвоилась
  await expect(page.locator('[data-stat="Расходы"]')).toContainText("1 234,56 ₽");
});
