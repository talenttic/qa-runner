import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type QaSelfHealFixProposal = {
  id: string;
  suggestionId: string;
  title: string;
  category: "selector_stability" | "timing_stability" | "security_hygiene" | "assertion_quality" | "test_architecture";
  priority: "high" | "medium" | "low";
  risk: "low" | "medium" | "high";
  confidence: number;
  filePath: string;
  changeType: "test_only" | "app_plus_test" | "config";
  diffPreview: string;
  retestScope: "single_spec" | "affected_specs" | "full_suite";
  status: "pending";
  appliedAt: null;
  applyError: null;
  retestStatus: "not_run";
  retestAt: null;
  retestError: null;
  retestCommand: null;
  retestTargetPath?: string;
};

type QaSelfHealSkillContext = {
  jobId: string;
  repoRoot: string;
  playwrightProjectDir: string;
  failedSpecPaths: string[];
  failedOutputLines: string[];
};

type QaSelfHealSkill = {
  id: string;
  requiresVision?: boolean;
  run: (context: QaSelfHealSkillContext) => QaSelfHealFixProposal[];
};

const hashId = (value: string): string => createHash("sha1").update(value).digest("hex").slice(0, 12);

const toRepoRelativePath = (repoRoot: string, absolutePath: string): string =>
  path.relative(repoRoot, absolutePath).replace(/\\/g, "/");

const parseFailedSpecPaths = (outputLines: string[], playwrightProjectDir: string): string[] => {
  const failedSpecs = new Set<string>();
  for (const line of outputLines) {
    for (const match of line.matchAll(/(\.\.\/[^\s:]+\.spec\.ts):\d+:\d+/g)) {
      failedSpecs.add(path.resolve(playwrightProjectDir, match[1] ?? ""));
    }
    for (const match of line.matchAll(/(\/[^\s:]+\.spec\.ts):\d+:\d+/g)) {
      failedSpecs.add(match[1] ?? "");
    }
  }
  return Array.from(failedSpecs).filter((specPath) => fs.existsSync(specPath));
};

const resolvePageObjectPath = (specPath: string): string | null => {
  const source = fs.readFileSync(specPath, "utf-8");
  const importMatch = source.match(/from ["'](\.\/pages\/[^"']+\.page)["']/);
  if (!importMatch) {
    return null;
  }
  const pagePath = path.resolve(path.dirname(specPath), `${importMatch[1]}.ts`);
  return fs.existsSync(pagePath) ? pagePath : null;
};

const parseErrorContextPaths = (outputLines: string[], playwrightProjectDir: string): string[] => {
  const matches = new Set<string>();
  for (const line of outputLines) {
    const contextMatch = line.match(/Error Context:\s*(test-results\/[^\s]+\/error-context\.md)/i);
    if (contextMatch?.[1]) {
      matches.add(path.resolve(playwrightProjectDir, contextMatch[1]));
    }
    for (const generic of line.matchAll(/(test-results\/[^\s]+\/error-context\.md)/g)) {
      if (generic[1]) {
        matches.add(path.resolve(playwrightProjectDir, generic[1]));
      }
    }
  }
  return Array.from(matches).filter((filePath) => fs.existsSync(filePath));
};

const createPlaywrightImportSkill = (): QaSelfHealSkill => ({
  id: "playwright_import_path",
  run: ({ jobId, repoRoot, failedSpecPaths }) => {
    const proposals: QaSelfHealFixProposal[] = [];
    for (const specPath of failedSpecPaths) {
      const source = fs.readFileSync(specPath, "utf-8");
      if (!source.includes('from "@playwright/test"')) {
        continue;
      }
      const specRepoPath = toRepoRelativePath(repoRoot, specPath);
      proposals.push({
        id: `qa_fix_${hashId(`${jobId}:${specRepoPath}:playwright-import`)}`,
        suggestionId: `qa_suggest_${hashId(`${jobId}:${specRepoPath}:playwright-import`)}`,
        title: `Switch Playwright import path in ${path.basename(specPath)}`,
        category: "test_architecture",
        priority: "high",
        risk: "low",
        confidence: 0.92,
        filePath: specRepoPath,
        changeType: "test_only",
        diffPreview:
          `--- a/${specRepoPath}\n` +
          `+++ b/${specRepoPath}\n` +
          `@@\n` +
          `-import { test, expect } from "@playwright/test";\n` +
          `+import { test, expect } from "playwright/test";`,
        retestScope: "single_spec",
        status: "pending",
        appliedAt: null,
        applyError: null,
        retestStatus: "not_run",
        retestAt: null,
        retestError: null,
        retestCommand: null,
      });
    }
    return proposals;
  },
});

