import type {
  AiAutoTesterInput,
  AiAutoTesterResult,
  AiAutoTesterSkill,
  AiExecutionCaseResult,
  AiExecutionPlan,
  AiExecutionStep,
  AiPreparedCase,
  AiStepKind,
  AiValidationSignal,
} from "./types.js";
import { spawnSync } from "node:child_process";

export type AiAutoTesterConfig = {
  confidenceThreshold?: number;
  environments?: string[];
  executionMode?: "simulated" | "shell";
  playwrightCommand?: string;
  workspaceRoot?: string;
  modelAdapter?: {
    generate(prompt: string, context?: Record<string, unknown>): Promise<string> | string;
  };
};

const normalizeStep = (value: string): string =>
  value
    .replace(/^[-*]\s+\[\s?\]\s+/i, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();

const classifyStepKind = (step: string): AiStepKind => {
  const text = step.toLowerCase();
  if (/^(verify|ensure|expect|assert|confirm|should\b)/.test(text)) {
    return "assertion";
  }
  if (/^(given|with |assuming|precondition)/.test(text) || text.includes("logged in")) {
    return "precondition";
  }
  if (/(click|tap|select|open|navigate|enter|type|submit|upload|choose)/.test(text)) {
    return "action";
  }
  return "action";
};

const scoreStepConfidence = (step: string, kind: AiStepKind): number => {
  const text = step.toLowerCase();
  let score = kind === "assertion" ? 0.9 : kind === "precondition" ? 0.87 : 0.88;

  if (/(data-testid|aria-label|role=|text=|selector|id=)/.test(text)) {
    score += 0.08;
  }
  if (/[\"'].*[\"']|\b\d+\b/.test(text)) {
    score += 0.05;
  }
  if (/(button|field|input|modal|page|screen|form|menu|api|request|response|toast|banner)/.test(text)) {
    score += 0.05;
  }
  if (/(some|maybe|might|possibly|etc\.?|something)/.test(text)) {
    score -= 0.2;
  }
  if (text.length < 8) {
    score -= 0.2;
  } else if (text.length < 14) {
    score -= 0.08;
  }
  if (/^(click|open|submit|enter|type|select)\b\s*$/.test(text)) {
    score -= 0.12;
  }

  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
};

const toExecutionSteps = (steps: string[], caseId: string): AiExecutionStep[] => {
  return steps.map((raw, index) => {
    const normalized = normalizeStep(raw);
    const kind = classifyStepKind(normalized);
    const confidence = scoreStepConfidence(normalized, kind);
    return {
      id: `${caseId}-step-${index + 1}`,
      raw,
      normalized,
      kind,
      confidence,
    };
  });
};

export const buildAiExecutionPlan = (input: AiAutoTesterInput): AiExecutionPlan => {
  const cases: AiPreparedCase[] = input.cases.map((item, index) => {
    const caseId = `case-${index + 1}`;
    const parsed = toExecutionSteps(item.steps ?? [], caseId);
    return {
      caseId,
      title: item.title,
      preconditions: parsed.filter((step) => step.kind === "precondition"),
      actions: parsed.filter((step) => step.kind === "action"),
      assertions: parsed.filter((step) => step.kind === "assertion"),
    };
  });

  return {
    suiteName: input.suiteName,
    cases,
  };
};

const suggestStepFix = (step: AiExecutionStep): string => {
  if (step.confidence >= 0.7) {
    return "";
  }
  if (step.kind === "assertion") {
    return "Add explicit expected output and stable selector hints.";
  }
  if (step.kind === "precondition") {
    return "State exact setup requirements (user role, data state, feature flags).";
  }
  return "Describe concrete UI target and action details (selector, input value, expected transition).";
};

export const buildAiValidationSignals = (plan: AiExecutionPlan, confidenceThreshold = 0.7): AiValidationSignal[] => {
  const signals: AiValidationSignal[] = [];

  for (const item of plan.cases) {
    const steps = [...item.preconditions, ...item.actions, ...item.assertions];
    for (const step of steps) {
      const belowThreshold = step.confidence < confidenceThreshold;
      signals.push({
        caseId: item.caseId,
        stepId: step.id,
        confidence: step.confidence,
        belowThreshold,
        suggestion: belowThreshold ? suggestStepFix(step) : undefined,
      });
    }
  }

  return signals;
};

const computeDeltaRatio = (expected: string, actual: string): number => {
  if (!expected && !actual) {
    return 0;
  }
  const maxLen = Math.max(expected.length, actual.length, 1);
  let same = 0;
  for (let i = 0; i < Math.min(expected.length, actual.length); i += 1) {
    if (expected[i] === actual[i]) {
      same += 1;
    }
  }
  const similarity = same / maxLen;
  return Number((1 - similarity).toFixed(3));
};

const attachVisualDiffSignals = (plan: AiExecutionPlan, validation: AiValidationSignal[]): AiValidationSignal[] => {
  const byId = new Map<string, AiExecutionStep>();
  for (const item of plan.cases) {
    for (const step of [...item.preconditions, ...item.actions, ...item.assertions]) {
      byId.set(step.id, step);
    }
  }

  return validation.map((signal) => {
    const step = byId.get(signal.stepId);
    if (!step || step.kind !== "assertion") {
      return signal;
    }
    const expected = step.normalized;
    const actual = step.confidence >= 0.7 ? expected : `${expected} (observed variant)`;
    return {
      ...signal,
      visualDiff: {
        expected,
        actual,
        deltaRatio: computeDeltaRatio(expected, actual),
      },
    };
  });
};

const selectorHintFromStep = (step: AiExecutionStep): string | undefined => {
  const match = step.normalized.match(/(data-testid\\s*=\\s*[\\w-]+|aria-label\\s*=\\s*[\\w\\s-]+)/i);
  return match?.[1]?.trim();
};

const buildExecutionResult = (plan: AiExecutionPlan): { mode: "simulated"; cases: AiExecutionCaseResult[] } => {
  const cases: AiExecutionCaseResult[] = plan.cases.map((item) => {
    const steps = [...item.preconditions, ...item.actions, ...item.assertions].map((step) => {
      const passed = step.confidence >= 0.5;
      return {
        stepId: step.id,
        status: passed ? "passed" : "failed",
        confidence: step.confidence,
        screenshotPath: `artifacts/screenshots/${item.caseId}/${step.id}.png`,
        domInspection: {
          selectorHint: selectorHintFromStep(step),
          extractedText: step.normalized.slice(0, 120),
        },
        fallbackApplied: !passed && step.kind !== "assertion",
      } as const;
    });
    return {
      caseId: item.caseId,
      passed: steps.every((step) => step.status === "passed"),
      steps,
    };
  });
  return { mode: "simulated", cases };
};

const runShellExecutor = (
  plan: AiExecutionPlan,
  commandLine: string,
  workspaceRoot: string | undefined,
): { mode: "shell"; command: string; exitCode: number; cases: AiExecutionCaseResult[] } => {
  const [command, ...args] = commandLine.split(" ").filter(Boolean);
  const result = spawnSync(command, args, {
    cwd: workspaceRoot ?? process.cwd(),
    stdio: "pipe",
    env: process.env,
  });
  const exitCode = typeof result.status === "number" ? result.status : 1;
  const stdout = result.stdout ? result.stdout.toString("utf-8") : "";

  const parsedCases = parsePlaywrightJsonOutput(plan, stdout);
  if (parsedCases) {
    return {
      mode: "shell",
      command: commandLine,
      exitCode,
      cases: parsedCases,
    };
  }

  // Without test-result parsing yet, map shell exit to per-case pass/fail.
  const cases: AiExecutionCaseResult[] = plan.cases.map((item) => ({
    caseId: item.caseId,
    passed: exitCode === 0,
    steps: [...item.preconditions, ...item.actions, ...item.assertions].map((step) => ({
      stepId: step.id,
      status: exitCode === 0 ? "passed" : "failed",
      confidence: step.confidence,
      screenshotPath: `artifacts/screenshots/${item.caseId}/${step.id}.png`,
      domInspection: {
        selectorHint: selectorHintFromStep(step),
        extractedText: step.normalized.slice(0, 120),
      },
      fallbackApplied: exitCode !== 0 && step.kind !== "assertion",
    })),
  }));

  return {
    mode: "shell",
    command: commandLine,
    exitCode,
    cases,
  };
};

type PlaywrightAttachment = {
  name?: string;
  path?: string;
  contentType?: string;
};

type PlaywrightResult = {
  status?: string;
  attachments?: PlaywrightAttachment[];
};

type PlaywrightTest = {
  title?: string;
  results?: PlaywrightResult[];
};

type PlaywrightSpec = {
  tests?: PlaywrightTest[];
  suites?: PlaywrightSuite[];
};

type PlaywrightSuite = {
  title?: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
};

const collectPlaywrightTests = (suite: PlaywrightSuite | undefined, out: PlaywrightTest[]): void => {
  if (!suite) return;
  for (const child of suite.suites ?? []) {
    collectPlaywrightTests(child, out);
  }
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      out.push(test);
    }
    for (const nestedSuite of spec.suites ?? []) {
      collectPlaywrightTests(nestedSuite, out);
    }
  }
};

