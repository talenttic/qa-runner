import type { ChangeEvent, QaRunnerManifest } from "../index.js";
import type { ManualGuideSkill, E2EScaffoldSkill, GeneratedFile } from "../skills/types.js";
import type { PromptScope } from "../generation/prompt.js";
import {
  buildGeneratedTests,
  generateCasesFromPrompt,
  normalizeSelectedTestTypes,
  type QaGeneratedTestArtifact,
} from "../index.js";

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

export async function runGeneration<TTestType extends string>(input: GenerationInput<TTestType>): Promise<GenerationResult<TTestType>> {
  const generated = generateCasesFromPrompt({
    prompt: input.prompt,
    scope: input.scope,
  });

  const selectedTestTypes = normalizeSelectedTestTypes({
    types: input.selectedTestTypes,
    defaultType: input.defaultTestType,
  });

  const tests = buildGeneratedTests({
    suiteName: generated.suiteName,
    cases: generated.cases,
    selectedTestTypes,
    defaultTestType: input.defaultTestType,
    baseTagByType: input.baseTagByType,
    slugify: input.slugify,
    createId: input.createId,
    filePathForFeature: input.filePathForFeature,
    testIdSelectorsForFeature: input.testIdSelectorsForFeature,
  });

  const files: GeneratedFile[] = [];

  if (input.manualSkill) {
    const manualResult = await input.manualSkill.generateManualGuides({
      prompt: input.prompt,
      scope: input.scope,
      cases: generated.cases,
    });
    files.push(...manualResult.files);
  }

  if (input.e2eSkill) {
    const e2eResult = await input.e2eSkill.generatePlaywrightScaffold({
      suiteName: generated.suiteName,
      cases: generated.cases,
      tests,
    });
    files.push(...e2eResult.files);
  }

  const manifest: QaRunnerManifest = {
    version: "0.1.0",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    inputs: {
      files: input.event.files,
      summary: input.event.summary,
      diffPresent: Boolean(input.event.diff),
      tool: input.event.tool,
    },
    outputs: {
      manualGuides: files.filter((file) => file.path.endsWith(".md")).map((file) => file.path),
      e2eSpecs: files.filter((file) => file.path.endsWith(".spec.ts")).map((file) => file.path),
    },
  };

  return {
    suiteName: generated.suiteName,
    cases: generated.cases,
    tests,
    files,
    manifest,
  };
}
