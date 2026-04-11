#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { QaRunnerDaemon, startDaemonServer, startWatcher } from "./daemon/index.js";
import {
  categorizeHealingFailure,
  createHealingAttempt,
  decideHealingRetry,
  type ChangeEvent,
  type HealingAttempt,
} from "./core/index.js";
import { loadConfig, resolveOutputs } from "./config.js";
import { parseAutoTestOverride, parseHealingOverride, resolveRuntimeProfile } from "./runtime-profile.js";
import { spawnSync } from "node:child_process";
import { getUiAssetDir } from "@talenttic/qa-runner-ui";

const args = process.argv.slice(2);
const command = args[0];

const cwd = process.cwd();

const parseFlag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
};

const parseList = (name: string): string[] => {
  const value = parseFlag(name);
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
};

const parseRatePercent = (value: string | undefined): number | null => {
  if (!value) return null;
  const cleaned = value.replace("%", "").trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const stripAnsi = (value: string): string => value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");

const extractTestPassthroughArgs = (inputArgs: string[]): string[] => {
  const passthrough: string[] = [];
  for (let index = 0; index < inputArgs.length; index += 1) {
    const current = inputArgs[index]!;
    if (
      current === "--auto-test" ||
      current === "--no-auto-test" ||
      current === "--validate-manual-cases" ||
      current === "--report-healing-stats" ||
      current === "--suggest-fixes" ||
      current === "--apply-suggested-fixes"
    ) {
      continue;
    }
    if (
      current === "--env" ||
      current === "--healing" ||
      current === "--validate-healing-rate" ||
      current === "--suggestions-output"
    ) {
      index += 1;
      continue;
    }
    if (
      current.startsWith("--env=") ||
      current.startsWith("--healing=") ||
      current.startsWith("--validate-healing-rate=") ||
      current.startsWith("--suggestions-output=")
    ) {
      continue;
    }
    passthrough.push(current);
  }
  return passthrough;
};

const isPlaywrightCommand = (commandLine: string): boolean => {
  const normalized = commandLine.toLowerCase();
  return normalized.includes("playwright") || normalized.includes("e2e/ui");
};

const addCommandArgs = (cmd: string, baseArgs: string[], extraArgs: string[]): string[] => {
  if (extraArgs.length === 0) {
    return baseArgs;
  }
  if (cmd === "npm") {
    return [...baseArgs, "--", ...extraArgs];
  }
  return [...baseArgs, ...extraArgs];
};

type PlaywrightFailureSnapshot = {
  failedTargets: string[];
  firstFailureMessage: string;
  failures: Array<{
    target: string;
    message: string;
    sourceFile?: string;
    sourceLine?: number;
    locatorHint?: string;
  }>;
};

const parseFailureDetail = (
  target: string,
  rawMessage: string,
  projectRoot: string,
): {
  target: string;
  message: string;
  sourceFile?: string;
  sourceLine?: number;
  locatorHint?: string;
} => {
  const cleaned = stripAnsi(rawMessage);
  const absoluteMatch = cleaned.match(/\((\/[^():]+):(\d+):(\d+)\)/);
  const relativeMatch = cleaned.match(/at\s+(\.\.?\/[^\s:]+):(\d+):(\d+)/);
  let sourceFile: string | undefined;
  let sourceLine: number | undefined;
  if (absoluteMatch) {
    sourceFile = absoluteMatch[1];
    sourceLine = Number(absoluteMatch[2]);
  } else if (relativeMatch) {
    sourceFile = path.resolve(projectRoot, "e2e/ui/tests", relativeMatch[1]);
    sourceLine = Number(relativeMatch[2]);
  }
  const locatorMatch = cleaned.match(/waiting for ([^\n]+)/i);
  return {
    target,
    message: rawMessage,
    sourceFile,
    sourceLine: Number.isFinite(sourceLine ?? NaN) ? sourceLine : undefined,
    locatorHint: locatorMatch?.[1]?.trim(),
  };
};

const readPlaywrightFailureSnapshot = (reportPath: string): PlaywrightFailureSnapshot => {
  if (!fs.existsSync(reportPath)) {
    return { failedTargets: [], firstFailureMessage: "", failures: [] };
  }
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf-8")) as {
      suites?: Array<{
        file?: string;
        line?: number;
        specs?: Array<{
          file?: string;
          line?: number;
          tests?: Array<{
            results?: Array<{
              status?: string;
              error?: { message?: string };
              errors?: Array<{ message?: string }>;
            }>;
          }>;
        }>;
        suites?: Array<unknown>;
      }>;
    };
    const failedTargets = new Set<string>();
    let firstFailureMessage = "";
    const failures: Array<{
      target: string;
      message: string;
      sourceFile?: string;
      sourceLine?: number;
      locatorHint?: string;
    }> = [];

    const visitSuite = (suite: {
      file?: string;
      line?: number;
      specs?: Array<{
        file?: string;
        line?: number;
        tests?: Array<{
          results?: Array<{
            status?: string;
            error?: { message?: string };
            errors?: Array<{ message?: string }>;
          }>;
        }>;
      }>;
      suites?: Array<unknown>;
    }) => {
      for (const spec of suite.specs ?? []) {
        const failedResult = spec.tests
          ?.flatMap((test) => test.results ?? [])
          .find((result) => result.status === "failed" || result.status === "timedOut" || result.status === "interrupted");
        if (!failedResult) {
          continue;
        }
        const file = spec.file ?? suite.file;
        const line = Number(spec.line ?? suite.line ?? 0);
        const target = file ? (line > 0 ? `${file}:${line}` : file) : "unknown";
        if (file) {
          failedTargets.add(target);
        }
        const messages = [
          failedResult.error?.message,
          ...(Array.isArray(failedResult.errors) ? failedResult.errors.map((item) => item?.message) : []),
        ].filter((value): value is string => Boolean(value && value.trim()));
        const primaryMessage = messages[0] ?? "unknown failure";
        if (!firstFailureMessage && primaryMessage) {
          firstFailureMessage = primaryMessage;
        }
        for (const message of messages.length > 0 ? messages : [primaryMessage]) {
          failures.push(parseFailureDetail(target, message, process.cwd()));
        }
      }
      for (const child of suite.suites ?? []) {
        if (child && typeof child === "object") {
          visitSuite(child as {
            file?: string;
            line?: number;
            specs?: Array<{
              file?: string;
              line?: number;
              tests?: Array<{
                results?: Array<{
                  status?: string;
                  error?: { message?: string };
                }>;
              }>;
            }>;
            suites?: Array<unknown>;
          });
        }
      }
    };

    for (const suite of report.suites ?? []) {
      visitSuite(suite);
    }

    return {
      failedTargets: Array.from(failedTargets),
      firstFailureMessage,
      failures,
    };
  } catch {
    return { failedTargets: [], firstFailureMessage: "", failures: [] };
  }
};

