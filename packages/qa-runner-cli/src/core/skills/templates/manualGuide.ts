import type { ManualGuideResult, ManualGuideSkill } from "../types.js";
import type { PromptGeneratedCase } from "../../generation/prompt.js";

export function renderManualGuideMarkdown(input: {
  suiteName: string;
  prompt: string;
  cases: PromptGeneratedCase[];
}): string {
  const lines: string[] = [];
  lines.push(`# ${input.suiteName}`);
  lines.push("");
  lines.push(`Source prompt: ${input.prompt || "(empty)"}`);
  lines.push("");
  input.cases.forEach((testCase, index) => {
    lines.push(`## [case-${index + 1}] ${testCase.title}`);
    lines.push("");
    lines.push(`Use Case: ${testCase.useCase}`);
    lines.push("");
    lines.push(`Expected Result: ${testCase.expectedResult}`);
    lines.push("");
    lines.push(`Priority: ${testCase.priority || "medium"}`);
    lines.push("Status: Not Started");
    lines.push("");
    lines.push("### Steps");
    testCase.steps.forEach((step) => {
      lines.push(`- [ ] ${step}`);
    });
    lines.push("");
  });
  return lines.join("\n");
}

export function createManualGuideTemplateSkill(input: {
  filePath: string;
  suiteName: string;
}): ManualGuideSkill {
  return {
    name: "manual-guide-template",
    generateManualGuides({ prompt, cases }): ManualGuideResult {
      return {
        files: [
          {
            path: input.filePath,
            content: renderManualGuideMarkdown({
              suiteName: input.suiteName,
              prompt,
              cases,
            }),
          },
        ],
      };
    },
  };
}
