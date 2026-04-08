export function generateCasesFromPrompt(input) {
    const prompt = input.prompt.trim();
    const pluginHint = (input.scope.pluginIds ?? []).slice(0, 2).join(", ");
    const routeHint = (input.scope.routes ?? []).slice(0, 2).join(", ");
    const focusHint = pluginHint || routeHint || "core flows";
    const normalizedPrompt = prompt.length > 140 ? `${prompt.slice(0, 137)}...` : prompt;
    const suiteName = `Generated QA - ${focusHint}`;
    const basePrefix = normalizedPrompt || "User flow";
    return {
        suiteName,
        cases: [
            {
                title: "Primary Happy Path",
                useCase: `${basePrefix}: execute intended success path end-to-end.`,
                expectedResult: "Flow completes successfully and target state is visible.",
                priority: "high",
                steps: ["Open target screen", "Complete required user actions", "Verify success outcome"],
                playwrightTags: ["@smoke", "@generated"],
            },
            {
                title: "Input Validation Path",
                useCase: `${basePrefix}: validate invalid or incomplete input handling.`,
                expectedResult: "Validation message is shown and action is blocked.",
                priority: "medium",
                steps: ["Enter invalid or partial input", "Submit action", "Verify clear validation feedback"],
                playwrightTags: ["@generated", "@validation"],
            },
            {
                title: "Recovery and Retry Path",
                useCase: `${basePrefix}: recover from transient failure and retry.`,
                expectedResult: "User can retry and successfully complete the flow.",
                priority: "medium",
                steps: ["Trigger a recoverable failure", "Use retry/reload action", "Verify flow completes after retry"],
                playwrightTags: ["@generated", "@resilience"],
            },
        ],
    };
}
//# sourceMappingURL=prompt.js.map