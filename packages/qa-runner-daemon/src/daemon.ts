import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createManualGuideTemplateSkill,
  createPlaywrightScaffoldTemplateSkill,
  runGeneration,
  type ChangeEvent,
  type GenerationResult,
} from "@talenttic/qa-runner-core";

export type DaemonConfig = {
  outputs: {
    manualDir: string;
    e2eDir: string;
    manifestPath: string;
  };
  overwriteGenerated?: boolean;
  uiReadPaths?: string[];
};

export type GenerationOutcome = {
  writtenFiles: string[];
  skippedFiles: string[];
  result: GenerationResult<string>;
};

export type GenerationMode = "manual" | "e2e" | "all";

export type GenerationOptions = {
  mode?: GenerationMode;
  ci?: boolean;
  timestampOverride?: number;
  selectedTestTypes?: string[];
  defaultTestType?: string;
  baseTagByType?: Record<string, string>;
  scope?: {
    pluginIds?: string[];
    routes?: string[];
  };
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
      manualSkill,
      e2eSkill,
    });

    const writtenFiles: string[] = [];
    const skippedFiles: string[] = [];
    const routedFiles = result.files.map((file) => ({
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
    const manifest = {
      ...result.manifest,
      outputs: {
        manualGuides,
        e2eSpecs,
      },
    };

    ensureDir(this.config.outputs.manifestPath);
    fs.writeFileSync(this.config.outputs.manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    return { writtenFiles, skippedFiles, result: { ...result, manifest } };
  }
}
