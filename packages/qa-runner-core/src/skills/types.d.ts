import type { PromptGeneratedCase, PromptScope } from "../generation/prompt";
import type { QaGeneratedTestArtifact } from "../generation/tests";
export type GeneratedFile = {
    path: string;
    content: string;
};
export type ManualGuideInput = {
    prompt: string;
    scope: PromptScope;
    cases: PromptGeneratedCase[];
};
export type ManualGuideResult = {
    files: GeneratedFile[];
};
export type ManualGuideSkill = {
    name: string;
    generateManualGuides(input: ManualGuideInput): Promise<ManualGuideResult> | ManualGuideResult;
};
export type E2EGuideInput = {
    suiteName: string;
    cases: PromptGeneratedCase[];
    tests: QaGeneratedTestArtifact[];
};
export type E2EGuideResult = {
    files: GeneratedFile[];
};
export type E2EScaffoldSkill = {
    name: string;
    generatePlaywrightScaffold(input: E2EGuideInput): Promise<E2EGuideResult> | E2EGuideResult;
};
//# sourceMappingURL=types.d.ts.map