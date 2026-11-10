import { expect, test } from "@playwright/test";

test("привычка: создание, отметка, серия, архив, удаление", async ({ page }) => {
  await page.goto("/habits");
  await expect(page.getByText("Привычек пока нет")).toBeVisible();

  await page.getByRole("button", { name: "Новая привычка" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Название").fill("Зарядка");
  // Снять все дни — должна появиться ошибка
  for (const day of ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]) {
    await dialog.getByRole("button", { name: day, exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog.getByText("Выберите хотя бы один день")).toBeVisible();
  for (const day of ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]) {
    await dialog.getByRole("button", { name: day, exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole("main").getByRole("listitem").filter({ hasText: "Зарядка" });
  await expect(row).toContainText("Каждый день");
  await expect(row).toContainText("Серия: 0 дн.");

  const todayBox = row.getByRole("checkbox", { name: "Зарядка, сегодня" });
  await todayBox.click();
  await expect(todayBox).toBeChecked();
  await expect(row).toContainText("Серия: 1 дн.");
  await expect(row).toContainText("За 30 дней: 100%");

  await page.reload();
  await expect(todayBox).toBeChecked();

  await page.goto("/");
  await expect(page.getByRole("main").getByText("1 из 1")).toBeVisible();
  await page.goto("/habits");

  await todayBox.click();
  await expect(todayBox).not.toBeChecked();
  await expect(row).toContainText("Серия: 0 дн.");

  // Архив
  await row.getByRole("button", { name: "Изменить" }).click();
  await dialog.getByLabel("Статус").selectOption("archived");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Активных привычек нет")).toBeVisible();
  await page.getByRole("main").getByLabel("Статус").selectOption("archived");
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Удалить" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Удалить" }).click();
  await expect(row).toHaveCount(0);
});