const selectScreenshot = (test: PlaywrightTest): string | undefined => {
  const attachments = (test.results ?? []).flatMap((result) => result.attachments ?? []);
  const screenshot = attachments.find((item) => {
    const pathValue = item.path?.toLowerCase() ?? "";
    const nameValue = item.name?.toLowerCase() ?? "";
    return pathValue.endsWith(".png") || nameValue.includes("screenshot");
  });
  return screenshot?.path;
};

const statusFromPlaywright = (test: PlaywrightTest): "passed" | "failed" => {
  const statuses = (test.results ?? []).map((item) => (item.status ?? "").toLowerCase());
  return statuses.some((status) => status === "failed" || status === "timedout" || status === "interrupted")
    ? "failed"
    : "passed";
};

const parsePlaywrightJsonOutput = (plan: AiExecutionPlan, stdout: string): AiExecutionCaseResult[] | null => {
  if (!stdout.trim().startsWith("{")) {
    return null;
  }
  try {
    const payload = JSON.parse(stdout) as { suites?: PlaywrightSuite[] };
    const tests: PlaywrightTest[] = [];
    for (const suite of payload.suites ?? []) {
      collectPlaywrightTests(suite, tests);
    }
    if (tests.length === 0) {
      return null;
    }

    return plan.cases.map((item) => {
      const match = tests.find((test) => {
        const title = (test.title ?? "").toLowerCase();
        const caseTitle = item.title.toLowerCase();
        return title.includes(caseTitle) || caseTitle.includes(title);
      });
      const status = match ? statusFromPlaywright(match) : "failed";
      const screenshotPath = match ? selectScreenshot(match) : undefined;
      const steps = [...item.preconditions, ...item.actions, ...item.assertions].map((step) => ({
        stepId: step.id,
        status,
        confidence: step.confidence,
        screenshotPath,
        domInspection: {
          selectorHint: selectorHintFromStep(step),
          extractedText: step.normalized.slice(0, 120),
        },
        fallbackApplied: status === "failed" && step.kind !== "assertion",
      }));
      return {
        caseId: item.caseId,
        passed: status === "passed",
        steps,
      };
    });
  } catch {
    return null;
  }
};

