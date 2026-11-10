import { expect, test, type Page } from "@playwright/test";

async function add(page: Page, button: string, fill: (dialog: ReturnType<Page["getByRole"]>) => Promise<void>) {
  await page.getByRole("main").getByRole("button", { name: button }).first().click();
  const dialog = page.getByRole("dialog");
  await fill(dialog);
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog).toBeHidden();
}

test("цель → проект → задача: связи, прогресс и удаление", async ({ page }) => {
  await page.goto("/goals");
  await add(page, "Новая цель", async (d) => {
    await d.getByLabel("Название").fill("Выучить английский");
    await d.getByLabel(/Прогресс/).fill("40");
  });
  const goal = page.getByRole("main").getByRole("listitem").filter({ hasText: "Выучить английский" });
  await expect(goal).toContainText("40%");

  await page.goto("/projects");
  await add(page, "Новый проект", async (d) => {
    await d.getByLabel("Название").fill("Курс B2");
    await d.getByLabel("Цель").selectOption({ label: "Выучить английский" });
  });
  const project = page.getByRole("main").getByRole("listitem").filter({ hasText: "Курс B2" });
  await expect(project).toContainText("Выучить английский");
  await expect(project).toContainText("Нет задач");

  await page.goto("/tasks");
  for (const title of ["Урок 1", "Урок 2"]) {
    await add(page, "Новая задача", async (d) => {
      await d.getByLabel("Название").fill(title);
      await d.getByLabel("Проект").selectOption({ label: "Курс B2" });
      await d.getByLabel("Цель").selectOption({ label: "Выучить английский" });
    });
  }
  const task = page.getByRole("main").getByRole("listitem").filter({ hasText: "Урок 1" });
  await expect(task).toContainText("Курс B2");
  await task.getByRole("checkbox").click();
  // Выполненная задача уходит из списка активных — значит, запись сохранена.
  await expect(task).toHaveCount(0);

  await page.goto("/projects");
  await expect(project).toContainText("Задачи: 1 из 2");

  await page.goto("/goals");
  await expect(goal).toContainText("Проектов: 1");
  await expect(goal).toContainText("Задач: 2");

  // Изменение и поиск
  await goal.getByRole("button", { name: "Изменить" }).click();
  await page.getByRole("dialog").getByLabel("Статус").selectOption("done");
  await page.getByRole("dialog").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Целей в работе нет")).toBeVisible();
  await page.getByRole("button", { name: "Показать все" }).click();
  await expect(goal).toContainText("100%");
  await page.getByLabel("Поиск по целям").fill("нет такой");
  await expect(page.getByText("Ничего не найдено")).toBeVisible();

  // Удаление проекта отвязывает задачи, но не удаляет их
  await page.goto("/projects");
  await project.getByRole("button", { name: "Удалить" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText("Проектов пока нет")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Проектов пока нет")).toBeVisible();

  await page.goto("/tasks");
  const left = page.getByRole("main").getByRole("listitem").filter({ hasText: "Урок 2" });
  await expect(left).toBeVisible();
  await expect(left).not.toContainText("Курс B2");
  await expect(left).toContainText("Выучить английский");
});