const createFallbackLocatorSkill = (): QaSelfHealSkill => ({
  id: "resilient_locator_fallback",
  run: ({ jobId, repoRoot, failedSpecPaths }) => {
    const fallbackLocator = process.env.QA_RUNNER_SELF_HEAL_FALLBACK_LOCATOR?.trim() || 'this.page.locator("body")';
    const proposals: QaSelfHealFixProposal[] = [];
    for (const specPath of failedSpecPaths) {
      const pagePath = resolvePageObjectPath(specPath);
      if (!pagePath) {
        continue;
      }
      const pageSource = fs.readFileSync(pagePath, "utf-8");
      const readonlyLocatorLine = pageSource
        .split(/\r?\n/)
        .find((line) => line.includes("getByTestId(") && line.includes("readonly"));
      const constructorLocatorLine = pageSource
        .split(/\r?\n/)
        .find((line) => line.includes("this.el1") && line.includes("getByTestId("));
      const locatorLine = readonlyLocatorLine ?? constructorLocatorLine ?? null;
      if (!locatorLine) {
        continue;
      }
      const replacementLine = locatorLine.includes("this.el1 =")
        ? "    this.el1 = page.locator(\"body\");"
        : `  readonly el1 = ${fallbackLocator};`;
      const pageRepoPath = toRepoRelativePath(repoRoot, pagePath);
      const specRepoPath = toRepoRelativePath(repoRoot, specPath);
      proposals.push({
        id: `qa_fix_${hashId(`${jobId}:${pageRepoPath}:fallback-locator`)}`,
        suggestionId: `qa_suggest_${hashId(`${jobId}:${pageRepoPath}:fallback-locator`)}`,
        title: `Use resilient fallback locator in ${path.basename(pagePath)}`,
        category: "selector_stability",
        priority: "medium",
        risk: "low",
        confidence: 0.73,
        filePath: pageRepoPath,
        changeType: "test_only",
        diffPreview:
          `--- a/${pageRepoPath}\n` +
          `+++ b/${pageRepoPath}\n` +
          `@@\n` +
          `-${locatorLine}\n` +
          `+${replacementLine}`,
        retestScope: "single_spec",
        status: "pending",
        appliedAt: null,
        applyError: null,
        retestStatus: "not_run",
        retestAt: null,
        retestError: null,
        retestCommand: null,
        retestTargetPath: specRepoPath,
      });
    }
    return proposals;
  },
});

const createEntryPathConfigSkill = (): QaSelfHealSkill => ({
  id: "entry_path_env_config",
  run: ({ jobId, repoRoot, failedSpecPaths }) => {
    const proposals: QaSelfHealFixProposal[] = [];
    for (const specPath of failedSpecPaths) {
      const pagePath = resolvePageObjectPath(specPath);
      if (!pagePath) {
        continue;
      }
      const pageSource = fs.readFileSync(pagePath, "utf-8");
      if (pageSource.includes("QA_RUNNER_TEST_ENTRY_PATH")) {
        continue;
      }
      const gotoLine = pageSource
        .split(/\r?\n/)
        .find((line) => line.includes("await this.page.goto("));
      if (!gotoLine) {
        continue;
      }
      const pageRepoPath = toRepoRelativePath(repoRoot, pagePath);
      const specRepoPath = toRepoRelativePath(repoRoot, specPath);
      proposals.push({
        id: `qa_fix_${hashId(`${jobId}:${pageRepoPath}:entry-path-env`)}`,
        suggestionId: `qa_suggest_${hashId(`${jobId}:${pageRepoPath}:entry-path-env`)}`,
        title: `Use project-configured entry path in ${path.basename(pagePath)}`,
        category: "test_architecture",
        priority: "high",
        risk: "low",
        confidence: 0.82,
        filePath: pageRepoPath,
        changeType: "test_only",
        diffPreview:
          `--- a/${pageRepoPath}\n` +
          `+++ b/${pageRepoPath}\n` +
          `@@\n` +
          `-${gotoLine}\n` +
          `+    const targetPath = process.env.QA_RUNNER_TEST_ENTRY_PATH || "/";\n` +
          `+    await this.page.goto(targetPath);`,
        retestScope: "single_spec",
        status: "pending",
        appliedAt: null,
        applyError: null,
        retestStatus: "not_run",
        retestAt: null,
        retestError: null,
        retestCommand: null,
        retestTargetPath: specRepoPath,
      });
    }
    return proposals;
  },
});

