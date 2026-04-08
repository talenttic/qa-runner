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

export type { QaRunnerConfig, QaRunnerConfigValidation } from "./config.js";
export { validateConfig } from "./config.js";
export type { ChangeEventValidation } from "./validation.js";
export { validateChangeEvent } from "./validation.js";
export type { FileSystemAdapter, GitAdapter, ModelAdapter, ClockAdapter } from "./adapters/types.js";
export type { QaRunReport, QaCoverageReport, CoveragePlugin } from "./coverage.js";

export function buildManifest(event: ChangeEvent, outputs: QaRunnerManifest["outputs"]): QaRunnerManifest {
  return {
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    inputs: {
      files: event.files,
      summary: event.summary,
      diffPresent: Boolean(event.diff),
      tool: event.tool,
    },
    outputs,
  };
}

export { generateCasesFromPrompt } from "./generation/prompt.js";
export type { PromptGeneratedCase, PromptScope } from "./generation/prompt.js";
export { buildGeneratedTests, normalizeSelectedTestTypes } from "./generation/tests.js";
export type { QaGeneratedTestArtifact } from "./generation/tests.js";
export type {
  GeneratedFile,
  ManualGuideInput,
  ManualGuideResult,
  ManualGuideSkill,
  E2EGuideInput,
  E2EGuideResult,
  E2EScaffoldSkill,
} from "./skills/types.js";
export { renderManualGuideMarkdown, createManualGuideTemplateSkill } from "./skills/templates/manualGuide.js";
export { createPlaywrightScaffoldTemplateSkill } from "./skills/templates/playwrightScaffold.js";
export { runGeneration } from "./orchestrator/generation.js";
export type { GenerationInput, GenerationResult } from "./orchestrator/generation.js";
