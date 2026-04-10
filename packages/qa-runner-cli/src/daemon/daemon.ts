import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createManualGuideTemplateSkill,
  createPlaywrightScaffoldTemplateSkill,
  createAiAutoTesterSkill,
  createFlakinessDetectorSkill,
  createSelfHealingSkill,
  createSkillRegistry,
  runGeneration,
  type ChangeEvent,
  type GenerationResult,
  type SelfHealingStrategy,
  type SkillsConfig,
} from "../core/index.js";

export type DaemonConfig = {
  outputs: {
    manualDir: string;
    e2eDir: string;
    manifestPath: string;
  };
  overwriteGenerated?: boolean;
  uiReadPaths?: string[];
  skills?: SkillsConfig;
};

export type GenerationOutcome = {
  writtenFiles: string[];
  skippedFiles: string[];
  result: GenerationResult<string>;
  healingAttempts: Array<{
    testId?: string;
    recovered: boolean;
    strategy?: string;
    occurredAt: string;
  }>;
};

export type GenerationMode = "manual" | "e2e" | "all";

export type GenerationOptions = {
  mode?: GenerationMode;
  ci?: boolean;
  environment?: string;
  autoTestEnabled?: boolean;
  healingStrategy?: SelfHealingStrategy;
  healingRetryBudget?: number;
  timestampOverride?: number;
  selectedTestTypes?: string[];
  defaultTestType?: string;
  baseTagByType?: Record<string, string>;
  scope?: {
    pluginIds?: string[];
    routes?: string[];
  };
};

const parseEnvList = (value: string | undefined): string[] => {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const shouldRunAiAutoTesting = (environment: string, options: GenerationOptions): boolean => {
  if (options.autoTestEnabled === true) {
    return true;
  }
  if (options.autoTestEnabled === false) {
    return false;
  }
  const ciAllowlist = parseEnvList(process.env.AUTO_TEST_ENV);
  if (ciAllowlist.length > 0) {
    return ciAllowlist.includes(environment);
  }
  if (environment === "prod") {
    return options.autoTestEnabled === true;
  }
  if (environment === "dev" || environment === "stage") {
    return true;
  }
  return options.autoTestEnabled === true;
};

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);

const createId = (): string => crypto.randomBytes(6).toString("hex");

const ensureDir = (filePath: string): void => {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
};

const resolveOutputPath = (filePath: string, outputs: DaemonConfig["outputs"]): string => {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  if (filePath.endsWith(".md")) {
    return path.join(outputs.manualDir, filePath);
  }
  if (filePath.endsWith(".spec.ts") || filePath.endsWith(".page.ts")) {
    return path.join(outputs.e2eDir, filePath);
  }
  return path.join(outputs.e2eDir, filePath);
};

const loadPreviousExecutions = (
  manifestPath: string,
): Array<{ environment: string; success: boolean; lowConfidenceCount: number; executedAt: string; notes?: string }> => {
  if (!fs.existsSync(manifestPath)) {
    return [];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      aiAutoTesting?: { executions?: Array<{ environment: string; success: boolean; lowConfidenceCount: number; executedAt: string; notes?: string }> };
    };
    return Array.isArray(raw.aiAutoTesting?.executions) ? raw.aiAutoTesting.executions : [];
  } catch {
    return [];
  }
};

export class QaRunnerDaemon {
  constructor(private config: DaemonConfig) {}

