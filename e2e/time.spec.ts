import { expect, test } from "@playwright/test";

test("учёт времени: таймер, ручная запись, связь с задачей, изменение, удаление", async ({ page }) => {
  // Задача, к которой привяжем время
  await page.goto("/tasks");
  await page.getByRole("main").getByRole("button", { name: "Новая задача" }).first().click();
  await page.getByRole("dialog").getByLabel("Название").fill("Написать отчёт");
  await page.getByRole("dialog").getByRole("button", { name: "Добавить" }).click();
  await expect(page.locator("main li").filter({ hasText: "Написать отчёт" })).toBeVisible();

  await page.goto("/time");
  await expect(page.getByText("Записей пока нет")).toBeVisible();

  // Таймер
  await page.getByLabel("Чем занимаетесь").fill("Разбор почты");
  await page.getByRole("button", { name: "Старт" }).click();
  await expect(page.getByText("Идёт таймер")).toBeVisible();
  await expect(page.getByLabel("Прошло времени")).toHaveText(/^0:00:0[1-9]$/);
  await page.reload();
  await expect(page.getByText("Идёт таймер")).toBeVisible();
  await page.getByRole("button", { name: "Стоп" }).click();
  await expect(page.getByRole("button", { name: "Старт" })).toBeVisible();
  const rows = page.locator("main li").filter({ has: page.locator('button[aria-label="Удалить"]') });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Разбор почты");

  // Ручная запись с проверкой формы
  await page.getByRole("button", { name: "Добавить вручную" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog.getByText("Длительность — от 1 минуты до 24 часов")).toBeVisible();
  await dialog.getByLabel("Начало").fill("09:00");
  await dialog.getByLabel("Часы").fill("1");
  await dialog.getByLabel("Минуты").fill("30");
  await dialog.getByLabel("Задача").selectOption({ label: "Написать отчёт" });
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog).toBeHidden();

  const report = rows.filter({ hasText: "Написать отчёт" });
  await expect(report).toContainText("09:00–10:30");
  await expect(report).toContainText("1 ч 30 мин");
  await expect(page.locator('[data-stat="Сегодня"]')).toContainText("1 ч 30 мин");

  // Изменение
  await report.locator('button[aria-label="Изменить"]').click();
  await dialog.getByLabel("Минуты").fill("45");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(report).toContainText("1 ч 45 мин");

  // Поиск
  await page.getByLabel("Поиск по записям").fill("почты");
  await expect(rows).toHaveCount(1);
  await page.getByLabel("Поиск по записям").fill("");

  // Время видно на задаче и на главной
  await page.goto("/tasks");
  await expect(page.locator("main li").filter({ hasText: "Написать отчёт" })).toContainText("1 ч 45 мин");
  await page.goto("/");
  await expect(page.getByRole("main").getByText("1 ч 45 мин")).toBeVisible();

  // Удаление
  await page.goto("/time");
  await report.locator('button[aria-label="Удалить"]').click();
  await page.getByRole("dialog").getByRole("button", { name: "Удалить" }).click();
  await expect(rows).toHaveCount(1);
  await expect(page.locator('[data-stat="Сегодня"]')).toContainText("0 мин");
});
