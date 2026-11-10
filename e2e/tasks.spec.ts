import { expect, test } from "@playwright/test";

// У каждого теста свой контекст браузера, поэтому IndexedDB изначально пуста.

test("задача: создание, сохранение после перезагрузки, изменение, выполнение, удаление", async ({
  page,
}) => {
  await page.goto("/tasks");
  await expect(page.getByText("Задач пока нет")).toBeVisible();

  await page.getByRole("button", { name: "Новая задача" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog.getByText("Введите название")).toBeVisible();

  await dialog.getByLabel("Название").fill("Оплатить интернет");
  await dialog.getByLabel("Приоритет").selectOption("high");
  await dialog.getByLabel("Срок").fill("2020-01-15");
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole("listitem").filter({ hasText: "Оплатить интернет" });
  await expect(row).toContainText("Высокий приоритет");
  await expect(row).toContainText("просрочено");

  await page.reload();
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Изменить" }).click();
  await dialog.getByLabel("Название").fill("Оплатить связь");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  const edited = page.getByRole("listitem").filter({ hasText: "Оплатить связь" });
  await expect(edited).toBeVisible();
  await expect(page.getByText("Оплатить интернет")).toHaveCount(0);

  await edited.getByRole("checkbox").click();
  await expect(page.getByText("Активных задач нет")).toBeVisible();
  await page.getByLabel("Статус").selectOption("done");
  await expect(edited).toBeVisible();

  await edited.getByRole("button", { name: "Удалить" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText("Оплатить связь")).toHaveCount(0);
  await page.reload();
  await page.getByLabel("Статус").selectOption("all");
  await expect(page.getByText("Задач пока нет")).toBeVisible();
});

test("поиск и фильтры по задачам", async ({ page }) => {
  await page.goto("/tasks");
  for (const title of ["Купить молоко", "Написать отчёт"]) {
    await page.getByRole("button", { name: "Новая задача" }).first().click();
    await page.getByRole("dialog").getByLabel("Название").fill(title);
    await page.getByRole("dialog").getByRole("button", { name: "Добавить" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }
  const rows = page.getByRole("main").getByRole("listitem");
  await expect(rows).toHaveCount(2);

  await page.getByLabel("Поиск по задачам").fill("молоко");
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Купить молоко");

  await page.getByLabel("Поиск по задачам").fill("нет такой");
  await expect(page.getByText("Ничего не найдено")).toBeVisible();
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await expect(rows).toHaveCount(2);

  await page.getByLabel("Приоритет").selectOption("high");
  await expect(page.getByText("Ничего не найдено")).toBeVisible();
});

test("быстрое добавление из шапки и сводка на главной", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("banner").getByRole("button", { name: "Новая задача" }).click();
  await page.getByRole("dialog").getByLabel("Название").fill("Быстрая задача");
  await page.getByRole("dialog").getByRole("button", { name: "Добавить" }).click();
  await expect(page.getByRole("main").getByText("Активных: 1")).toBeVisible();
});

test("навигация и отсутствие горизонтальной прокрутки", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) await page.getByRole("button", { name: "Открыть меню" }).click();
  await page.getByRole("link", { name: "Задачи" }).first().click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByRole("heading", { name: "Задачи" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