  async handleEvent(event: ChangeEvent, options: GenerationOptions = {}): Promise<GenerationOutcome> {
    const mode = options.mode ?? "all";
    const eventTimestamp = options.timestampOverride ?? event.timestamp;
    const effectiveDate = new Date(eventTimestamp);
    const manualFilePath = path.join(
      this.config.outputs.manualDir,
      `${effectiveDate.toISOString().slice(0, 10)}__qa-generated.md`,
    );

    const manualSkill =
      mode === "manual" || mode === "all"
        ? createManualGuideTemplateSkill({
            filePath: manualFilePath,
            suiteName: "Generated QA",
          })
        : undefined;

    const e2eSkill =
      mode === "e2e" || mode === "all"
        ? createPlaywrightScaffoldTemplateSkill({
            specPathForTest: (test) => path.join(this.config.outputs.e2eDir, `${test.featureKey}.spec.ts`),
            pageObjectPathForTest: (test) => path.join(this.config.outputs.e2eDir, "pages", `${test.featureKey}.page.ts`),
            pageObjectImportPathForSpec: (test) => `./pages/${test.featureKey}.page`,
            classNameForTest: (test) => `${slugify(test.featureKey)}Page`.replace(/(^[a-z])/, (m) => m.toUpperCase()),
          })
        : undefined;

    const effectiveSkills: SkillsConfig = {
      ...(this.config.skills ?? {}),
      selfHealing: {
        ...(this.config.skills?.selfHealing ?? {}),
        strategy: options.healingStrategy ?? this.config.skills?.selfHealing?.strategy,
        retryBudget: options.healingRetryBudget ?? this.config.skills?.selfHealing?.retryBudget,
      },
      aiAutoTester: {
        ...(this.config.skills?.aiAutoTester ?? {}),
      },
    };

    const registry = createSkillRegistry({
      config: effectiveSkills,
      manualGuide: manualSkill,
      e2eScaffold: e2eSkill,
      selfHealing: effectiveSkills.selfHealing?.enabled ? createSelfHealingSkill(effectiveSkills.selfHealing) : undefined,
      aiAutoTester: effectiveSkills.aiAutoTester?.enabled
        ? createAiAutoTesterSkill({
            confidenceThreshold: effectiveSkills.aiAutoTester?.confidenceThreshold,
            environments: effectiveSkills.aiAutoTester?.environments,
            executionMode: effectiveSkills.aiAutoTester?.executionMode,
            playwrightCommand: effectiveSkills.aiAutoTester?.playwrightCommand,
            workspaceRoot: effectiveSkills.aiAutoTester?.workspaceRoot,
          })
        : undefined,
      flakinessDetector: effectiveSkills.flakinessDetector?.enabled
        ? createFlakinessDetectorSkill({
            unstableThreshold: effectiveSkills.flakinessDetector?.unstableThreshold,
          })
        : undefined,
    });

    const selectedTestTypes = (options.selectedTestTypes ?? []).filter(Boolean);
    const defaultTestType = options.defaultTestType ?? selectedTestTypes[0] ?? "ui_functional";
    const baseTagByType =
      options.baseTagByType ??
      Object.fromEntries(
        Array.from(new Set([defaultTestType, ...selectedTestTypes])).map((type) => [
          type,
          type === "ui_functional" ? "@ui" : `@${type}`,
        ]),
      );

    const result = await runGeneration({
      event,
      prompt: event.summary ?? "",
      scope: options.scope ?? {},
      generatedAt: options.ci ? new Date(eventTimestamp).toISOString() : undefined,
      selectedTestTypes: selectedTestTypes.length > 0 ? selectedTestTypes : undefined,
      defaultTestType,
      baseTagByType,
      slugify,
      createId,
      filePathForFeature: (featureKey) => path.join(this.config.outputs.e2eDir, `${featureKey}.spec.ts`),
      testIdSelectorsForFeature: (featureKey) => [
        `qa-${featureKey}-root`,
        `qa-${featureKey}-primary-action`,
        `qa-${featureKey}-result`,
      ],
      healingAttempts: [],
      manualSkill: registry.manualGuide,
      e2eSkill: registry.e2eScaffold,
    });

    const writtenFiles: string[] = [];
    const skippedFiles: string[] = [];
    const generatedFiles = [...result.files];
    const environment = options.environment ?? process.env.QA_RUNNER_ENV ?? "dev";
    let aiExecution:
      | {
          environment: string;
          success: boolean;
          lowConfidenceCount: number;
          executedAt: string;
          notes?: string;
        }
      | undefined;
    const flakinessRecords: Array<{
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
    }> = [];

    if (registry.aiAutoTester && shouldRunAiAutoTesting(environment, options)) {
      const aiResult = await registry.aiAutoTester.executeAutoTest({
        suiteName: result.suiteName,
        cases: result.cases,
        environment,
      });
      if (aiResult.artifacts && aiResult.artifacts.length > 0) {
        generatedFiles.push(...aiResult.artifacts);
      }
      if (registry.flakinessDetector && aiResult.execution) {
        for (const item of aiResult.execution.cases) {
          const failedStep = item.steps.find((step) => step.status === "failed");
          const category: "timing" | "selector" | "assertion" | undefined = item.passed
            ? undefined
            : failedStep?.fallbackApplied
              ? "selector"
              : (failedStep?.confidence ?? 1) < 0.7
                ? "assertion"
                : "timing";
          const record = await registry.flakinessDetector.recordSignal({
            testId: item.caseId,
            outcome: item.passed ? "pass" : "fail",
            category,
          });
          flakinessRecords.push({
            testId: item.caseId,
            flakeScore: record.flakeScore,
            passRate: record.passRate,
            totalRuns: record.totalRuns,
            unstable: record.unstable,
            categoryBreakdown: record.categoryBreakdown,
            dominantCategory: record.dominantCategory,
          });
        }
      }
      aiExecution = {
        environment,
        success: aiResult.success,
        lowConfidenceCount: aiResult.lowConfidenceCount ?? 0,
        executedAt: new Date().toISOString(),
        notes: aiResult.notes,
      };
    }

    const routedFiles = generatedFiles.map((file) => ({
      path: resolveOutputPath(file.path, this.config.outputs),
      content: file.content,
    }));

    for (const file of routedFiles) {
      const fullPath = file.path;
      if (!this.config.overwriteGenerated && fs.existsSync(fullPath)) {
        skippedFiles.push(fullPath);
        continue;
      }
      ensureDir(fullPath);
      fs.writeFileSync(fullPath, file.content, "utf-8");
      writtenFiles.push(fullPath);
    }

    const manualGuides = routedFiles.filter((file) => file.path.endsWith(".md")).map((file) => file.path);
    const e2eSpecs = routedFiles.filter((file) => file.path.endsWith(".spec.ts")).map((file) => file.path);
    const healingAttempts = result.manifest.healing?.attempts ?? [];
    const previousExecutions = loadPreviousExecutions(this.config.outputs.manifestPath);
    const nextExecutions = aiExecution
      ? [...previousExecutions, aiExecution].slice(-200)
      : previousExecutions.slice(-200);

    const manifest = {
      ...result.manifest,
      outputs: {
        manualGuides,
        e2eSpecs,
      },
      aiAutoTesting: {
        executions: nextExecutions,
      },
      flakiness: {
        records: flakinessRecords,
      },
    };

    ensureDir(this.config.outputs.manifestPath);
    fs.writeFileSync(this.config.outputs.manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    return { writtenFiles, skippedFiles, result: { ...result, manifest }, healingAttempts };
  }
}
