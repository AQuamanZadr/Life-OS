import { expect, test } from "@playwright/test";

function key(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test("календарь: события, сроки задач, поиск, изменение, удаление", async ({ page }) => {
  // Задача со сроком сегодня должна появиться в календаре
  await page.goto("/tasks");
  await page.getByRole("main").getByRole("button", { name: "Новая задача" }).first().click();
  await page.getByRole("dialog").getByLabel("Название").fill("Сдать отчёт");
  await page.getByRole("dialog").getByLabel("Срок").fill(key(0));
  await page.getByRole("dialog").getByRole("button", { name: "Добавить" }).click();
  await expect(page.locator("main li").filter({ hasText: "Сдать отчёт" })).toBeVisible();

  await page.goto("/calendar");
  const rows = page.locator("main li");
  await expect(rows.filter({ hasText: "Сдать отчёт" })).toContainText("Срок задачи");

  // Новое событие на сегодня, с проверкой времени
  await page.getByRole("main").getByRole("button", { name: "Новое событие" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Дата")).toHaveValue(key(0));
  await dialog.getByLabel("Название").fill("Встреча с врачом");
  await dialog.getByLabel("Начало").fill("14:00");
  await dialog.getByLabel("Окончание").fill("13:00");
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog.getByText("Окончание должно быть позже начала")).toBeVisible();
  await dialog.getByLabel("Окончание").fill("15:30");
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog).toBeHidden();

  const meeting = rows.filter({ hasText: "Встреча с врачом" });
  await expect(meeting).toContainText("14:00–15:30");
  await expect(rows).toHaveCount(2);
  // Событие идёт раньше срока задачи
  await expect(rows.first()).toContainText("Встреча с врачом");

  await page.reload();
  await expect(meeting).toBeVisible();

  // Отметка задачи прямо из календаря
  await rows.filter({ hasText: "Сдать отчёт" }).getByRole("checkbox").click();
  await expect(rows.filter({ hasText: "Сдать отчёт" }).getByRole("checkbox")).toBeChecked();

  // Фильтр
  await page.getByLabel("Показывать").selectOption("event");
  await expect(rows).toHaveCount(1);
  await page.getByLabel("Показывать").selectOption("all");

  // Перенос события на завтра: из сегодняшнего дня оно пропадает
  await meeting.locator('button[aria-label="Изменить"]').click();
  await dialog.getByLabel("Дата").fill(key(1));
  await dialog.getByLabel("Название").fill("Встреча перенесена");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(rows).toHaveCount(1);

  // Поиск находит событие в другом дне
  await page.getByLabel("Поиск по календарю").fill("перенесена");
  await expect(page.getByText("Найдено: 1")).toBeVisible();
  const found = rows.filter({ hasText: "Встреча перенесена" });
  await expect(found).toBeVisible();

  await found.locator('button[aria-label="Удалить"]').click();
  await page.getByRole("dialog").getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText("Ничего не найдено")).toBeVisible();

  // Другой месяц и возврат
  await page.getByLabel("Поиск по календарю").fill("");
  await page.getByRole("button", { name: "Следующий месяц" }).click();
  await page.getByRole("button", { name: "Текущий" }).click();
  await expect(rows.filter({ hasText: "Сдать отчёт" })).toBeVisible();
});
