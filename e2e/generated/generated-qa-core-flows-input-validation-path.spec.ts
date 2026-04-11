import { test, expect } from "playwright/test";
import { GeneratedQaCoreFlowsInputValidationPathPage } from "./pages/generated-qa-core-flows-input-validation-path.page";

test("Input Validation Path (ui_functional)", async ({ page }) => {
  const view = new GeneratedQaCoreFlowsInputValidationPathPage(page);
  await view.open();
  await expect(view.el1).toBeVisible();
});
