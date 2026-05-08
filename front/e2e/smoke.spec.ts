import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("customer can create a booking and open booking list", async ({ page }) => {
  await login(page, "demo_customer", "password");

  await expect(page.getByRole("heading", { name: "Новая запись" })).toBeVisible();
  await expect(page.locator(".slot").first()).toBeVisible();
  await page.locator(".slot").first().click();
  await page.getByRole("button", { name: "Создать запись" }).click();

  await expect(page.getByText("Запись создана")).toBeVisible();

  await page.getByRole("link", { name: "Мои записи" }).click();
  await expect(page.getByRole("heading", { name: "Мои записи" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Детали" }).first()).toBeVisible();
});

test("customer can manage cars from /my/cars", async ({ page }) => {
  await login(page, "demo_customer", "password");

  await page.getByRole("link", { name: "Мои авто" }).click();
  await expect(page.getByRole("heading", { name: "Мои автомобили" })).toBeVisible();

  await page.getByRole("button", { name: "Добавить автомобиль" }).click();
  const dialog = page.getByRole("dialog", { name: "Новый автомобиль" });
  await expect(dialog).toBeVisible();

  const plate = `E2E${Date.now().toString().slice(-6)}`;
  await dialog.getByLabel("Номер").fill(plate);
  await dialog.getByRole("button", { name: "Сохранить" }).click();

  await expect(page.getByRole("cell", { name: plate })).toBeVisible();

  await page.once("dialog", (confirm) => confirm.accept());
  await page.getByRole("button", { name: `Удалить ${plate}` }).click();

  await expect(page.getByRole("cell", { name: plate })).toHaveCount(0);
});

test("manager can open schedule and create a resource block", async ({ page }) => {
  await login(page, "demo_manager", "password");

  await expect(page.getByRole("heading", { name: "Расписание" })).toBeVisible();

  await page.getByRole("link", { name: "Блокировки" }).click();
  await expect(page.getByRole("heading", { name: "Блокировки" })).toBeVisible();
  await page.getByRole("button", { name: "Создать блокировку" }).click();

  await expect(page.getByText("Технический перерыв")).toBeVisible();
});

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Логин").fill(username);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}
