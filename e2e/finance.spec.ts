import { expect, test, type Page } from "@playwright/test";

async function addTx(
  page: Page,
  o: { income?: boolean; amount: string; category: string; note?: string; date?: string },
) {
  await page.getByRole("main").getByRole("button", { name: "Новая операция" }).click();
  const d = page.getByRole("dialog");
  if (o.income) await d.getByRole("radio", { name: "Доход" }).click();
  await d.getByLabel("Сумма").fill(o.amount);
  if (o.date) await d.getByLabel("Дата").fill(o.date);
  await d.getByLabel("Категория").selectOption({ label: o.category });
  if (o.note) await d.getByLabel("Заметка").fill(o.note);
  await d.getByRole("button", { name: "Добавить" }).click();
  return d;
}

const stat = (page: Page, label: string) => page.locator(`[data-stat="${label}"]`);

test("финансы: точные суммы, итоги, поиск, изменение, удаление", async ({ page }) => {
  await page.goto("/finance");
  await expect(page.getByText("Операций пока нет")).toBeVisible();

  // Проверка формы
  await page.getByRole("main").getByRole("button", { name: "Новая операция" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Сумма").fill("12,345");
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog.getByText("Введите сумму")).toBeVisible();
  await expect(dialog.locator("p", { hasText: "Выберите категорию" })).toBeVisible();
  await dialog.getByRole("button", { name: "Отмена" }).click();

  await expect(await addTx(page, { income: true, amount: "100 000", category: "Зарплата" })).toBeHidden();
  await expect(await addTx(page, { amount: "0,1", category: "Продукты", note: "хлеб" })).toBeHidden();
  await expect(await addTx(page, { amount: "0,2", category: "Продукты", note: "спички" })).toBeHidden();
  await expect(await addTx(page, { amount: "1500.50", category: "Транспорт" })).toBeHidden();

  await expect(stat(page, "Доходы")).toContainText("100 000,00 ₽");
  // 0,10 + 0,20 + 1500,50 = 1500,80 — без ошибок округления
  await expect(stat(page, "Расходы")).toContainText("1 500,80 ₽");
  await expect(stat(page, "Баланс")).toContainText("+98 499,20 ₽");
  await expect(page.getByText("Расходы по категориям")).toBeVisible();

  await page.reload();
  await expect(stat(page, "Баланс")).toContainText("+98 499,20 ₽");

  const rows = page.locator("main li").filter({ has: page.locator('button[aria-label="Изменить"]') });
  await expect(rows).toHaveCount(4);
  await page.getByLabel("Поиск по операциям").fill("хлеб");
  await expect(rows).toHaveCount(1);
  await page.getByLabel("Поиск по операциям").fill("");
  await page.getByLabel("Тип").selectOption("income");
  await expect(rows).toHaveCount(1);
  await page.getByLabel("Тип").selectOption("all");

  // Изменение
  await rows.filter({ hasText: "хлеб" }).getByRole("button", { name: "Изменить" }).click();
  await dialog.getByLabel("Сумма").fill("50");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(stat(page, "Расходы")).toContainText("1 550,70 ₽");

  // Удаление
  await rows.filter({ hasText: "Транспорт" }).getByRole("button", { name: "Удалить" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Удалить" }).click();
  await expect(stat(page, "Расходы")).toContainText("50,20 ₽");

  // Другой месяц пуст
  await page.getByRole("button", { name: "Предыдущий месяц" }).click();
  await expect(page.getByText("В этом месяце операций нет")).toBeVisible();
  await page.getByRole("button", { name: "Текущий" }).click();
  await expect(rows).toHaveCount(3);

  await page.goto("/");
  await expect(page.getByRole("main").getByText("Баланс за месяц")).toBeVisible();
});

test("финансы: защита от дублей", async ({ page }) => {
  await page.goto("/finance");
  const rows = page.locator("main li").filter({ has: page.locator('button[aria-label="Изменить"]') });

  // Двойное нажатие «Добавить» создаёт одну операцию
  await page.getByRole("main").getByRole("button", { name: "Новая операция" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Сумма").fill("300");
  await dialog.getByLabel("Категория").selectOption({ label: "Кафе и рестораны" });
  await dialog.getByRole("button", { name: "Добавить" }).dblclick();
  await expect(dialog).toBeHidden();
  await expect(rows).toHaveCount(1);

  // Такая же операция в тот же день — предупреждение, сохранение только после подтверждения
  const again = await addTx(page, { amount: "300,00", category: "Кафе и рестораны" });
  await expect(again.getByRole("alert")).toContainText("уже записана");
  await expect(rows).toHaveCount(1);
  await again.getByRole("button", { name: "Всё равно добавить" }).click();
  await expect(again).toBeHidden();
  await expect(rows).toHaveCount(2);
});
