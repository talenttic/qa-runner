export type ChangeEvent = {
    files: string[];
    summary?: string;
    diff?: string;
    tool?: string;
    timestamp: number;
};
export type QaRunnerManifest = {
    version: string;
    generatedAt: string;
    inputs: {
        files: string[];
        summary?: string;
        diffPresent: boolean;
        tool?: string;
    };
    outputs: {
        manualGuides: string[];
        e2eSpecs: string[];
    };
};
export type { QaRunnerConfig, QaRunnerConfigValidation } from "./config";
export { validateConfig } from "./config";
export type { ChangeEventValidation } from "./validation";
export { validateChangeEvent } from "./validation";
export type { FileSystemAdapter, GitAdapter, ModelAdapter, ClockAdapter } from "./adapters/types";
export type { QaRunReport, QaCoverageReport, CoveragePlugin } from "./coverage";
export declare function buildManifest(event: ChangeEvent, outputs: QaRunnerManifest["outputs"]): QaRunnerManifest;
export { generateCasesFromPrompt } from "./generation/prompt";
export type { PromptGeneratedCase, PromptScope } from "./generation/prompt";
export { buildGeneratedTests, normalizeSelectedTestTypes } from "./generation/tests";
export type { QaGeneratedTestArtifact } from "./generation/tests";
export type { GeneratedFile, ManualGuideInput, ManualGuideResult, ManualGuideSkill, E2EGuideInput, E2EGuideResult, E2EScaffoldSkill, } from "./skills/types";
export { renderManualGuideMarkdown, createManualGuideTemplateSkill } from "./skills/templates/manualGuide";
export { createPlaywrightScaffoldTemplateSkill } from "./skills/templates/playwrightScaffold";
export { runGeneration } from "./orchestrator/generation";
export type { GenerationInput, GenerationResult } from "./orchestrator/generation";
//# sourceMappingURL=index.d.ts.map