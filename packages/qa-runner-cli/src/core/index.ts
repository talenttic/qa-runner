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
  healing?: {
    attempts: Array<{
      testId?: string;
      recovered: boolean;
      strategy?: string;
      occurredAt: string;
    }>;
    summary?: {
      totalAttempts: number;
      recoveredAttempts: number;
      byStrategy?: Record<string, { attempts: number; recovered: number }>;
    };
  };
  aiAutoTesting?: {
    executions: Array<{
      environment: string;
      success: boolean;
      lowConfidenceCount: number;
      executedAt: string;
      notes?: string;
    }>;
  };
  flakiness?: {
    records: Array<{
      testId: string;
      flakeScore?: number;
      passRate?: number;
      totalRuns?: number;
      unstable?: boolean;
      categoryBreakdown?: {
        timing: number;
        selector: number;
        assertion: number;
      };
      dominantCategory?: "timing" | "selector" | "assertion" | "none";
    }>;
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
  SkillsConfig,
  SkillToggle,
  SelfHealingStrategy,
  SelfHealingInput,
  SelfHealingResult,
  SelfHealingSkill,
  AiAutoTesterInput,
  AiAutoTesterResult,
  AiAutoTesterSkill,
  AiExecutionStep,
  AiPreparedCase,
  AiExecutionPlan,
  AiValidationSignal,
  FlakinessSignal,
  FlakinessRecord,
  FlakinessDetectorSkill,
} from "./skills/types.js";
export { renderManualGuideMarkdown, createManualGuideTemplateSkill } from "./skills/templates/manualGuide.js";
export { createPlaywrightScaffoldTemplateSkill } from "./skills/templates/playwrightScaffold.js";
export { createSelfHealingSkill } from "./skills/selfHealing.js";
export { createAiAutoTesterSkill } from "./skills/aiAutoTester.js";
export { buildAiExecutionPlan, buildAiValidationSignals } from "./skills/aiAutoTester.js";
export { createFlakinessDetectorSkill } from "./skills/flakinessDetector.js";
export type { FlakinessDetectorConfig } from "./skills/flakinessDetector.js";
export { createSkillRegistry } from "./skills/skill-registry.js";
export type { SkillRegistry, SkillRegistryOptions } from "./skills/skill-registry.js";
export { decideHealingRetry, categorizeHealingFailure, createHealingAttempt } from "./skills/healing-orchestrator.js";
export type { HealingRetryDecision, HealingFailureCategory, HealingAttempt } from "./skills/healing-orchestrator.js";
export { diffDomSnapshots, createDomMutationWatcher } from "./skills/dom-mutation.js";
export type { DomMutationSnapshot, DomMutationDelta, DomMutationWatcher } from "./skills/dom-mutation.js";
export { runGeneration, buildHealingSummary } from "./orchestrator/generation.js";
export type { GenerationInput, GenerationResult, HealingAttemptInput, HealingSummary } from "./orchestrator/generation.js";
