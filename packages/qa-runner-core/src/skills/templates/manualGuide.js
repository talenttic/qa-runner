export function renderManualGuideMarkdown(input) {
    const lines = [];
    lines.push(`# ${input.suiteName}`);
    lines.push("");
    lines.push(`Source prompt: ${input.prompt || "(empty)"}`);
    lines.push("");
    lines.push("## Test Cases");
    lines.push("");
    input.cases.forEach((testCase, index) => {
        lines.push(`### ${index + 1}. ${testCase.title}`);
        lines.push("");
        lines.push(`Use case: ${testCase.useCase}`);
        lines.push("");
        lines.push(`Expected result: ${testCase.expectedResult}`);
        lines.push("");
        lines.push("Steps:");
        testCase.steps.forEach((step, stepIndex) => {
            lines.push(`${stepIndex + 1}. ${step}`);
        });
        lines.push("");
    });
    return lines.join("\n");
}
export function createManualGuideTemplateSkill(input) {
    return {
        name: "manual-guide-template",
        generateManualGuides({ prompt, cases }) {
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
//# sourceMappingURL=manualGuide.js.map