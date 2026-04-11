import { test, expect } from "playwright/test";
import { GeneratedQaCoreFlowsPrimaryHappyPathPage } from "./pages/generated-qa-core-flows-primary-happy-path.page";

test("Primary Happy Path (ui_functional)", async ({ page }) => {
  const view = new GeneratedQaCoreFlowsPrimaryHappyPathPage(page);
  await view.open();
  await expect(view.el1).toBeVisible();
});