const buildFixSuggestion = (target: string, message: string): { category: string; recommendation: string } => {
  const normalized = message.toLowerCase();
  const waitingForRoleNameButton =
    normalized.includes("timeout") &&
    normalized.includes("waiting for getbyrole('button'") &&
    normalized.includes("name:");
  if (waitingForRoleNameButton) {
    return {
      category: "selector",
      recommendation:
        "Button role+name selector no longer matches current UI label. Update page-object locator to support renamed button labels with a fallback regex or data-testid.",
    };
  }
  if (normalized.includes("econnrefused") || normalized.includes("connect") || normalized.includes("127.0.0.1")) {
    return {
      category: "environment",
      recommendation:
        "API/web server connection failed. Verify managed webservers are enabled, ports match runtime config, and tests do not hardcode stale API URLs.",
    };
  }
  if (normalized.includes("timeout") && normalized.includes("waiting for")) {
    return {
      category: "timing",
      recommendation:
        "Replace brittle immediate click/assert with deterministic waits on visible+enabled state and completion signals. Add explicit guard for feature flags/prerequisites.",
    };
  }
  if (normalized.includes("timeout")) {
    return {
      category: "timing",
      recommendation:
        "Action timed out. Add precondition checks and explicit readiness waits (visible, enabled, network response) before interacting.",
    };
  }
  if (normalized.includes("element(s) not found") || normalized.includes("not found") || normalized.includes("locator")) {
    return {
      category: "selector",
      recommendation:
        "Selector appears stale. Prefer data-testid and role+name fallbacks, and update page object locators to match current UI contracts.",
    };
  }
  return {
    category: "unknown",
    recommendation:
      "Review trace/video and error context, then tighten selector strategy or environment setup based on first failing action.",
  };
};