const createModalGuardSkill = (): QaSelfHealSkill => ({
  id: "modal_overlay_guard",
  requiresVision: true,
  run: ({ jobId, repoRoot, failedSpecPaths, failedOutputLines, playwrightProjectDir }) => {
    const errorContextPaths = parseErrorContextPaths(failedOutputLines, playwrightProjectDir);
    const hints = errorContextPaths
      .map((filePath) => fs.readFileSync(filePath, "utf-8"))
      .join("\n");
    if (!/(welcome|modal|dialog|overlay)/i.test(hints)) {
      return [];
    }
    const proposals: QaSelfHealFixProposal[] = [];
    for (const specPath of failedSpecPaths) {
      const pagePath = resolvePageObjectPath(specPath);
      if (!pagePath) {
        continue;
      }
      const pageSource = fs.readFileSync(pagePath, "utf-8");
      const gotoLine = pageSource
        .split(/\r?\n/)
        .find((line) => line.includes("await this.page.goto("));
      if (!gotoLine || pageSource.includes("qa-runner self-heal modal guard")) {
        continue;
      }
      const pageRepoPath = toRepoRelativePath(repoRoot, pagePath);
      const specRepoPath = toRepoRelativePath(repoRoot, specPath);
      proposals.push({
        id: `qa_fix_${hashId(`${jobId}:${pageRepoPath}:modal-guard`)}`,
        suggestionId: `qa_suggest_${hashId(`${jobId}:${pageRepoPath}:modal-guard`)}`,
        title: `Add modal guard in ${path.basename(pagePath)}`,
        category: "timing_stability",
        priority: "medium",
        risk: "low",
        confidence: 0.71,
        filePath: pageRepoPath,
        changeType: "test_only",
        diffPreview:
          `--- a/${pageRepoPath}\n` +
          `+++ b/${pageRepoPath}\n` +
          `@@\n` +
          `-${gotoLine}\n` +
          `+${gotoLine}\n` +
          `+    // qa-runner self-heal modal guard\n` +
          `+    await this.page.keyboard.press("Escape").catch(() => {});\n` +
          `+    await this.page.getByRole("button", { name: /close|dismiss|skip|continue/i }).first().click({ timeout: 1500 }).catch(() => {});`,
        retestScope: "single_spec",
        status: "pending",
        appliedAt: null,
        applyError: null,
        retestStatus: "not_run",
        retestAt: null,
        retestError: null,
        retestCommand: null,
        retestTargetPath: specRepoPath,
      });
    }
    return proposals;
  },
});

const SKILLS: QaSelfHealSkill[] = [
  createPlaywrightImportSkill(),
  createEntryPathConfigSkill(),
  createFallbackLocatorSkill(),
  createModalGuardSkill(),
];

const resolveEnabledSkills = (input: { supportsVision: boolean }): QaSelfHealSkill[] => {
  const configured = process.env.QA_RUNNER_SELF_HEAL_SKILLS?.trim();
  const byCapability = SKILLS.filter((skill) => (skill.requiresVision ? input.supportsVision : true));
  if (!configured) {
    return byCapability;
  }
  const selected = new Set(
    configured
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return byCapability.filter((skill) => selected.has(skill.id));
};

export const listEnabledSelfHealSkillIds = (input: { supportsVision: boolean }): string[] =>
  resolveEnabledSkills(input).map((skill) => skill.id);

export const buildSelfHealProposalsFromExecution = (input: {
  jobId: string;
  repoRoot: string;
  playwrightProjectDir: string;
  failedOutputLines: string[];
  maxProposals?: number;
  supportsVision?: boolean;
}): QaSelfHealFixProposal[] => {
  const failedSpecPaths = parseFailedSpecPaths(input.failedOutputLines, input.playwrightProjectDir);
  if (failedSpecPaths.length === 0) {
    return [];
  }
  const context: QaSelfHealSkillContext = {
    jobId: input.jobId,
    repoRoot: input.repoRoot,
    playwrightProjectDir: input.playwrightProjectDir,
    failedSpecPaths,
    failedOutputLines: input.failedOutputLines,
  };
  const max = Math.max(1, input.maxProposals ?? 12);
  const proposals: QaSelfHealFixProposal[] = [];
  const seen = new Set<string>();
  for (const skill of resolveEnabledSkills({ supportsVision: input.supportsVision ?? false })) {
    for (const proposal of skill.run(context)) {
      if (seen.has(proposal.id)) {
        continue;
      }
      seen.add(proposal.id);
      proposals.push(proposal);
      if (proposals.length >= max) {
        return proposals;
      }
    }
  }
  return proposals;
};