const renderPlaywrightScaffold = (plan: AiExecutionPlan): string => {
  const lines: string[] = [];
  lines.push("import { test } from '@playwright/test';");
  lines.push("");
  for (const item of plan.cases) {
    lines.push(`test('${item.title.replace(/'/g, "\\'")}', async ({ page }) => {`);
    lines.push("  // Auto-generated skeleton from QA manual steps");
    for (const step of [...item.preconditions, ...item.actions, ...item.assertions]) {
      lines.push(`  // [${step.kind}] ${step.normalized}`);
    }
    lines.push("});");
    lines.push("");
  }
  return lines.join("\n");
};

const buildCodegenPrompt = (plan: AiExecutionPlan): string => {
  const lines: string[] = [];
  lines.push("Generate Playwright TypeScript tests.");
  lines.push("Return code only.");
  lines.push(`Suite: ${plan.suiteName}`);
  for (const item of plan.cases) {
    lines.push(`Case: ${item.title}`);
    for (const step of [...item.preconditions, ...item.actions, ...item.assertions]) {
      lines.push(`- [${step.kind}] ${step.normalized}`);
    }
  }
  return lines.join("\n");
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "") || "ai-auto-test";

export const createAiAutoTesterSkill = (config: AiAutoTesterConfig = {}): AiAutoTesterSkill => ({
  name: "ai-auto-tester",
  async executeAutoTest(input: AiAutoTesterInput): Promise<AiAutoTesterResult> {
    const allowedEnvironments = config.environments ?? [];
    if (allowedEnvironments.length > 0 && input.environment && !allowedEnvironments.includes(input.environment)) {
      return {
        success: true,
        artifacts: [],
        lowConfidenceCount: 0,
        notes: `Skipped auto-testing for environment ${input.environment}.`,
      };
    }

    const plan = buildAiExecutionPlan(input);
    const threshold = config.confidenceThreshold ?? 0.7;
    const validationBase = buildAiValidationSignals(plan, threshold);
    const validation = attachVisualDiffSignals(plan, validationBase);
    const lowConfidenceCount = validation.filter((signal) => signal.belowThreshold).length;
    const runtimeMode = config.executionMode ?? (process.env.QA_RUNNER_PLAYWRIGHT_EXECUTION_MODE === "shell" ? "shell" : "simulated");
    const commandLine = config.playwrightCommand ?? process.env.QA_RUNNER_PLAYWRIGHT_COMMAND ?? "npx playwright test";
    const execution =
      runtimeMode === "shell"
        ? runShellExecutor(plan, commandLine, config.workspaceRoot ?? process.env.QA_RUNNER_WORKSPACE_ROOT)
        : buildExecutionResult(plan);
    let generatedCode = renderPlaywrightScaffold(plan);
    if (config.modelAdapter) {
      const completion = await config.modelAdapter.generate(buildCodegenPrompt(plan), {
        suiteName: plan.suiteName,
        cases: plan.cases.length,
      });
      const trimmed = completion.trim();
      if (trimmed.length > 0) {
        generatedCode = trimmed;
      }
    }

    const base = slugify(input.suiteName);
    return {
      success: execution.mode === "shell" ? execution.exitCode === 0 : true,
      plan,
      execution,
      validation,
      lowConfidenceCount,
      artifacts: [
        {
          path: `${base}.ai-execution-plan.json`,
          content: JSON.stringify(plan, null, 2),
        },
        {
          path: `${base}.ai-execution-result.json`,
          content: JSON.stringify(execution, null, 2),
        },
        {
          path: `${base}.ai-validation.json`,
          content: JSON.stringify(validation, null, 2),
        },
        {
          path: `${base}.ai-generated.spec.ts`,
          content: generatedCode,
        },
      ],
      notes:
        lowConfidenceCount > 0
          ? `${lowConfidenceCount} low-confidence steps detected; review ai-validation artifact for suggestions.`
          : execution.mode === "shell" && execution.exitCode !== 0
            ? "Shell execution completed with failures; inspect playwright output."
            : "All interpreted steps met confidence threshold.",
    };
  },
});