const writeHealingSuggestions = (
  outputPath: string,
  runtime: { env: string; strategy: string; retries: number },
  failures: Array<{
    target: string;
    message: string;
    sourceFile?: string;
    sourceLine?: number;
    locatorHint?: string;
  }>,
): void => {
  const suggestions = failures.map((failure) => {
    const suggestion = buildFixSuggestion(failure.target, failure.message);
    return {
      target: failure.target,
      category: suggestion.category,
      recommendation: suggestion.recommendation,
      message: failure.message,
      sourceFile: failure.sourceFile,
      sourceLine: failure.sourceLine,
      locatorHint: failure.locatorHint,
    };
  });
  const payload = {
    generatedAt: new Date().toISOString(),
    runtime,
    failureCount: failures.length,
    suggestions,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf-8");
};

const applyTimingFixes = (
  failures: Array<{
    target: string;
    message: string;
    sourceFile?: string;
    sourceLine?: number;
  }>,
): Array<{ filePath: string; line: number; reason: string }> => {
  const applied: Array<{ filePath: string; line: number; reason: string }> = [];
  const grouped = new Map<string, Array<{ line: number; message: string }>>();
  for (const failure of failures) {
    if (!failure.sourceFile || !failure.sourceLine) continue;
    const category = buildFixSuggestion(failure.target, failure.message).category;
    if (category !== "timing") continue;
    if (!grouped.has(failure.sourceFile)) grouped.set(failure.sourceFile, []);
    grouped.get(failure.sourceFile)!.push({ line: failure.sourceLine, message: failure.message });
  }
  for (const [filePath, entries] of grouped.entries()) {
    if (!fs.existsSync(filePath)) continue;
    const original = fs.readFileSync(filePath, "utf-8");
    const lines = original.split("\n");
    const ordered = entries
      .filter((entry) => entry.line > 0 && entry.line <= lines.length)
      .sort((a, b) => b.line - a.line);
    for (const entry of ordered) {
      const idx = entry.line - 1;
      const current = lines[idx] ?? "";
      const match = current.match(/^(\s*)await\s+(.+?)\.click\((.*?)\);\s*$/);
      if (!match) continue;
      const indent = match[1] ?? "";
      const receiver = match[2] ?? "";
      const args = match[3] ?? "";
      const prev = lines[Math.max(0, idx - 1)] ?? "";
      if (prev.includes(`${receiver}.waitFor(`)) {
        continue;
      }
      const replacement: string[] = [
        `${indent}await ${receiver}.waitFor({ state: "visible", timeout: 10000 });`,
        `${indent}await ${receiver}.click(${args});`,
      ];
      lines.splice(idx, 1, ...replacement);
      applied.push({ filePath, line: entry.line, reason: "timing_wait_before_click" });
    }
    if (applied.some((item) => item.filePath === filePath)) {
      fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
    }
  }
  return applied;
};

const BUTTON_RENAME_ALIASES: Record<string, string[]> = {
  "Generate Tests": ["Run Tests (Prepare + Execute)", "2) Run Tests (Prepare + Execute)", "Run tests with AI"],
  "Load Tests": ["Load Existing Suite", "1) Load Existing Suite", "Step 1: Load existing Playwright suite"],
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseRoleButtonNameFromFailure = (message: string): string | null => {
  const cleaned = stripAnsi(message);
  const single = cleaned.match(/getByRole\('button',\s*\{\s*name:\s*'([^']+)'\s*,\s*exact:\s*true\s*\}\)/i);
  if (single?.[1]) return single[1].trim();
  const dbl = cleaned.match(/getByRole\("button",\s*\{\s*name:\s*"([^"]+)"\s*,\s*exact:\s*true\s*\}\)/i);
  if (dbl?.[1]) return dbl[1].trim();
  return null;
};

const applyButtonRenameFallbackFixes = (
  failures: Array<{
    target: string;
    message: string;
    sourceFile?: string;
  }>,
): Array<{ filePath: string; line: number; reason: string }> => {
  const applied: Array<{ filePath: string; line: number; reason: string }> = [];
  const buttonNames = new Set<string>();
  for (const failure of failures) {
    if (buildFixSuggestion(failure.target, failure.message).category !== "selector") continue;
    const buttonName = parseRoleButtonNameFromFailure(failure.message);
    if (buttonName) buttonNames.add(buttonName);
  }
  if (buttonNames.size === 0) return applied;

  const knownRenames = Array.from(buttonNames).filter((name) => Array.isArray(BUTTON_RENAME_ALIASES[name]));
  if (knownRenames.length === 0) return applied;

  const candidateFiles = new Set<string>();
  for (const failure of failures) {
    if (failure.sourceFile && fs.existsSync(failure.sourceFile)) candidateFiles.add(failure.sourceFile);
  }

  for (const filePath of candidateFiles) {
    const original = fs.readFileSync(filePath, "utf-8");
    const lines = original.split("\n");
    let changed = false;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      for (const originalName of knownRenames) {
        const aliases = BUTTON_RENAME_ALIASES[originalName];
        const singleQuotedNeedle = `name: '${originalName}', exact: true`;
        const doubleQuotedNeedle = `name: "${originalName}", exact: true`;
        if (!line.includes(singleQuotedNeedle) && !line.includes(doubleQuotedNeedle)) continue;
        if (!line.includes("getByRole('button'") && !line.includes('getByRole("button"')) continue;
        if (line.includes("name: /")) continue;
        const variants = [originalName, ...aliases].map((name) => escapeRegExp(name));
        const regexLiteral = `name: /${variants.join("|")}/`;
        lines[i] = line
          .replace(singleQuotedNeedle, `${regexLiteral}`)
          .replace(doubleQuotedNeedle, `${regexLiteral}`);
        changed = true;
        applied.push({ filePath, line: i + 1, reason: "selector_button_label_fallback" });
        break;
      }
    }
    if (changed) {
      fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
    }
  }

  return applied;
};

const applyDisabledButtonPrereqFixes = (
  failures: Array<{
    target: string;
    message: string;
    sourceFile?: string;
    sourceLine?: number;
  }>,
): Array<{ filePath: string; line: number; reason: string }> => {
  const applied: Array<{ filePath: string; line: number; reason: string }> = [];
  const grouped = new Map<string, Array<{ line: number; message: string }>>();
  for (const failure of failures) {
    if (!failure.sourceFile || !failure.sourceLine) continue;
    const normalized = stripAnsi(failure.message).toLowerCase();
    if (!normalized.includes("element is not enabled")) continue;
    if (!normalized.includes("step 2: run tests")) continue;
    if (!grouped.has(failure.sourceFile)) grouped.set(failure.sourceFile, []);
    grouped.get(failure.sourceFile)!.push({ line: failure.sourceLine, message: failure.message });
  }

  for (const [filePath, entries] of grouped.entries()) {
    if (!fs.existsSync(filePath)) continue;
    const original = fs.readFileSync(filePath, "utf-8");
    const lines = original.split("\n");
    const ordered = entries
      .filter((entry) => entry.line > 0 && entry.line <= lines.length)
      .sort((a, b) => b.line - a.line);
    for (const entry of ordered) {
      const idx = entry.line - 1;
      const current = lines[idx] ?? "";
      const match = current.match(/^(\s*)await\s+(.+?)\.click\((.*?)\);\s*$/);
      if (!match) continue;
      const indent = match[1] ?? "";
      const receiver = match[2] ?? "";
      const args = match[3] ?? "";
      const prevBlock = lines.slice(Math.max(0, idx - 8), idx).join("\n");
      if (prevBlock.includes("loadExistingSuiteButton")) continue;
      const replacement: string[] = [
        `${indent}const loadExistingSuiteButton = this.page.getByRole('button', {`,
        `${indent}  name: /Load Existing Suite|Step 1: Load existing Playwright suite|1\\) Load Existing Suite/,`,
        `${indent}});`,
        `${indent}if (await loadExistingSuiteButton.isVisible().catch(() => false)) {`,
        `${indent}  if (!(await loadExistingSuiteButton.isDisabled().catch(() => true))) {`,
        `${indent}    await loadExistingSuiteButton.click();`,
        `${indent}  }`,
        `${indent}}`,
        `${indent}await expect(${receiver}).toBeEnabled({ timeout: 15000 });`,
        `${indent}await ${receiver}.click(${args});`,
      ];
      lines.splice(idx, 1, ...replacement);
      applied.push({ filePath, line: entry.line, reason: "workflow_step_unlock_before_click" });
    }
    if (applied.some((item) => item.filePath === filePath)) {
      fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
    }
  }

  return applied;
};

const applyAssertionTextFallbackFixes = (
  failures: Array<{
    target: string;
    message: string;
    sourceFile?: string;
    sourceLine?: number;
  }>,
): Array<{ filePath: string; line: number; reason: string }> => {
  const applied: Array<{ filePath: string; line: number; reason: string }> = [];
  const grouped = new Map<string, Array<number>>();
  for (const failure of failures) {
    if (!failure.sourceFile || !failure.sourceLine) continue;
    const normalized = stripAnsi(failure.message).toLowerCase();
    if (!normalized.includes("element(s) not found")) continue;
    if (!normalized.includes("generated tests at")) continue;
    if (!grouped.has(failure.sourceFile)) grouped.set(failure.sourceFile, []);
    grouped.get(failure.sourceFile)!.push(failure.sourceLine);
  }

  for (const [filePath, linesToInspect] of grouped.entries()) {
    if (!fs.existsSync(filePath)) continue;
    const original = fs.readFileSync(filePath, "utf-8");
    const lines = original.split("\n");
    const ordered = Array.from(new Set(linesToInspect))
      .filter((line) => line > 0 && line <= lines.length)
      .sort((a, b) => b - a);
    for (const lineNumber of ordered) {
      const idx = lineNumber - 1;
      const current = lines[idx] ?? "";
      if (!current.includes("generated tests at")) continue;
      if (current.includes("Loaded tests:")) continue;
      const next = current.replace(
        "hasText: 'generated tests at'",
        "hasText: /generated tests at|Loaded tests:/i",
      );
      if (next !== current) {
        lines[idx] = next;
        applied.push({ filePath, line: lineNumber, reason: "assertion_text_fallback" });
      }
    }
    if (applied.some((item) => item.filePath === filePath)) {
      fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
    }
  }

  return applied;
};

const upsertHealingAttempts = (manifestPath: string, attempts: HealingAttempt[]): void => {
  if (attempts.length === 0) {
    return;
  }
  let payload: Record<string, unknown> = {};
  if (fs.existsSync(manifestPath)) {
    try {
      payload = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
    } catch {
      payload = {};
    }
  }
  const healing = (payload.healing as Record<string, unknown> | undefined) ?? {};
  const existingAttempts = Array.isArray(healing.attempts) ? (healing.attempts as Array<Record<string, unknown>>) : [];
  const mergedAttempts = [...existingAttempts, ...attempts] as Array<Record<string, unknown>>;
  const recoveredAttempts = mergedAttempts.filter((attempt) => Boolean(attempt.recovered)).length;
  payload.healing = {
    ...healing,
    attempts: mergedAttempts,
    summary: {
      totalAttempts: mergedAttempts.length,
      recoveredAttempts,
      lastAttemptAt: mergedAttempts[mergedAttempts.length - 1]?.occurredAt ?? new Date().toISOString(),
    },
  };
  fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2), "utf-8");
};

const readManifestStats = (manifestPath: string): {
  healingRatePercent: number | null;
  totalHealingAttempts: number;
  recoveredAttempts: number;
  unstableFlakyCases: number;
  dominantFlakinessCategory: "timing" | "selector" | "assertion" | "none";
} => {
  if (!fs.existsSync(manifestPath)) {
    return {
      healingRatePercent: null,
      totalHealingAttempts: 0,
      recoveredAttempts: 0,
      unstableFlakyCases: 0,
      dominantFlakinessCategory: "none",
    };
  }
  try {
    const payload = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      healing?: { summary?: { totalAttempts?: number; recoveredAttempts?: number } };
      flakiness?: {
        records?: Array<{
          unstable?: boolean;
          categoryBreakdown?: { timing?: number; selector?: number; assertion?: number };
        }>;
      };
    };
    const total = payload.healing?.summary?.totalAttempts ?? 0;
    const recovered = payload.healing?.summary?.recoveredAttempts ?? 0;
    const rate = total > 0 ? Number(((recovered / total) * 100).toFixed(2)) : 0;
    const records = Array.isArray(payload.flakiness?.records) ? payload.flakiness.records : [];
    const unstableFlakyCases = records.filter((row) => row.unstable).length;
    const categoryTotals = records.reduce(
      (acc, row) => {
        acc.timing += Number(row.categoryBreakdown?.timing ?? 0);
        acc.selector += Number(row.categoryBreakdown?.selector ?? 0);
        acc.assertion += Number(row.categoryBreakdown?.assertion ?? 0);
        return acc;
      },
      { timing: 0, selector: 0, assertion: 0 },
    );
    const dominantFlakinessCategory = (Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      "none") as "timing" | "selector" | "assertion" | "none";
    return {
      healingRatePercent: rate,
      totalHealingAttempts: total,
      recoveredAttempts: recovered,
      unstableFlakyCases,
      dominantFlakinessCategory,
    };
  } catch {
    return {
      healingRatePercent: null,
      totalHealingAttempts: 0,
      recoveredAttempts: 0,
      unstableFlakyCases: 0,
      dominantFlakinessCategory: "none",
    };
  }
};

