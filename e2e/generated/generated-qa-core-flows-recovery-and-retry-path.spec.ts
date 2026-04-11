import { test, expect } from "playwright/test";
import { GeneratedQaCoreFlowsRecoveryAndRetryPathPage } from "./pages/generated-qa-core-flows-recovery-and-retry-path.page";

test("Recovery and Retry Path (ui_functional)", async ({ page }) => {
  const view = new GeneratedQaCoreFlowsRecoveryAndRetryPathPage(page);
  await view.open();
  await expect(view.el1).toBeVisible();
});
