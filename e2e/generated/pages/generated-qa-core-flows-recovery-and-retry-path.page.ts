import { Page, Locator } from "@playwright/test";

export class GeneratedQaCoreFlowsRecoveryAndRetryPathPage {
  readonly page: Page;
  readonly el1: Locator;
  readonly el2: Locator;
  readonly el3: Locator;

  constructor(page: Page) {
    this.page = page;
    this.el1 = page.locator("body");
    this.el2 = page.getByTestId("qa-generated-qa-core-flows-recovery-and-retry-path-primary-action");
    this.el3 = page.getByTestId("qa-generated-qa-core-flows-recovery-and-retry-path-result");
  }

  async open(): Promise<void> {
    const targetPath = process.env.QA_RUNNER_TEST_ENTRY_PATH || "/";
    await this.page.goto(targetPath);
    // qa-runner self-heal modal guard
    await this.page.keyboard.press("Escape").catch(() => {});
    await this.page.getByRole("button", { name: /close|dismiss|skip|continue/i }).first().click({ timeout: 1500 }).catch(() => {});
  }
}

export const generated_qa_core_flows_recovery_and_retry_path_testIds = ["qa-generated-qa-core-flows-recovery-and-retry-path-root","qa-generated-qa-core-flows-recovery-and-retry-path-primary-action","qa-generated-qa-core-flows-recovery-and-retry-path-result"];