type KpiScore = {
  value: number;
  threshold: number;
  pass: boolean;
};

type KpiReport = {
  generatedAt: string;
  window: {
    from: string;
    to: string;
    days: number;
  };
  selfHealingReduction: KpiScore & {
    baselineFlakyFailRate: number;
    currentFlakyFailRate: number;
  };
  manualGuideConfidence: KpiScore & {
    criticalSuiteFloor: number;
    criticalSuiteMinObserved: number;
  };
  sample: {
    aiValidationFiles: number;
    aiValidationSignals: number;
    aiExecutionCount: number;
  };
  overallPass: boolean;
  notes: string[];
};

const readJsonSafe = <T>(filePath: string): T | null => {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
};

const walkFiles = (dirPath: string, predicate: (filePath: string) => boolean, out: string[]): void => {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, out);
      continue;
    }
    if (entry.isFile() && predicate(fullPath)) {
      out.push(fullPath);
    }
  }
};

const findAiValidationFiles = (rootDir: string): string[] => {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const files: string[] = [];
  walkFiles(
    rootDir,
    (filePath) => filePath.endsWith(".ai-validation.json"),
    files,
  );
  return files.sort();
};

const average = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((acc, value) => acc + value, 0) / values.length;
};

const parseIsoDate = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildKpiReport = (input: {
  currentManifestPath: string;
  baselineManifestPath: string;
  aiValidationRoot: string;
  healingReductionThreshold?: number;
  manualConfidenceThreshold?: number;
  criticalSuiteFloor?: number;
}): KpiReport => {
  const healingReductionThreshold = input.healingReductionThreshold ?? 0.6;
  const manualConfidenceThreshold = input.manualConfidenceThreshold ?? 0.85;
  const criticalSuiteFloor = input.criticalSuiteFloor ?? 0.75;
  const notes: string[] = [];

  const currentManifest = readJsonSafe<{
    generatedAt?: string;
    flakiness?: { records?: Array<{ flakeScore?: number }> };
    aiAutoTesting?: { executions?: Array<{ executedAt?: string }> };
  }>(input.currentManifestPath);

  const baselineManifest = readJsonSafe<{
    flakiness?: { records?: Array<{ flakeScore?: number }> };
  }>(input.baselineManifestPath);

  const currentFlakeScores = Array.isArray(currentManifest?.flakiness?.records)
    ? currentManifest!.flakiness!.records!.map((item) => Number(item.flakeScore ?? 0))
    : [];
  const baselineFlakeScores = Array.isArray(baselineManifest?.flakiness?.records)
    ? baselineManifest!.flakiness!.records!.map((item) => Number(item.flakeScore ?? 0))
    : [];

  const baselineFlakyFailRate = Number(average(baselineFlakeScores).toFixed(3));
  const currentFlakyFailRate = Number(average(currentFlakeScores).toFixed(3));
  if (baselineFlakeScores.length === 0) {
    notes.push(`Baseline manifest missing flakiness records: ${input.baselineManifestPath}`);
  }
  const reductionRaw =
    baselineFlakyFailRate > 0
      ? (baselineFlakyFailRate - currentFlakyFailRate) / baselineFlakyFailRate
      : currentFlakyFailRate === 0
        ? 1
        : 0;
  const reduction = Number(reductionRaw.toFixed(3));
  const selfHealingPass =
    baselineFlakyFailRate > 0
      ? reduction >= healingReductionThreshold
      : currentFlakyFailRate === 0;
  if (baselineFlakyFailRate === 0 && currentFlakyFailRate === 0) {
    notes.push("No flaky failures detected in baseline or current dataset; self-healing reduction treated as passing.");
  }

  const aiValidationFiles = findAiValidationFiles(input.aiValidationRoot);
  if (aiValidationFiles.length === 0) {
    notes.push(`No AI validation artifacts found under ${input.aiValidationRoot}`);
  }

  const confidenceByFile: Array<{ filePath: string; averageConfidence: number }> = [];
  let allSignals = 0;
  for (const filePath of aiValidationFiles) {
    const payload = readJsonSafe<Array<{ confidence?: number }>>(filePath);
    if (!Array.isArray(payload) || payload.length === 0) {
      continue;
    }
    const values = payload
      .map((item) => Number(item.confidence))
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 1);
    if (values.length === 0) {
      continue;
    }
    allSignals += values.length;
    confidenceByFile.push({
      filePath,
      averageConfidence: average(values),
    });
  }
  const averageConfidence = Number(average(confidenceByFile.map((item) => item.averageConfidence)).toFixed(3));
  const criticalSuiteMinObserved = confidenceByFile.length > 0
    ? Number(Math.min(...confidenceByFile.map((item) => item.averageConfidence)).toFixed(3))
    : 0;
  const manualGuidePass =
    confidenceByFile.length > 0 &&
    averageConfidence >= manualConfidenceThreshold &&
    criticalSuiteMinObserved >= criticalSuiteFloor;

  const executionTimestamps = (currentManifest?.aiAutoTesting?.executions ?? [])
    .map((item) => parseIsoDate(item.executedAt))
    .filter((item): item is number => item !== null);
  const fromTs = executionTimestamps.length > 0 ? Math.min(...executionTimestamps) : 0;
  const toTs = executionTimestamps.length > 0 ? Math.max(...executionTimestamps) : 0;
  const days = fromTs > 0 && toTs >= fromTs ? Math.max(1, Math.ceil((toTs - fromTs) / 86400000) + 1) : 0;
  const generatedTs = parseIsoDate(currentManifest?.generatedAt) ?? toTs ?? 0;
  const generatedAt = generatedTs > 0 ? new Date(generatedTs).toISOString() : new Date(0).toISOString();

  return {
    generatedAt,
    window: {
      from: fromTs > 0 ? new Date(fromTs).toISOString().slice(0, 10) : "",
      to: toTs > 0 ? new Date(toTs).toISOString().slice(0, 10) : "",
      days,
    },
    selfHealingReduction: {
      baselineFlakyFailRate,
      currentFlakyFailRate,
      value: reduction,
      threshold: healingReductionThreshold,
      pass: selfHealingPass,
    },
    manualGuideConfidence: {
      value: averageConfidence,
      threshold: manualConfidenceThreshold,
      criticalSuiteFloor,
      criticalSuiteMinObserved,
      pass: manualGuidePass,
    },
    sample: {
      aiValidationFiles: confidenceByFile.length,
      aiValidationSignals: allSignals,
      aiExecutionCount: executionTimestamps.length,
    },
    overallPass: selfHealingPass && manualGuidePass,
    notes,
  };
};

