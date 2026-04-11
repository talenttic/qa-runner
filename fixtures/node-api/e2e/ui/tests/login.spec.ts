import { expect, test } from "@playwright/test";

test("node fixture login happy path", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("user@example.com");
  await page.getByLabel("Password").fill("correct-password");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByText("Dashboard")).toBeVisible();
});
