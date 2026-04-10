import fs from "node:fs";
import path from "node:path";
import type { QaRunnerCliConfig } from "./config.js";
import type { SelfHealingStrategy } from "./core/index.js";

export type RuntimeProfile = {
  autoTestEnabled: boolean;
  healingStrategy: SelfHealingStrategy;
  healingRetryBudget: number;
};

export type RuntimeOverrides = {
  autoTest?: boolean;
  healingStrategy?: SelfHealingStrategy;
};

type PartialRuntimeProfile = {
  autoTestEnabled?: boolean;
  healingStrategy?: SelfHealingStrategy;
  healingRetryBudget?: number;
};

const strategyRank: Record<SelfHealingStrategy, number> = {
  aggressive: 3,
  moderate: 2,
  conservative: 1,
};

const defaultProfileByEnv: Record<string, RuntimeProfile> = {
  dev: {
    autoTestEnabled: true,
    healingStrategy: "aggressive",
    healingRetryBudget: Number.MAX_SAFE_INTEGER,
  },
  stage: {
    autoTestEnabled: true,
    healingStrategy: "moderate",
    healingRetryBudget: 5,
  },
  prod: {
    autoTestEnabled: false,
    healingStrategy: "conservative",
    healingRetryBudget: 2,
  },
};

const parseBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }
  return undefined;
};

const parseStrategy = (value: unknown): SelfHealingStrategy | undefined => {
  if (value === "aggressive" || value === "moderate" || value === "conservative") {
    return value;
  }
  return undefined;
};

const parseRetryBudget = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "unlimited" || normalized === "infinity" || normalized === "inf") {
      return Number.MAX_SAFE_INTEGER;
    }
    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) {
      return Math.max(0, Math.floor(numeric));
    }
  }
  return undefined;
};

const parseSimpleYaml = (content: string): Record<string, unknown> => {
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; target: Record<string, unknown> }> = [{ indent: -1, target: root }];
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      continue;
    }
    const match = rawLine.match(/^(\s*)([A-Za-z0-9_.-]+):(?:\s*(.*))?$/);
    if (!match) {
      continue;
    }
    const indent = match[1]?.length ?? 0;
    const key = match[2] ?? "";
    const rawValue = match[3] ?? "";

    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1]!.target;

    if (!rawValue) {
      const next: Record<string, unknown> = {};
      parent[key] = next;
      stack.push({ indent, target: next });
      continue;
    }

    let parsed: unknown = rawValue.trim();
    if (parsed === "true" || parsed === "false") {
      parsed = parsed === "true";
    } else if (!Number.isNaN(Number(parsed))) {
      parsed = Number(parsed);
    }
    parent[key] = parsed;
  }

  return root;
};

const readSuiteOverride = (cwd: string): PartialRuntimeProfile => {
  const candidates = [
    path.join(cwd, "test-suite.yml"),
    path.join(cwd, "tools", "test-suite.yml"),
    path.join(cwd, "e2e", "suites", "test-suite.yml"),
  ];
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  if (!existing) {
    return {};
  }
  try {
    const raw = parseSimpleYaml(fs.readFileSync(existing, "utf-8"));
    const suite = (raw.suite as Record<string, unknown> | undefined) ?? raw;
    const healing = suite.healing as Record<string, unknown> | undefined;
    const autoTest = suite.autoTest as Record<string, unknown> | undefined;
    return {
      autoTestEnabled: parseBoolean(autoTest?.enabled),
      healingStrategy: parseStrategy(healing?.strategy),
      healingRetryBudget: parseRetryBudget(healing?.retryBudget),
    };
  } catch {
    return {};
  }
};

const walkFiles = (dir: string, output: string[]): void => {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, output);
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith(".spec.ts") || entry.name.endsWith(".test.ts"))) {
      output.push(full);
    }
  }
};

const mergeStrategyConservative = (
  current: SelfHealingStrategy | undefined,
  next: SelfHealingStrategy | undefined,
): SelfHealingStrategy | undefined => {
  if (!next) {
    return current;
  }
  if (!current) {
    return next;
  }
  return strategyRank[next] < strategyRank[current] ? next : current;
};