const contentTypeForPath = (filePath: string): string => {
  if (filePath.endsWith(".html")) return "text/html";
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) return "text/javascript";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".json")) return "application/json";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
};

const serveStatic = (res: http.ServerResponse, filePath: string): void => {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return;
  }
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": contentTypeForPath(filePath) });
  res.end(content);
};

const startDemoServer = (port: number): void => {
  const uiDir = getUiAssetDir();
  const uiIndex = path.join(uiDir, "index.html");

  const server = http.createServer((req, res) => {
    if (!req.url) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;

    if (pathname.startsWith("/plugin/") || pathname.startsWith("/file") || pathname.startsWith("/status")) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }

    if (pathname === "/" || pathname === "/ui" || pathname === "/ui/") {
      serveStatic(res, uiIndex);
      return;
    }

    if (pathname.startsWith("/assets/")) {
      const assetPath = path.join(uiDir, pathname.replace(/^\/+/, ""));
      serveStatic(res, assetPath);
      return;
    }

    const candidate = path.join(uiDir, pathname.replace(/^\/+/, ""));
    if (candidate.startsWith(uiDir) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      serveStatic(res, candidate);
      return;
    }

    serveStatic(res, uiIndex);
  });

  server.listen(port, () => {
    console.log(`qa-runner demo UI available at http://localhost:${port}/ui`);
  });
};

