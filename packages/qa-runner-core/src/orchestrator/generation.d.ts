import type { ChangeEvent, QaRunnerManifest } from "../index";
import type { ManualGuideSkill, E2EScaffoldSkill, GeneratedFile } from "../skills/types";
import type { PromptScope } from "../generation/prompt";
import { generateCasesFromPrompt, type QaGeneratedTestArtifact } from "../index";
export type GenerationInput<TTestType extends string> = {
    event: ChangeEvent;
    prompt: string;
    scope: PromptScope;
    generatedAt?: string;
    selectedTestTypes?: TTestType[];
    defaultTestType: TTestType;
    baseTagByType: Record<TTestType, string>;
    slugify: (input: string) => string;
    createId: () => string;
    filePathForFeature: (featureKey: string) => string;
    testIdSelectorsForFeature: (featureKey: string) => string[];
    manualSkill?: ManualGuideSkill;
    e2eSkill?: E2EScaffoldSkill;
};
export type GenerationResult<TTestType extends string> = {
    suiteName: string;
    cases: ReturnType<typeof generateCasesFromPrompt>["cases"];
    tests: QaGeneratedTestArtifact<TTestType>[];
    files: GeneratedFile[];
    manifest: QaRunnerManifest;
};
export declare function runGeneration<TTestType extends string>(input: GenerationInput<TTestType>): Promise<GenerationResult<TTestType>>;
//# sourceMappingURL=generation.d.ts.map