const readTestLevelOverride = (e2eDir: string): PartialRuntimeProfile => {
  if (!fs.existsSync(e2eDir)) {
    return {};
  }
  const files: string[] = [];
  walkFiles(e2eDir, files);
  if (files.length === 0) {
    return {};
  }

  let autoTestEnabled: boolean | undefined;
  let healingStrategy: SelfHealingStrategy | undefined;
  let healingRetryBudget: number | undefined;

  for (const filePath of files.slice(0, 300)) {
    const content = fs.readFileSync(filePath, "utf-8");
    const autoMatches = content.matchAll(/@qa-auto-test\s+(on|off|true|false|1|0)/gi);
    for (const match of autoMatches) {
      const parsed = parseBoolean(match[1]);
      if (parsed === false) {
        autoTestEnabled = false;
      } else if (parsed === true && autoTestEnabled === undefined) {
        autoTestEnabled = true;
      }
    }

    const strategyMatches = content.matchAll(/@qa-healing\s+(aggressive|moderate|conservative)/gi);
    for (const match of strategyMatches) {
      healingStrategy = mergeStrategyConservative(healingStrategy, parseStrategy(match[1]));
    }

    const retryMatches = content.matchAll(/@qa-retry-budget\s+([a-z0-9_-]+)/gi);
    for (const match of retryMatches) {
      const parsed = parseRetryBudget(match[1]);
      if (parsed === undefined) continue;
      if (healingRetryBudget === undefined) {
        healingRetryBudget = parsed;
      } else {
        healingRetryBudget = Math.min(healingRetryBudget, parsed);
      }
    }
  }

  return {
    autoTestEnabled,
    healingStrategy,
    healingRetryBudget,
  };
};

const readGlobalEnvProfile = (config: QaRunnerCliConfig, environment: string): PartialRuntimeProfile => {
  const envConfig = config.environments?.[environment];
  if (!envConfig) {
    return {};
  }
  return {
    autoTestEnabled: parseBoolean(envConfig.autoTest?.enabled),
    healingStrategy: parseStrategy(envConfig.healing?.strategy),
    healingRetryBudget: parseRetryBudget(envConfig.healing?.retryBudget),
  };
};

const applyPartial = (base: RuntimeProfile, partial: PartialRuntimeProfile): RuntimeProfile => ({
  autoTestEnabled: partial.autoTestEnabled ?? base.autoTestEnabled,
  healingStrategy: partial.healingStrategy ?? base.healingStrategy,
  healingRetryBudget: partial.healingRetryBudget ?? base.healingRetryBudget,
});

export const parseAutoTestOverride = (args: string[]): boolean | undefined => {
  const hasAuto = args.includes("--auto-test");
  const hasNoAuto = args.includes("--no-auto-test");
  if (hasAuto && hasNoAuto) {
    return false;
  }
  if (hasAuto) return true;
  if (hasNoAuto) return false;
  return undefined;
};

export const parseHealingOverride = (args: string[]): SelfHealingStrategy | undefined => {
  const inline = args.find((item) => item.startsWith("--healing="));
  if (inline) {
    return parseStrategy(inline.split("=")[1]);
  }
  const index = args.indexOf("--healing");
  if (index === -1) {
    return undefined;
  }
  return parseStrategy(args[index + 1]);
};

export const resolveRuntimeProfile = (input: {
  cwd: string;
  e2eDir: string;
  environment: string;
  config: QaRunnerCliConfig;
  overrides?: RuntimeOverrides;
}): RuntimeProfile => {
  const base = defaultProfileByEnv[input.environment] ?? defaultProfileByEnv.dev;
  let resolved = { ...base };
  resolved = applyPartial(resolved, readGlobalEnvProfile(input.config, input.environment));
  resolved = applyPartial(resolved, readSuiteOverride(input.cwd));
  resolved = applyPartial(resolved, readTestLevelOverride(input.e2eDir));
  resolved = applyPartial(resolved, {
    autoTestEnabled: input.overrides?.autoTest,
    healingStrategy: input.overrides?.healingStrategy,
  });
  return resolved;
};

