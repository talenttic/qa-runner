import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("react fixture flaky case to exercise healing", async ({ page }) => {
  const marker = path.join(process.cwd(), ".qa-runner-heal-once.marker");
  await page.goto("/");
  if (!fs.existsSync(marker)) {
    fs.writeFileSync(marker, "1", "utf-8");
    expect(false, "intentional first-run failure").toBe(true);
  }
  await expect(page.getByText("React Fixture Login")).toBeVisible();
});
