import type { ManualGuideSkill } from "../types";
import type { PromptGeneratedCase } from "../../generation/prompt";
export declare function renderManualGuideMarkdown(input: {
    suiteName: string;
    prompt: string;
    cases: PromptGeneratedCase[];
}): string;
export declare function createManualGuideTemplateSkill(input: {
    filePath: string;
    suiteName: string;
}): ManualGuideSkill;
//# sourceMappingURL=manualGuide.d.ts.map