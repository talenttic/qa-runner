function renderPageObjectClass(input) {
    const lines = [];
    lines.push(`import { Page, Locator } from "@playwright/test";`);
    lines.push("");
    lines.push(`export class ${input.className} {`);
    lines.push("  readonly page: Page;");
    input.testIdSelectors.forEach((selector, index) => {
        lines.push(`  readonly el${index + 1}: Locator;`);
    });
    lines.push("");
    lines.push("  constructor(page: Page) {");
    lines.push("    this.page = page;");
    input.testIdSelectors.forEach((selector, index) => {
        lines.push(`    this.el${index + 1} = page.getByTestId("${selector}");`);
    });
    lines.push("  }");
    lines.push("");
    lines.push("  async open(): Promise<void> {");
    lines.push("    await this.page.goto(\"/\");");
    lines.push("  }");
    lines.push("}");
    lines.push("");
    lines.push(`export const ${input.featureKey.replace(/[^a-zA-Z0-9]/g, "_")}_testIds = ${JSON.stringify(input.testIdSelectors)};`);
    return lines.join("\n");
}
function renderSpec(input) {
    const lines = [];
    lines.push(`import { test, expect } from "@playwright/test";`);
    lines.push(`import { ${input.className} } from "${input.pageObjectPath}";`);
    lines.push("");
    lines.push(`test("${input.title}", async ({ page }) => {`);
    lines.push(`  const view = new ${input.className}(page);`);
    lines.push("  await view.open();");
    lines.push("  await expect(view.el1).toBeVisible();");
    lines.push("});");
    lines.push("");
    return lines.join("\n");
}
export function createPlaywrightScaffoldTemplateSkill(input) {
    return {
        name: "playwright-scaffold-template",
        generatePlaywrightScaffold({ tests }) {
            const files = tests.flatMap((test) => {
                const className = input.classNameForTest(test);
                return [
                    {
                        path: input.pageObjectPathForTest(test),
                        content: renderPageObjectClass({
                            className,
                            featureKey: test.featureKey,
                            testIdSelectors: test.testIdSelectors,
                        }),
                    },
                    {
                        path: input.specPathForTest(test),
                        content: renderSpec({
                            title: test.title,
                            className,
                            pageObjectPath: input.pageObjectImportPathForSpec(test),
                        }),
                    },
                ];
            });
            return { files };
        },
    };
}
//# sourceMappingURL=playwrightScaffold.js.map