const config = await loadConfig(cwd);
const outputs = resolveOutputs(cwd, config);

if (command === "generate") {
  const summary = parseFlag("--summary") ?? "";
  const files = parseList("--files");
  const mode = parseFlag("--mode") ?? "all";
  const targetEnv = parseFlag("--env") ?? process.env.QA_RUNNER_ENV ?? "dev";
  const autoTestOverride = parseAutoTestOverride(args);
  const healingOverride = parseHealingOverride(args);
  const runtimeProfile = resolveRuntimeProfile({
    cwd,
    e2eDir: outputs.e2eDir,
    environment: targetEnv,
    config,
    overrides: {
      autoTest: autoTestOverride,
      healingStrategy: healingOverride,
    },
  });
  const ci = args.includes("--ci");
  const timestampOverride = parseFlag("--timestamp");
  const diffOverride = parseFlag("--diff");
  const event: ChangeEvent = {
    files,
    summary,
    diff: diffOverride ?? process.env.QA_RUNNER_DIFF,
    timestamp: timestampOverride ? Number(timestampOverride) : ci ? 0 : Date.now(),
  };

  const daemon = new QaRunnerDaemon({
    outputs,
    skills: config.skills,
  });

  daemon
    .handleEvent(event, {
      mode: mode === "manual" || mode === "e2e" || mode === "all" ? mode : "all",
      environment: targetEnv,
      autoTestEnabled: runtimeProfile.autoTestEnabled,
      healingStrategy: runtimeProfile.healingStrategy,
      healingRetryBudget: runtimeProfile.healingRetryBudget,
      ci,
      timestampOverride: timestampOverride ? Number(timestampOverride) : undefined,
    })
    .then((outcome: Awaited<ReturnType<typeof daemon.handleEvent>>) => {
    console.log(JSON.stringify({ written: outcome.writtenFiles, skipped: outcome.skippedFiles }, null, 2));
  });
} else if (command === "daemon") {
  const subcommand = args[1] ?? "start";
  const port = Number(parseFlag("--port") ?? String(config.server?.port ?? 4545));
  const pidPath = path.join(cwd, ".qa-runner-daemon.pid");

  if (subcommand === "status") {
    if (!fs.existsSync(pidPath)) {
      console.log("qa-runner daemon not running");
      process.exit(1);
    }
    const pid = Number(fs.readFileSync(pidPath, "utf-8"));
    try {
      process.kill(pid, 0);
      console.log(`qa-runner daemon running (pid ${pid})`);
      process.exit(0);
    } catch {
      console.log("qa-runner daemon not running");
      process.exit(1);
    }
  }

  if (subcommand === "stop") {
    if (!fs.existsSync(pidPath)) {
      console.log("qa-runner daemon not running");
      process.exit(1);
    }
    const pid = Number(fs.readFileSync(pidPath, "utf-8"));
    try {
      process.kill(pid);
      fs.unlinkSync(pidPath);
      console.log(`qa-runner daemon stopped (pid ${pid})`);
      process.exit(0);
    } catch {
      console.log("qa-runner daemon not running");
      process.exit(1);
    }
  }

  if (subcommand !== "start") {
    console.log("Usage: qa-runner daemon start|stop|status");
    process.exit(1);
  }

  const daemonConfig = {
    outputs,
    uiReadPaths: config.ui?.readPaths,
    skills: config.skills,
  } as import("./daemon/index.js").DaemonConfig;
  startDaemonServer({
    port,
    daemonConfig,
  });

  startWatcher({
    rootDir: cwd,
    intervalMs: config.watcher?.intervalMs,
    debounceMs: config.watcher?.debounceMs,
    maxFiles: config.watcher?.maxFiles,
    onEvent: (event: ChangeEvent) => {
      const daemon = new QaRunnerDaemon({ outputs, skills: config.skills });
      daemon.handleEvent(event).catch((error: unknown) => {
        console.error("qa-runner watcher failed", error);
      });
    },
  });

  fs.writeFileSync(pidPath, String(process.pid), "utf-8");
  process.on("SIGINT", () => {
    if (fs.existsSync(pidPath)) {
      fs.unlinkSync(pidPath);
    }
    process.exit(0);
  });

  console.log(`qa-runner daemon listening on http://localhost:${port}/ui`);
} else if (command === "ui") {
  const port = Number(parseFlag("--port") ?? String(config.server?.port ?? 4545));
  const daemonConfig = {
    outputs,
    uiReadPaths: config.ui?.readPaths,
    skills: config.skills,
  } as import("./daemon/index.js").DaemonConfig;
  startDaemonServer({
    port,
    daemonConfig,
  });
  console.log(`qa-runner UI available at http://localhost:${port}/ui`);
} else if (command === "demo") {
  const port = Number(parseFlag("--port") ?? "4546");
  startDemoServer(port);
} else if (command === "test") {
  const targetEnv = parseFlag("--env");
  const runtimeEnv = targetEnv ?? process.env.QA_RUNNER_ENV ?? "dev";
  const autoTestOverride = parseAutoTestOverride(args);
  const healingOverride = parseHealingOverride(args);
  const validateManualCases = args.includes("--validate-manual-cases");
  const runtimeProfile = resolveRuntimeProfile({
    cwd,
    e2eDir: outputs.e2eDir,
    environment: runtimeEnv,
    config,
    overrides: {
      autoTest: autoTestOverride,
      healingStrategy: healingOverride,
    },
  });
  const reportHealingStats = args.includes("--report-healing-stats");
  const suggestFixes = args.includes("--suggest-fixes");
  const applySuggestedFixes = args.includes("--apply-suggested-fixes");
  const suggestionsOutputPath = parseFlag("--suggestions-output") ?? path.join(cwd, "tools", "qa-runner.healing-suggestions.json");
  const validateHealingRate = parseRatePercent(parseFlag("--validate-healing-rate"));
  const passthroughArgs = extractTestPassthroughArgs(args.slice(1));
  const hasUiPackage = fs.existsSync(path.join(cwd, "e2e", "ui", "package.json"));
  const commandLine = config.tests?.command ?? (hasUiPackage ? "npm --prefix e2e/ui test" : "");
  if (!commandLine) {
    console.log("qa-runner test: no test command configured and e2e/ui/package.json is missing; skipping runner command.");
    if (reportHealingStats) {
      const healing = readManifestStats(outputs.manifestPath);
      if (healing.healingRatePercent === null) {
        console.log("qa-runner healing stats unavailable (manifest missing or invalid)");
      } else {
        console.log(
          `qa-runner healing stats: rate=${healing.healingRatePercent}% recovered=${healing.recoveredAttempts}/${healing.totalHealingAttempts}`,
        );
      }
    }
    process.exit(0);
  }
  const [cmd, ...cmdArgs] = commandLine.split(" ").filter(Boolean);
  const playwrightJsonDir = path.join(cwd, "tools", ".qa-runner", "playwright");
  const playwrightPrimaryJsonName = "primary.json";
  const isPlaywright = isPlaywrightCommand(commandLine);
  const baseRunnerArgs = isPlaywright
    ? addCommandArgs(cmd, cmdArgs, [...passthroughArgs, "--reporter=list,json"])
    : addCommandArgs(cmd, cmdArgs, passthroughArgs);
  const env = {
    ...process.env,
    QA_RUNNER_ENV: runtimeEnv,
    QA_RUNNER_AUTO_TEST: runtimeProfile.autoTestEnabled ? "1" : "0",
    QA_RUNNER_HEALING_STRATEGY: runtimeProfile.healingStrategy,
    QA_RUNNER_HEALING_RETRY_BUDGET:
      runtimeProfile.healingRetryBudget >= Number.MAX_SAFE_INTEGER
        ? "unlimited"
        : String(runtimeProfile.healingRetryBudget),
    QA_RUNNER_VALIDATE_MANUAL_CASES: validateManualCases ? "1" : "0",
    PLAYWRIGHT_JSON_OUTPUT_DIR: playwrightJsonDir,
    PLAYWRIGHT_JSON_OUTPUT_NAME: playwrightPrimaryJsonName,
  };
  if (validateManualCases) {
    console.log("qa-runner manual case validation mode enabled (QA_RUNNER_VALIDATE_MANUAL_CASES=1)");
  }
  fs.mkdirSync(playwrightJsonDir, { recursive: true });
  const result = spawnSync(cmd, baseRunnerArgs, { stdio: "inherit", env });
  let exitCode = result.status ?? 1;
  const healingAttempts: HealingAttempt[] = [];
  const suggestionFailures: Array<{
    target: string;
    message: string;
    sourceFile?: string;
    sourceLine?: number;
    locatorHint?: string;
  }> = [];

  if (exitCode !== 0 && isPlaywright) {
    const maxHealingRetries = Math.max(
      0,
      Math.min(3, runtimeProfile.healingRetryBudget >= Number.MAX_SAFE_INTEGER ? 3 : runtimeProfile.healingRetryBudget),
    );
    const configRetryBudget = maxHealingRetries === 0 ? 0 : maxHealingRetries;
    let lastSnapshot = readPlaywrightFailureSnapshot(path.join(playwrightJsonDir, playwrightPrimaryJsonName));
    suggestionFailures.push(...lastSnapshot.failures);
    for (let attempt = 0; attempt < maxHealingRetries; attempt += 1) {
      if (lastSnapshot.failedTargets.length === 0) {
        break;
      }
      const retryDecision = decideHealingRetry(attempt, { retryBudget: configRetryBudget });
      if (!retryDecision.shouldRetry) {
        break;
      }
      const retryJsonName = `healing-attempt-${attempt + 1}.json`;
      const retryEnv = {
        ...env,
        PLAYWRIGHT_JSON_OUTPUT_NAME: retryJsonName,
      };
      const retryArgs = addCommandArgs(cmd, cmdArgs, [
        ...passthroughArgs,
        ...lastSnapshot.failedTargets,
        "--workers=1",
        "--retries=0",
        "--reporter=list,json",
      ]);
      const retryResult = spawnSync(cmd, retryArgs, { stdio: "inherit", env: retryEnv });
      const recovered = (retryResult.status ?? 1) === 0;
      healingAttempts.push(
        createHealingAttempt({
          testId: lastSnapshot.failedTargets.join(","),
          recovered,
          strategy: runtimeProfile.healingStrategy,
          category: categorizeHealingFailure(lastSnapshot.firstFailureMessage || "unknown"),
        }),
      );
      if (recovered) {
        exitCode = 0;
        break;
      }
      lastSnapshot = readPlaywrightFailureSnapshot(path.join(playwrightJsonDir, retryJsonName));
      suggestionFailures.push(...lastSnapshot.failures);
    }
  }
  upsertHealingAttempts(outputs.manifestPath, healingAttempts);
  if (suggestFixes && suggestionFailures.length > 0) {
    const uniqueFailures = Array.from(
      new Map(suggestionFailures.map((failure) => [`${failure.target}:${failure.message}`, failure])).values(),
    );
    writeHealingSuggestions(
      suggestionsOutputPath,
      {
        env: runtimeEnv,
        strategy: runtimeProfile.healingStrategy,
        retries: healingAttempts.length,
      },
      uniqueFailures,
    );
    console.log(`qa-runner healing suggestions written to ${suggestionsOutputPath}`);
  }
  if (applySuggestedFixes && suggestionFailures.length > 0) {
    const applied = [
      ...applyTimingFixes(suggestionFailures),
      ...applyButtonRenameFallbackFixes(suggestionFailures),
      ...applyDisabledButtonPrereqFixes(suggestionFailures),
      ...applyAssertionTextFallbackFixes(suggestionFailures),
    ];
    if (applied.length === 0) {
      console.log("qa-runner apply-fixes: no safe automatic patch candidates found.");
    } else {
      for (const patch of applied) {
        console.log(`qa-runner apply-fixes: patched ${patch.filePath}:${patch.line} (${patch.reason})`);
      }
    }
  }

  const healing = readManifestStats(outputs.manifestPath);
  if (reportHealingStats) {
    if (healing.healingRatePercent === null) {
      console.log("qa-runner healing stats unavailable (manifest missing or invalid)");
    } else {
      console.log(
        `qa-runner healing stats: rate=${healing.healingRatePercent}% recovered=${healing.recoveredAttempts}/${healing.totalHealingAttempts}`,
      );
    }
  }

  if (validateHealingRate !== null && healing.healingRatePercent !== null && healing.healingRatePercent > validateHealingRate) {
    console.error(
      `qa-runner healing rate gate failed: ${healing.healingRatePercent}% > threshold ${validateHealingRate}%`,
    );
    console.error("qa-runner remediation:");
    if (healing.unstableFlakyCases > 0) {
      console.error(`  - ${healing.unstableFlakyCases} unstable case(s) detected; inspect /plugin/qa/flakiness dashboard.`);
    }
    if (healing.dominantFlakinessCategory === "selector") {
      console.error("  - Prioritize stable `data-testid` locators and remove brittle CSS/xpath selectors.");
    } else if (healing.dominantFlakinessCategory === "timing") {
      console.error("  - Replace static waits with deterministic waits for visible/attached/network-idle states.");
    } else if (healing.dominantFlakinessCategory === "assertion") {
      console.error("  - Tighten assertions and clarify manual-step wording where confidence is low.");
    }
    console.error("  - Re-run with `qa-runner test --report-healing-stats` after fixes to verify improvement.");
    exitCode = 1;
  }

  process.exit(exitCode);
} else if (command === "report") {
  const kpiMode = args.includes("--kpi");
  if (kpiMode) {
    const outputPath = parseFlag("--output") ?? path.join(cwd, "tools", "qa-runner.kpi-report.json");
    const baselinePath = parseFlag("--baseline-manifest") ?? path.join(cwd, "tools", "qa-runner.manifest.baseline.json");
    const aiValidationRoot = parseFlag("--ai-validation-root") ?? outputs.e2eDir;
    const enforceKpi = args.includes("--enforce-kpi");
    const kpiReport = buildKpiReport({
      currentManifestPath: outputs.manifestPath,
      baselineManifestPath: baselinePath,
      aiValidationRoot,
      healingReductionThreshold: 0.6,
      manualConfidenceThreshold: 0.85,
      criticalSuiteFloor: 0.75,
    });
    fs.writeFileSync(outputPath, JSON.stringify(kpiReport, null, 2), "utf-8");
    console.log(`qa-runner KPI report written to ${outputPath}`);
    console.log(
      `qa-runner kpi self-healing: value=${kpiReport.selfHealingReduction.value} threshold=${kpiReport.selfHealingReduction.threshold} pass=${kpiReport.selfHealingReduction.pass}`,
    );
    console.log(
      `qa-runner kpi guide-confidence: value=${kpiReport.manualGuideConfidence.value} threshold=${kpiReport.manualGuideConfidence.threshold} pass=${kpiReport.manualGuideConfidence.pass}`,
    );
    if (kpiReport.notes.length > 0) {
      for (const note of kpiReport.notes) {
        console.log(`qa-runner kpi note: ${note}`);
      }
    }
    if (enforceKpi && !kpiReport.overallPass) {
      console.error("qa-runner kpi gate failed");
      process.exit(1);
    }
  } else {
    const outputPath = config.report?.outputPath ?? path.join(cwd, "tools", "qa-runner.report.json");
    const payload = {
      generatedAt: new Date().toISOString(),
      manifestPath: outputs.manifestPath,
    };
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf-8");
    console.log(`qa-runner report written to ${outputPath}`);
  }
} else {
  console.log("qa-runner CLI scaffold");
  console.log("Usage:");
  console.log("  qa-runner generate --summary '...' --files file1.ts,file2.ts --mode manual|e2e|all --env dev|stage|prod --auto-test|--no-auto-test --healing=aggressive|moderate|conservative --ci --diff '<git diff>'");
  console.log("  qa-runner daemon start|stop|status --port 4545");
  console.log("  qa-runner ui --port 4545");
  console.log("  qa-runner demo --port 4546");
  console.log("  qa-runner test --env stage|prod --auto-test|--no-auto-test --healing=aggressive|moderate|conservative --validate-manual-cases --report-healing-stats --validate-healing-rate 20%");
  console.log("  qa-runner report");
  console.log("  qa-runner report --kpi --baseline-manifest tools/qa-runner.manifest.baseline.json --enforce-kpi");
}
