export type PromptGeneratedCase = {
    title: string;
    useCase: string;
    expectedResult: string;
    priority: "low" | "medium" | "high" | "critical" | string;
    steps: string[];
    playwrightTags?: string[];
};
export type PromptScope = {
    pluginIds?: string[];
    routes?: string[];
};
export declare function generateCasesFromPrompt(input: {
    prompt: string;
    scope: PromptScope;
}): {
    suiteName: string;
    cases: PromptGeneratedCase[];
};
//# sourceMappingURL=prompt.d.ts.map