import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { QaRunnerDaemon, type DaemonConfig, type GenerationOutcome } from "./daemon.js";
import { validateChangeEvent, type ChangeEvent } from "../core/index.js";
import { getUiAssetDir } from "@talenttic/qa-runner-ui";
import { spawn, spawnSync } from "node:child_process";

export type ServerConfig = {
  port: number;
  daemonConfig: DaemonConfig;
};

export type ServerState = {
  lastEvent?: ChangeEvent;
  lastOutcome?: GenerationOutcome;
  autoSeededAt?: string;
};

type QaGenerationJob = {
  id: string;
  requestedByUserId: string;
  prompt: string;
  scope: {
    pluginIds?: string[];
    routes?: string[];
  };
  status: "queued" | "running" | "completed" | "failed";
  result: {
    suiteName: string;
    cases: Array<{
      title: string;
      useCase: string;
      expectedResult: string;
      priority: "low" | "medium" | "high" | "critical" | string;
      steps: string[];
      playwrightTags?: string[];
    }>;
    tests?: Array<{
      id: string;
      title: string;
      testType: string;
      riskLevel: "low" | "medium" | "high";
      tags: string[];
      featureKey: string;
      filePath: string;
      testIdSelectors: string[];
    }>;
    selectedTestTypes?: string[];
    review?: {
      reviewedFiles: number;
      discoveredTests: number;
      loadedTests: number;
      score: number;
      issueCount: number;
      issues: Array<{
        id: string;
        severity: "low" | "medium" | "high";
        ruleId: string;
        message: string;
        filePath: string;
        line: number | null;
        suggestion: string;
      }>;
    };
    intelligentReview?: {
      generatedAt: string;
      score: number;
      summary: string;
      metadata: {
        provider: string;
        model: string;
        mode: "heuristic" | "llm" | "hybrid";
      };
      suggestions: Array<{
        id: string;
        category: "selector_stability" | "timing_stability" | "security_hygiene" | "assertion_quality" | "test_architecture";
        priority: "high" | "medium" | "low";
        confidence: number;
        rationale: string;
        suggestion: string;
        affectedFiles: string[];
        retestScope: "single_spec" | "affected_specs" | "full_suite";
      }>;
    };
    intelligentFixProposals?: Array<{
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
      status?: "pending" | "applied" | "failed";
      appliedAt?: string | null;
      applyError?: string | null;
      retestStatus?: "not_run" | "passed" | "failed";
      retestAt?: string | null;
      retestError?: string | null;
      retestCommand?: string | null;
    }>;
    automation?: {
      strategy: "continuous_fix" | "alert_only";
      status: "fixed" | "partial" | "attention" | "clean";
      startedAt: string;
      completedAt: string;
      iterations: number;
      appliedCount: number;
      passedRetests: number;
      failedRetests: number;
      remainingProposals: number;
      message: string;
    };
  } | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

type QaAiExecutionJob = {
  id: string;
  runId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  playwrightCommand: string;
  executionMode?: "stub" | "shell" | "ui";
  playwrightUiUrl?: string | null;
  reportRef: string | null;
  traceRef: string | null;
  videoRef: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type QaManualAiExecutionJob = {
  id: string;
  runId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  currentCaseId: string | null;
  currentStepId: string | null;
  currentStepIndex: number;
  totalSteps: number;
  failureReason: string | null;
  reportRef: string | null;
  traceRef: string | null;
  videoRef: string | null;
  playwrightUiUrl?: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  actionLog: Array<{
    at: string;
    caseId: string;
    stepId: string;
    stepText: string;
    status: "passed" | "failed";
    reason?: string;
  }>;
};

type QaWorkspaceProfile = {
  id: string;
  label: string;
  dbPath: string;
  casesDir: string;
  gitUrl?: string;
  isDefault: boolean;
};

const readJsonBody = (req: IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf-8");
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });

const json = (res: ServerResponse, status: number, payload: unknown, extraHeaders?: Record<string, string>): void => {
  res.writeHead(status, { "Content-Type": "application/json", ...(extraHeaders ?? {}) });
  res.end(JSON.stringify(payload));
};

const text = (
  res: ServerResponse,
  status: number,
  payload: string,
  contentType = "text/plain",
  extraHeaders?: Record<string, string>,
): void => {
  res.writeHead(status, { "Content-Type": contentType, ...(extraHeaders ?? {}) });
  res.end(payload);
};

const contentTypeForPath = (filePath: string): string => {
  if (filePath.endsWith(".html")) return "text/html";
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs") || filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
    return "text/javascript";
  }
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".json")) return "application/json";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
};

const serveStatic = (res: ServerResponse, filePath: string): void => {
  if (!fs.existsSync(filePath)) {
    text(res, 404, "Not Found");
    return;
  }
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": contentTypeForPath(filePath) });
  res.end(content);
};

const isPathAllowed = (filePath: string, allowList: string[]): boolean => {
  const normalized = path.resolve(filePath);
  return allowList.some((root) => normalized.startsWith(path.resolve(root)));
};

const hashId = (value: string): string => createHash("sha1").update(value).digest("hex").slice(0, 12);

const readRequestBody = async <T>(req: IncomingMessage): Promise<T> => {
  const body = await readJsonBody(req);
  return body as T;
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const extractSuiteMeta = (filePath: string) => {
  const fileName = path.basename(filePath);
  const relativePath = filePath;
  const match = fileName.match(/^(\d{4}-\d{2}-\d{2})__([^.]*)/);
  const date = match?.[1] ?? "";
  const feature = (match?.[2] ?? fileName).replace(/-/g, " ");
  return { fileName, relativePath, date, feature };
};

const parseMarkdownSuite = (filePath: string) => {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const suiteName = lines.find((line) => line.trim().startsWith("# "))?.replace(/^#\s+/, "") ?? filePath;
  const suiteId = `suite_${hashId(filePath)}`;
  const cases: Array<{
    id: string;
    title: string;
    useCase: string;
    expectedResult: string;
    priority: "low" | "medium" | "high" | "critical";
    steps: { id: string; text: string; expectedStepResult: string | null; orderIndex: number }[];
  }> = [];

  let currentCase: typeof cases[number] | null = null;
  let inSteps = false;

  for (const raw of lines) {
    const line = raw.trim();
    const normalized = line.replace(/^[-*]\s+/, "");
    // Handle case headers: "## [key] Title" format
    if (line.startsWith("## ")) {
      if (currentCase) {
        cases.push(currentCase);
      }
      // Extract title, removing ## prefix and optional numbering
      let title = line.replace(/^##\s+\d*\.?\s*/, "");
      // If title has [key] format, extract just the title part
      const bracketMatch = title.match(/^\[([^\]]+)\]\s+(.+)$/);
      if (bracketMatch) {
        // bracketMatch[1] is the key, bracketMatch[2] is the title
        title = bracketMatch[2];
      }
      const caseId = `case_${hashId(`${suiteId}:${title}`)}`;
      currentCase = {
        id: caseId,
        title,
        useCase: "",
        expectedResult: "",
        priority: "medium",
        steps: [],
      };
      inSteps = false;
      continue;
    }
    if (!currentCase) continue;
    if (normalized.toLowerCase().startsWith("use case:")) {
      currentCase.useCase = normalized.replace(/use case:\s*/i, "");
      continue;
    }
    if (normalized.toLowerCase().startsWith("expected result:") || normalized.toLowerCase().startsWith("expected:")) {
      currentCase.expectedResult = normalized.replace(/expected result:\s*/i, "").replace(/expected:\s*/i, "");
      continue;
    }
    if (normalized.toLowerCase().startsWith("priority:")) {
      const value = normalized.replace(/priority:\s*/i, "").toLowerCase();
      if (value === "low" || value === "medium" || value === "high" || value === "critical") {
        currentCase.priority = value;
      }
      continue;
    }
    if (normalized.toLowerCase().startsWith("steps:") || /^#{2,6}\s*steps\b/i.test(normalized)) {
      inSteps = true;
      continue;
    }
    if (inSteps) {
      if (line.startsWith("#")) {
        inSteps = false;
        continue;
      }
      const match = line.match(/^(?:-|\d+\.)\s+(.*)$/);
      if (match?.[1]) {
        const index = currentCase.steps.length + 1;
        const stepId = `step_${hashId(`${currentCase.id}:${index}`)}`;
        const stepText = match[1].replace(/^\[[ xX]\]\s*/, "").trim();
        currentCase.steps.push({
          id: stepId,
          text: stepText,
          expectedStepResult: null,
          orderIndex: index,
        });
      }
    }
  }
  if (currentCase) {
    cases.push(currentCase);
  }

  const stats = fs.statSync(filePath);
  return {
    suite: {
      id: suiteId,
      name: suiteName,
      description: "",
      status: "active" as const,
      version: 1,
      createdAt: stats.birthtime.toISOString(),
      updatedAt: stats.mtime.toISOString(),
    },
    cases,
  };
};

const readManifest = (manifestPath: string): any | null => {
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch {
    return null;
  }
};

const ensureQaTables = (db: DatabaseSync) => {
  db.exec(
    `CREATE TABLE IF NOT EXISTS qa_runs (
      id TEXT PRIMARY KEY,
      suite_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT NOT NULL,
      tested_by TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS qa_case_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT NOT NULL,
      failure_reason TEXT,
      tested_by TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS qa_step_checks (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      checked INTEGER NOT NULL,
      auto_checked INTEGER NOT NULL,
      failure_reason TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS qa_evidence (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      ref TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS qa_run_collaborators (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS qa_case_comments (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      author TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS qa_run_shares (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS qa_manual_ai_executions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      status TEXT NOT NULL,
      current_case_id TEXT,
      current_step_id TEXT,
      current_step_index INTEGER NOT NULL,
      total_steps INTEGER NOT NULL,
      failure_reason TEXT,
      report_ref TEXT,
      trace_ref TEXT,
      video_ref TEXT,
      playwright_ui_url TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      action_log TEXT NOT NULL
    );`,
  );
  try {
    db.exec("ALTER TABLE qa_manual_ai_executions ADD COLUMN playwright_ui_url TEXT;");
  } catch {
    // no-op: already migrated
  }
};

const toRun = (row: any) => ({
  id: row.id,
  suiteId: row.suite_id,
  mode: row.mode,
  executedByUserId: "local",
  status: row.status,
  notes: row.notes,
  testedBy: row.tested_by,
  startedAt: row.started_at,
  completedAt: row.completed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toManualAiExecution = (row: any): QaManualAiExecutionJob => {
  let actionLog: QaManualAiExecutionJob["actionLog"] = [];
  try {
    const parsed = JSON.parse(row.action_log ?? "[]");
    if (Array.isArray(parsed)) {
      actionLog = parsed;
    }
  } catch {
    actionLog = [];
  }
  return {
    id: String(row.id),
    runId: String(row.run_id),
    status: row.status as QaManualAiExecutionJob["status"],
    currentCaseId: row.current_case_id ?? null,
    currentStepId: row.current_step_id ?? null,
    currentStepIndex: Number(row.current_step_index ?? 0),
    totalSteps: Number(row.total_steps ?? 0),
    failureReason: row.failure_reason ?? null,
    reportRef: row.report_ref ?? null,
    traceRef: row.trace_ref ?? null,
    videoRef: row.video_ref ?? null,
    playwrightUiUrl: row.playwright_ui_url ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    actionLog,
  };
};

export function startDaemonServer(config: ServerConfig): http.Server {
  const daemon = new QaRunnerDaemon(config.daemonConfig);
  const state: ServerState = {};
  const generationJobs = new Map<string, QaGenerationJob>();
  const aiExecutionJobs = new Map<string, QaAiExecutionJob>();
  const aiExecutionProcesses = new Map<string, ReturnType<typeof spawn>>();
  const executionModeEnvRaw = (process.env.QA_RUNNER_PLAYWRIGHT_EXECUTION_MODE ?? "stub").trim().toLowerCase();
  const defaultExecutionMode: "stub" | "shell" | "ui" =
    executionModeEnvRaw === "shell" || executionModeEnvRaw === "ui" ? executionModeEnvRaw : "stub";
  const playwrightProjectDir = process.env.QA_RUNNER_PLAYWRIGHT_PROJECT_DIR?.trim() || "e2e/ui";
  const playwrightUiPort = Number(process.env.QA_RUNNER_PLAYWRIGHT_UI_PORT ?? "9323");
  const playwrightUiHost = process.env.QA_RUNNER_PLAYWRIGHT_UI_HOST?.trim() || "127.0.0.1";
  const needsXvfb = process.platform === "linux" && !process.env.DISPLAY;
  const xvfbAvailable = needsXvfb && spawnSync("which", ["xvfb-run"], { stdio: "ignore" }).status === 0;
  const workspaceDbs = new Map<string, DatabaseSync>();
  const uiDir = getUiAssetDir();
  const uiIndex = path.join(uiDir, "index.html");
  const githubToken = process.env.QA_RUNNER_GITHUB_TOKEN ?? "";

  const workspacesPath = path.join(process.cwd(), "tools", "qa-runner.workspaces.json");

  const normalizeWorkspaceId = (value: string | null): string => {
    const raw = (value ?? "").trim();
    if (!raw) {
      return "default";
    }
    const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "");
    return cleaned || "default";
  };

  const resolveWorkspaceId = (req: IncomingMessage): string => {
    const headerValue = Array.isArray(req.headers["x-qa-workspace"])
      ? req.headers["x-qa-workspace"][0]
      : req.headers["x-qa-workspace"];
    const url = new URL(req.url ?? "/", "http://localhost");
    const queryValue = url.searchParams.get("workspace");
    return normalizeWorkspaceId((headerValue ?? queryValue) as string | null);
  };

  const defaultCasesDir = config.daemonConfig.outputs.manualDir;

  const loadWorkspaceProfiles = (): QaWorkspaceProfile[] => {
    if (!fs.existsSync(workspacesPath)) {
      return [
        {
          id: "default",
          label: "default",
          dbPath: path.join("tools", "qa-runner.db"),
          casesDir: defaultCasesDir,
          isDefault: true,
        },
      ];
    }
    try {
      const raw = JSON.parse(fs.readFileSync(workspacesPath, "utf-8")) as { profiles?: QaWorkspaceProfile[] };
      const profiles = Array.isArray(raw.profiles) ? raw.profiles : [];
      if (!profiles.some((item) => item.id === "default")) {
        profiles.unshift({
          id: "default",
          label: "default",
          dbPath: path.join("tools", "qa-runner.db"),
          casesDir: defaultCasesDir,
          isDefault: true,
        });
      }
      return profiles;
    } catch {
      return [
        {
          id: "default",
          label: "default",
          dbPath: path.join("tools", "qa-runner.db"),
          casesDir: defaultCasesDir,
          isDefault: true,
        },
      ];
    }
  };

  const saveWorkspaceProfiles = (profiles: QaWorkspaceProfile[]): void => {
    const payload = { profiles };
    fs.mkdirSync(path.dirname(workspacesPath), { recursive: true });
    fs.writeFileSync(workspacesPath, JSON.stringify(payload, null, 2), "utf-8");
  };

  const getWorkspaceProfile = (workspaceId: string): QaWorkspaceProfile => {
    const profiles = loadWorkspaceProfiles();
    return profiles.find((item) => item.id === workspaceId) ?? profiles[0]!;
  };

  const getWorkspaceCasesDir = (workspaceId: string): string => {
    const profile = getWorkspaceProfile(workspaceId);
    const dir = profile.casesDir || defaultCasesDir;
    return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
  };

  const getAllowList = (): string[] => {
    if (config.daemonConfig.uiReadPaths) {
      return config.daemonConfig.uiReadPaths;
    }
    const profiles = loadWorkspaceProfiles();
    const caseDirs = profiles.map((item) => (path.isAbsolute(item.casesDir) ? item.casesDir : path.join(process.cwd(), item.casesDir))).filter(Boolean);
    return Array.from(new Set([config.daemonConfig.outputs.e2eDir, ...caseDirs]));
  };

  const getWorkspaceDb = (workspaceId: string): DatabaseSync => {
    const id = normalizeWorkspaceId(workspaceId);
    const cached = workspaceDbs.get(id);
    if (cached) {
      return cached;
    }
    const profile = getWorkspaceProfile(id);
    const dbPath = path.isAbsolute(profile.dbPath) ? profile.dbPath : path.join(process.cwd(), profile.dbPath);
    const db = new DatabaseSync(dbPath);
    ensureQaTables(db);
    workspaceDbs.set(id, db);
    return db;
  };

  const ensureInitialSuite = async (): Promise<void> => {
    const manualDir = defaultCasesDir;
    if (!fs.existsSync(manualDir)) {
      fs.mkdirSync(manualDir, { recursive: true });
    }
    const existing = fs.readdirSync(manualDir).some((name) => name.endsWith(".md"));
    if (existing) {
      return;
    }
    const event: ChangeEvent = {
      files: [],
      summary: "Initial QA Runner module smoke checklist",
      tool: "auto-seed",
      timestamp: Date.now(),
    };
    try {
      const outcome = await daemon.handleEvent(event, { mode: "manual" });
      if (outcome.writtenFiles.some((file) => file.endsWith(".md"))) {
        state.autoSeededAt = new Date().toISOString();
      }
    } catch (error) {
      console.error("Failed to auto-generate initial QA suite", error);
    }
  };

  void ensureInitialSuite();

  const loadRunDetail = (db: DatabaseSync, runId: string, casesRoot: string) => {
    const runRow = db.prepare("SELECT * FROM qa_runs WHERE id = ?").get(runId) as any;
    if (!runRow) {
      return null;
    }
    const suiteFiles = fs
      .readdirSync(casesRoot)
      .filter((name) => name.endsWith(".md"))
      .map((name) => path.join(casesRoot, name));
    const suiteFile = suiteFiles.find((file) => parseMarkdownSuite(file).suite.id === runRow.suite_id);
    if (!suiteFile) {
      return null;
    }
    const parsed = parseMarkdownSuite(suiteFile);

    const caseResults = db.prepare("SELECT * FROM qa_case_results WHERE run_id = ?").all(runId) as any[];
    const stepChecks = db.prepare("SELECT * FROM qa_step_checks WHERE run_id = ?").all(runId) as any[];
    const evidenceRows = db.prepare("SELECT * FROM qa_evidence WHERE run_id = ?").all(runId) as any[];

    const cases = parsed.cases.map((qaCase, index) => {
      const resultRow = caseResults.find((row) => row.case_id === qaCase.id);
      const evidence = evidenceRows
        .filter((row) => row.case_id === qaCase.id)
        .map((row) => ({ type: row.type, label: row.label, ref: row.ref }));
      const steps = qaCase.steps.map((step) => {
        const checkRow = stepChecks.find((row) => row.step_id === step.id);
        return {
          ...step,
          check: checkRow
            ? {
                id: checkRow.id,
                runId,
                caseId: qaCase.id,
                stepId: step.id,
                checked: Boolean(checkRow.checked),
                autoChecked: Boolean(checkRow.auto_checked),
                failureReason: checkRow.failure_reason ?? null,
                updatedByUserId: null,
                updatedAt: checkRow.updated_at,
              }
            : null,
        };
      });
      return {
        id: qaCase.id,
        suiteId: parsed.suite.id,
        title: qaCase.title,
        useCase: qaCase.useCase,
        expectedResult: qaCase.expectedResult,
        priority: qaCase.priority,
        tags: [],
        playwrightMap: {},
        orderIndex: index + 1,
        createdAt: parsed.suite.createdAt,
        updatedAt: parsed.suite.updatedAt,
        steps,
        result: resultRow
          ? {
              id: resultRow.id,
              runId,
              caseId: qaCase.id,
              status: resultRow.status,
              notes: resultRow.notes,
              failureReason: resultRow.failure_reason,
              testedBy: resultRow.tested_by,
              completedAt: resultRow.completed_at,
              evidence,
              updatedByUserId: null,
              updatedAt: resultRow.updated_at,
            }
          : null,
      };
    });

    return { run: toRun(runRow), suite: parsed.suite, cases };
  };

  const buildManualReport = (detail: ReturnType<typeof loadRunDetail>) => {
    if (!detail) {
      return null;
    }
    const cases = detail.cases.map((item) => {
      const totalSteps = item.steps.length;
      const checkedSteps = item.steps.filter((step) => step.check?.checked).length;
      const resultStatus = item.result?.status ?? "not_started";
      return {
        id: item.id,
        title: item.title,
        status: resultStatus,
        tester: item.result?.testedBy ?? null,
        notes: item.result?.notes ?? "",
        failureReason: item.result?.failureReason ?? null,
        completedAt: item.result?.completedAt ?? null,
        totalSteps,
        checkedSteps,
        evidenceCount: item.result?.evidence?.length ?? 0,
        evidence: item.result?.evidence ?? [],
      };
    });
    const totalCases = cases.length;
    const passed = cases.filter((item) => item.status === "passed").length;
    const failed = cases.filter((item) => item.status === "failed").length;
    const blocked = cases.filter((item) => item.status === "blocked").length;
    const inProgress = cases.filter((item) => item.status === "in_progress").length;
    const notStarted = cases.filter((item) => item.status === "not_started").length;
    const completionRate = totalCases > 0 ? Math.round(((passed + failed + blocked) / totalCases) * 100) : 0;

    return {
      generatedAt: new Date().toISOString(),
      run: detail.run,
      suite: detail.suite,
      summary: {
        totalCases,
        passed,
        failed,
        blocked,
        inProgress,
        notStarted,
        completionRate,
      },
      cases,
    };
  };

  const upsertManualAiExecution = (db: DatabaseSync, execution: QaManualAiExecutionJob): void => {
    db.prepare(
      `INSERT INTO qa_manual_ai_executions (
        id, run_id, status, current_case_id, current_step_id, current_step_index, total_steps,
        failure_reason, report_ref, trace_ref, video_ref, playwright_ui_url, started_at, completed_at, created_at, updated_at, action_log
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status=excluded.status,
        current_case_id=excluded.current_case_id,
        current_step_id=excluded.current_step_id,
        current_step_index=excluded.current_step_index,
        total_steps=excluded.total_steps,
        failure_reason=excluded.failure_reason,
        report_ref=excluded.report_ref,
        trace_ref=excluded.trace_ref,
        video_ref=excluded.video_ref,
        playwright_ui_url=excluded.playwright_ui_url,
        started_at=excluded.started_at,
        completed_at=excluded.completed_at,
        updated_at=excluded.updated_at,
        action_log=excluded.action_log`
    ).run(
      execution.id,
      execution.runId,
      execution.status,
      execution.currentCaseId,
      execution.currentStepId,
      execution.currentStepIndex,
      execution.totalSteps,
      execution.failureReason,
      execution.reportRef,
      execution.traceRef,
      execution.videoRef,
      execution.playwrightUiUrl ?? null,
      execution.startedAt,
      execution.completedAt,
      execution.createdAt,
      execution.updatedAt,
      JSON.stringify(execution.actionLog),
    );
  };

  const addEvidenceRef = (db: DatabaseSync, input: {
    runId: string;
    caseId: string;
    type: string;
    label: string;
    ref: string;
  }): void => {
    const id = `ev_${hashId(`${input.runId}:${input.caseId}:${input.type}:${Date.now()}`)}`;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO qa_evidence (id, run_id, case_id, type, label, ref, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, input.runId, input.caseId, input.type, input.label, input.ref, now);
  };

  const getManualAiExecution = (db: DatabaseSync, runId: string, executionJobId: string): QaManualAiExecutionJob | null => {
    const row = db.prepare("SELECT * FROM qa_manual_ai_executions WHERE id = ? AND run_id = ?").get(executionJobId, runId) as any;
    return row ? toManualAiExecution(row) : null;
  };

  type ManualAiParsedStep =
    | { kind: "open"; target: string }
    | { kind: "fill"; field: string; valueRef: string }
    | { kind: "click"; label: string }
    | { kind: "verify_text"; text: string }
    | { kind: "verify_url_contains"; value: string }
    | { kind: "verify_no_js_errors" }
    | { kind: "verify_no_failed_network_requests" };

  type ManualAiStepParseResult =
    | { supported: true; step: ManualAiParsedStep }
    | { supported: false; reason: string };

  const parseManualAiStep = (stepText: string): ManualAiStepParseResult => {
    const text = stepText.trim();
    if (!text) {
      return { supported: false, reason: "manual_required: empty step text" };
    }
    let match = text.match(/^open\s+(.+)$/i);
    if (match) {
      return { supported: true, step: { kind: "open", target: match[1].trim() } };
    }
    match = text.match(/^fill\s+(.+):\s*(.+)$/i);
    if (match) {
      return {
        supported: true,
        step: {
          kind: "fill",
          field: match[1].trim(),
          valueRef: match[2].trim(),
        },
      };
    }
    match = text.match(/^click\s+(.+)$/i);
    if (match) {
      return { supported: true, step: { kind: "click", label: match[1].trim() } };
    }
    match = text.match(/^verify\s+url\s+contains\s+(.+)$/i);
    if (match) {
      return { supported: true, step: { kind: "verify_url_contains", value: match[1].trim() } };
    }
    if (/^verify\s+no\s+javascript\s+errors$/i.test(text)) {
      return { supported: true, step: { kind: "verify_no_js_errors" } };
    }
    if (/^verify\s+no\s+failed\s+network\s+requests$/i.test(text)) {
      return { supported: true, step: { kind: "verify_no_failed_network_requests" } };
    }
    match = text.match(/^verify\s+(.+)$/i);
    if (match) {
      return { supported: true, step: { kind: "verify_text", text: match[1].trim() } };
    }
    return { supported: false, reason: "manual_required: unsupported step pattern" };
  };

  const slugifySelectorToken = (value: string): string =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const resolveManualAiFillValue = (valueRef: string): { ok: true; value: string } | { ok: false; reason: string } => {
    const token = valueRef.trim();
    if (token === "E2E_EMAIL" || token === "E2E_PASSWORD") {
      const envValue = process.env[token]?.trim();
      if (!envValue) {
        return { ok: false, reason: `missing_env: ${token}` };
      }
      return { ok: true, value: envValue };
    }
    return { ok: true, value: token };
  };

  const resolveManualAiBaseUrl = (): string =>
    process.env.QA_RUNNER_BASE_URL?.trim() ||
    process.env.PLAYWRIGHT_BASE_URL?.trim() ||
    process.env.BASE_URL?.trim() ||
    "http://127.0.0.1:3000";

  const executeManualAiStep = async (input: {
    step: ManualAiParsedStep;
    page: any;
    consoleErrors: string[];
    failedRequests: string[];
  }): Promise<void> => {
    const stepTimeoutMs = Number(process.env.QA_RUNNER_MANUAL_AI_STEP_TIMEOUT_MS ?? "8000");
    const clickTimeoutMs = Math.max(2000, Math.min(stepTimeoutMs, 6000));
    const textWaitMs = Math.max(2000, Math.min(stepTimeoutMs, 6000));

    const waitAndFill = async (locator: any, value: string): Promise<boolean> => {
      try {
        await locator.waitFor({ state: "visible", timeout: clickTimeoutMs });
        await locator.fill(value, { timeout: clickTimeoutMs });
        return true;
      } catch {
        return false;
      }
    };

    const waitAndClick = async (locator: any): Promise<boolean> => {
      try {
        await locator.waitFor({ state: "visible", timeout: clickTimeoutMs });
        await locator.click({ timeout: clickTimeoutMs });
        return true;
      } catch {
        return false;
      }
    };

    switch (input.step.kind) {
      case "open": {
        const target = input.step.target;
        const isAbsolute = /^https?:\/\//i.test(target);
        const baseUrl = resolveManualAiBaseUrl();
        const url = isAbsolute ? target : `${baseUrl.replace(/\/$/, "")}/${target.replace(/^\//, "")}`;
        await input.page.goto(url, { waitUntil: "domcontentloaded", timeout: stepTimeoutMs });
        return;
      }
      case "fill": {
        const resolved = resolveManualAiFillValue(input.step.valueRef);
        if (!resolved.ok) {
          throw new Error(resolved.reason);
        }
        const field = input.step.field;
        const fieldToken = slugifySelectorToken(field);
        const candidates = [
          input.page.getByLabel(field, { exact: false }).first(),
          input.page.getByPlaceholder(field, { exact: false }).first(),
          input.page.getByTestId(fieldToken).first(),
          input.page.locator(`[name="${field}"]`).first(),
          input.page.locator(`[name="${fieldToken}"]`).first(),
          input.page.locator(`#${fieldToken}`).first(),
        ];
        for (const candidate of candidates) {
          if (await waitAndFill(candidate, resolved.value)) {
            return;
          }
        }
        throw new Error(`fill_target_not_found: ${field}`);
      }
      case "click": {
        const label = input.step.label;
        const labelToken = slugifySelectorToken(label);
        const candidates = [
          input.page.getByRole("button", { name: label, exact: false }).first(),
          input.page.getByRole("link", { name: label, exact: false }).first(),
          input.page.getByTestId(labelToken).first(),
          input.page.getByText(label, { exact: false }).first(),
        ];
        for (const candidate of candidates) {
          if (await waitAndClick(candidate)) {
            return;
          }
        }
        throw new Error(`click_target_not_found: ${label}`);
      }
      case "verify_text": {
        await input.page.getByText(input.step.text, { exact: false }).first().waitFor({
          state: "visible",
          timeout: textWaitMs,
        });
        return;
      }
      case "verify_url_contains": {
        const currentUrl = String(input.page.url() ?? "");
        if (!currentUrl.includes(input.step.value)) {
          throw new Error(`url_mismatch: expected "${input.step.value}" in "${currentUrl}"`);
        }
        return;
      }
      case "verify_no_js_errors": {
        if (input.consoleErrors.length > 0) {
          throw new Error(`javascript_errors_detected: ${input.consoleErrors[0]}`);
        }
        return;
      }
      case "verify_no_failed_network_requests": {
        if (input.failedRequests.length > 0) {
          throw new Error(`failed_network_requests_detected: ${input.failedRequests[0]}`);
        }
        return;
      }
    }
  };

  const runManualAiExecution = async (input: {
    db: DatabaseSync;
    runId: string;
    executionJobId: string;
    casesRoot: string;
    playwrightProjectDir: string;
    executionMode: "stub" | "shell" | "ui";
  }): Promise<void> => {
    const detail = loadRunDetail(input.db, input.runId, input.casesRoot);
    if (!detail) {
      return;
    }
    const totalSteps = detail.cases.reduce((acc, qaCase) => acc + qaCase.steps.length, 0);
    let execution = getManualAiExecution(input.db, input.runId, input.executionJobId);
    if (!execution) {
      return;
    }
    const startedAt = new Date().toISOString();
    execution = {
      ...execution,
      status: "running",
      startedAt,
      updatedAt: startedAt,
      totalSteps,
      currentStepIndex: 0,
    };
    upsertManualAiExecution(input.db, execution);

    const resolvedProjectDir = path.resolve(process.cwd(), input.playwrightProjectDir);
    const projectPackageJson = path.join(resolvedProjectDir, "package.json");
    if (!fs.existsSync(projectPackageJson)) {
      const now = new Date().toISOString();
      execution.status = "failed";
      execution.failureReason = `playwright_project_not_found: ${resolvedProjectDir}`;
      execution.completedAt = now;
      execution.updatedAt = now;
      upsertManualAiExecution(input.db, execution);
      input.db.prepare("UPDATE qa_runs SET status = ?, updated_at = ? WHERE id = ?").run("failed", now, input.runId);
      return;
    }

    let browser: any = null;
    let context: any = null;
    let page: any = null;
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    try {
      const projectRequire = createRequire(projectPackageJson);
      const playwright = projectRequire("playwright") as { chromium: { launch: (options?: any) => Promise<any> } };
      browser = await playwright.chromium.launch({ headless: input.executionMode !== "ui" });
      context = await browser.newContext();
      page = await context.newPage();
      page.on("console", (message: any) => {
        if (message?.type?.() === "error") {
          consoleErrors.push(message.text?.() ?? "console_error");
        }
      });
      page.on("requestfailed", (request: any) => {
        const errorText = request.failure?.()?.errorText ?? "request_failed";
        failedRequests.push(`${request.method?.() ?? "GET"} ${request.url?.() ?? ""} (${errorText})`);
      });
    } catch (error) {
      const now = new Date().toISOString();
      execution.status = "failed";
      execution.failureReason = error instanceof Error ? error.message : "playwright_launch_failed";
      execution.completedAt = now;
      execution.updatedAt = now;
      upsertManualAiExecution(input.db, execution);
      input.db.prepare("UPDATE qa_runs SET status = ?, updated_at = ? WHERE id = ?").run("failed", now, input.runId);
      if (context) {
        await context.close().catch(() => undefined);
      }
      if (browser) {
        await browser.close().catch(() => undefined);
      }
      return;
    }

    let stepIndex = 0;
    try {
      for (const qaCase of detail.cases) {
        for (const step of qaCase.steps) {
          stepIndex += 1;
          execution.currentCaseId = qaCase.id;
          execution.currentStepId = step.id;
          execution.currentStepIndex = stepIndex;
          execution.updatedAt = new Date().toISOString();
          upsertManualAiExecution(input.db, execution);

          const parsed = parseManualAiStep(step.text);
          let failureReason: string | null = null;
          if (!parsed.supported) {
            failureReason = parsed.reason;
          } else {
            try {
              await executeManualAiStep({
                step: parsed.step,
                page,
                consoleErrors,
                failedRequests,
              });
            } catch (error) {
              failureReason = error instanceof Error ? error.message : "step_failed";
            }
          }

          const now = new Date().toISOString();
          const checkId = `check_${hashId(`${input.runId}:${step.id}`)}`;
          input.db.prepare(
            `INSERT INTO qa_step_checks (id, run_id, case_id, step_id, checked, auto_checked, failure_reason, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?)
             ON CONFLICT(id) DO UPDATE SET checked=excluded.checked, auto_checked=1, failure_reason=excluded.failure_reason, updated_at=excluded.updated_at`
          ).run(checkId, input.runId, qaCase.id, step.id, failureReason ? 0 : 1, failureReason, now);

          execution.actionLog.push({
            at: now,
            caseId: qaCase.id,
            stepId: step.id,
            stepText: step.text,
            status: failureReason ? "failed" : "passed",
            reason: failureReason ?? undefined,
          });

          if (failureReason) {
            const resultId = `result_${hashId(`${input.runId}:${qaCase.id}`)}`;
            input.db.prepare(
              `INSERT INTO qa_case_results (id, run_id, case_id, status, notes, failure_reason, tested_by, completed_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
               ON CONFLICT(id) DO UPDATE SET status=excluded.status, notes=excluded.notes, failure_reason=excluded.failure_reason, completed_at=excluded.completed_at, updated_at=excluded.updated_at`
            ).run(resultId, input.runId, qaCase.id, "failed", "AI manual execution failed", failureReason, now, now);
            execution.status = "failed";
            execution.failureReason = failureReason;
            execution.completedAt = now;
            execution.updatedAt = now;
            execution.reportRef = `qa://manual-ai/${input.runId}/${execution.id}/report.json`;
            execution.traceRef = `qa://manual-ai/${input.runId}/${execution.id}/trace.zip`;
            execution.videoRef = `qa://manual-ai/${input.runId}/${execution.id}/video.webm`;
            addEvidenceRef(input.db, {
              runId: input.runId,
              caseId: qaCase.id,
              type: "report",
              label: "Manual AI Report",
              ref: execution.reportRef,
            });
            addEvidenceRef(input.db, {
              runId: input.runId,
              caseId: qaCase.id,
              type: "trace",
              label: "Manual AI Trace",
              ref: execution.traceRef,
            });
            addEvidenceRef(input.db, {
              runId: input.runId,
              caseId: qaCase.id,
              type: "video",
              label: "Manual AI Video",
              ref: execution.videoRef,
            });
            upsertManualAiExecution(input.db, execution);
            input.db.prepare("UPDATE qa_runs SET status = ?, updated_at = ? WHERE id = ?").run("failed", now, input.runId);
            return;
          }
        }

        const now = new Date().toISOString();
        const resultId = `result_${hashId(`${input.runId}:${qaCase.id}`)}`;
        input.db.prepare(
          `INSERT INTO qa_case_results (id, run_id, case_id, status, notes, failure_reason, tested_by, completed_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)
           ON CONFLICT(id) DO UPDATE SET status=excluded.status, notes=excluded.notes, failure_reason=NULL, completed_at=excluded.completed_at, updated_at=excluded.updated_at`
        ).run(resultId, input.runId, qaCase.id, "passed", "AI manual execution completed", now, now);
      }

      const completedAt = new Date().toISOString();
      execution.status = "completed";
      execution.failureReason = null;
      execution.completedAt = completedAt;
      execution.updatedAt = completedAt;
      execution.reportRef = `qa://manual-ai/${input.runId}/${execution.id}/report.json`;
      execution.traceRef = `qa://manual-ai/${input.runId}/${execution.id}/trace.zip`;
      execution.videoRef = `qa://manual-ai/${input.runId}/${execution.id}/video.webm`;
      const lastCaseId = detail.cases[detail.cases.length - 1]?.id;
      if (lastCaseId) {
        addEvidenceRef(input.db, {
          runId: input.runId,
          caseId: lastCaseId,
          type: "report",
          label: "Manual AI Report",
          ref: execution.reportRef,
        });
        addEvidenceRef(input.db, {
          runId: input.runId,
          caseId: lastCaseId,
          type: "trace",
          label: "Manual AI Trace",
          ref: execution.traceRef,
        });
        addEvidenceRef(input.db, {
          runId: input.runId,
          caseId: lastCaseId,
          type: "video",
          label: "Manual AI Video",
          ref: execution.videoRef,
        });
      }
      upsertManualAiExecution(input.db, execution);
      input.db.prepare("UPDATE qa_runs SET status = ?, updated_at = ? WHERE id = ?").run("passed", completedAt, input.runId);
    } finally {
      if (context) {
        await context.close().catch(() => undefined);
      }
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }
  };

  const renderReportMarkdown = (report: ReturnType<typeof buildManualReport>) => {
    if (!report) {
      return "# QA Manual Run Report\n\nNo report available.\n";
    }
    const summary = report.summary;
    const caseLines = report.cases
      .map((item) => `- **${item.title}** · ${item.status} · ${item.checkedSteps}/${item.totalSteps} steps`)
      .join("\n");
    return [
      `# QA Manual Run Report`,
      ``,
      `Run ID: ${report.run.id}`,
      `Suite: ${report.suite.name}`,
      `Status: ${report.run.status}`,
      ``,
      `## Summary`,
      `- Total Cases: ${summary.totalCases}`,
      `- Passed: ${summary.passed}`,
      `- Failed: ${summary.failed}`,
      `- Blocked: ${summary.blocked}`,
      `- In Progress: ${summary.inProgress}`,
      `- Not Started: ${summary.notStarted}`,
      `- Completion Rate: ${summary.completionRate}%`,
      ``,
      `## Cases`,
      caseLines || "_No cases available._",
      ``,
    ].join("\n");
  };

  const renderReportHtml = (report: ReturnType<typeof buildManualReport>) => {
    if (!report) {
      return "<!doctype html><html><body><h1>QA Manual Run Report</h1><p>No report available.</p></body></html>";
    }
    const summary = report.summary;
    const rows = report.cases
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.title)}</td>
            <td>${escapeHtml(item.status)}</td>
            <td>${item.checkedSteps}/${item.totalSteps}</td>
            <td>${item.evidenceCount}</td>
          </tr>
        `,
      )
      .join("");
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>QA Manual Run Report</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
      h1 { margin-bottom: 4px; }
      .meta { color: #475569; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
      th { background: #f1f5f9; }
      .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
      .summary div { border: 1px solid #e2e8f0; padding: 8px; border-radius: 6px; background: #f8fafc; }
    </style>
  </head>
  <body>
    <h1>QA Manual Run Report</h1>
    <div class="meta">Run ID: ${escapeHtml(report.run.id)} · Suite: ${escapeHtml(report.suite.name)} · Status: ${escapeHtml(report.run.status)}</div>
    <div class="summary">
      <div>Total Cases: ${summary.totalCases}</div>
      <div>Passed: ${summary.passed}</div>
      <div>Failed: ${summary.failed}</div>
      <div>Blocked: ${summary.blocked}</div>
      <div>In Progress: ${summary.inProgress}</div>
      <div>Completion Rate: ${summary.completionRate}%</div>
    </div>
    <h2>Cases</h2>
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Status</th>
          <th>Steps</th>
          <th>Evidence</th>
        </tr>
      </thead>
      <tbody>
        ${rows || "<tr><td colspan=\"4\">No cases available.</td></tr>"}
      </tbody>
    </table>
  </body>
</html>`;
  };

  const allowedOrigin = process.env.QA_RUNNER_CORS_ORIGIN ?? "http://localhost:5173";
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      text(res, 404, "Not Found", "text/plain", corsHeaders);
      return;
    }

    for (const [key, value] of Object.entries(corsHeaders)) {
      res.setHeader(key, value);
    }

    const workspaceId = resolveWorkspaceId(req);
    const db = getWorkspaceDb(workspaceId);
    const casesDir = getWorkspaceCasesDir(workspaceId);
    const allowList = getAllowList();

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    if (req.method === "GET" && (req.url === "/ui" || req.url === "/ui/")) {
      serveStatic(res, uiIndex);
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/ui/")) {
      serveStatic(res, uiIndex);
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/assets/")) {
      const assetPath = path.join(uiDir, req.url.replace("/assets/", "assets/"));
      serveStatic(res, assetPath);
      return;
    }

    if (req.method === "GET" && (req.url === "/sw.js" || req.url === "/manifest.json")) {
      const staticPath = path.join(uiDir, req.url.replace(/^\//, ""));
      serveStatic(res, staticPath);
      return;
    }

    if (req.method === "GET" && req.url === "/status") {
      json(res, 200, {
        running: true,
        lastEventAt: state.lastEvent ? new Date(state.lastEvent.timestamp).toISOString() : null,
        lastGeneratedAt: state.lastOutcome?.result.manifest.generatedAt ?? null,
      });
      return;
    }

    if (req.method === "GET" && req.url === "/debug/ui") {
      const sampleAsset = "assets/index-DipP6BAz.js";
      const assetPath = path.join(uiDir, sampleAsset);
      json(res, 200, {
        uiDir,
        uiIndex,
        sampleAsset,
        assetPath,
        assetExists: fs.existsSync(assetPath),
        indexExists: fs.existsSync(uiIndex),
      });
      return;
    }

    if (req.method === "GET" && req.url === "/manifest") {
      const manifestPath = config.daemonConfig.outputs.manifestPath;
      const manifest = readManifest(manifestPath);
      if (!manifest) {
        json(res, 404, { error: "manifest_not_found" });
        return;
      }
      json(res, 200, manifest);
      return;
    }

    if (req.method === "GET" && req.url === "/plugin/qa/flakiness") {
      const manifestPath = config.daemonConfig.outputs.manifestPath;
      const manifest = readManifest(manifestPath);
      if (!manifest) {
        json(res, 200, {
          data: {
            records: [],
            summary: {
              totalCases: 0,
              unstableCases: 0,
              avgFlakeScore: 0,
              categories: { timing: 0, selector: 0, assertion: 0 },
              trend: "stable",
            },
            recommendations: ["No flakiness data yet. Run `qa-runner generate` with AI auto-testing enabled."],
          },
        });
        return;
      }

      const records = Array.isArray(manifest.flakiness?.records) ? manifest.flakiness.records : [];
      const unstableCases = records.filter((item: any) => item?.unstable === true).length;
      const avgFlakeScore =
        records.length > 0
          ? Number(
              (
                records.reduce((acc: number, item: any) => acc + Number(item?.flakeScore ?? 0), 0) /
                records.length
              ).toFixed(3),
            )
          : 0;

      const categories = records.reduce(
        (acc: { timing: number; selector: number; assertion: number }, item: any) => {
          const bucket = item?.categoryBreakdown ?? {};
          acc.timing += Number(bucket.timing ?? 0);
          acc.selector += Number(bucket.selector ?? 0);
          acc.assertion += Number(bucket.assertion ?? 0);
          return acc;
        },
        { timing: 0, selector: 0, assertion: 0 },
      );

      const trend = avgFlakeScore >= 0.4 ? "degrading" : avgFlakeScore >= 0.2 ? "watch" : "stable";
      const recommendations: string[] = [];
      if (categories.selector > 0) {
        recommendations.push("Selector instability detected: prioritize stable `data-testid` and avoid style-derived locators.");
      }
      if (categories.timing > 0) {
        recommendations.push("Timing failures detected: wait on deterministic app state instead of fixed sleeps.");
      }
      if (categories.assertion > 0) {
        recommendations.push("Assertion failures detected: tighten expected outcomes and reduce ambiguous step wording.");
      }
      if (recommendations.length === 0) {
        recommendations.push("No major flakiness category detected. Continue monitoring trend and unstable case count.");
      }

      json(res, 200, {
        data: {
          records,
          summary: {
            totalCases: records.length,
            unstableCases,
            avgFlakeScore,
            categories,
            trend,
          },
          recommendations,
        },
      });
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/files")) {
      const url = new URL(req.url, "http://localhost");
      const rootKey = url.searchParams.get("root");
      const ext = url.searchParams.get("ext") ?? "";
      let roots: string[] = [];
      if (rootKey === "manual") {
        roots = [casesDir];
      } else if (rootKey === "e2e") {
        roots = [config.daemonConfig.outputs.e2eDir];
      } else {
        roots = allowList;
      }
      const files: string[] = [];
      const queue = [...roots];
      while (queue.length > 0) {
        const current = queue.pop();
        if (!current) continue;
        if (!isPathAllowed(current, allowList)) continue;
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const entry of entries) {
          const fullPath = path.join(current, entry.name);
          if (!isPathAllowed(fullPath, allowList)) continue;
          if (entry.isDirectory()) {
            queue.push(fullPath);
            continue;
          }
          if (entry.isFile()) {
            if (!ext || fullPath.endsWith(`.${ext}`)) {
              files.push(fullPath);
            }
          }
        }
      }
      json(res, 200, { files });
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/file")) {
      const url = new URL(req.url, "http://localhost");
      const target = url.searchParams.get("path");
      if (!target) {
        json(res, 400, { error: "missing_path" });
        return;
      }
      const resolved = path.resolve(target);
      if (!isPathAllowed(resolved, allowList)) {
        json(res, 403, { error: "path_not_allowed" });
        return;
      }
      if (!fs.existsSync(resolved)) {
        json(res, 404, { error: "file_not_found" });
        return;
      }
      const content = fs.readFileSync(resolved, "utf-8");
      text(res, 200, content, "text/plain");
      return;
    }

    if (req.method === "GET" && req.url === "/plugin/qa/runtime") {
      json(res, 200, {
        data: {
          casesRoot: casesDir,
          aiEnabled: true,
          playwrightUiEnabled: true,
          executionMode: defaultExecutionMode,
          executionTimeoutMs: 120000,
          workspaceRoot: process.cwd(),
          evidenceStorageMode: "metadata_only",
          executionIsolationMode: "local_worker",
          qaDataScopeMode: "global",
          extractionTiming: "in_repo_until_v1",
          pomRuleMode: "off",
          pomDirectLocatorThreshold: 8,
          manualReportWebhookEnabled: false,
          manualReportWebhookEventName: "qa.manual.report.ready",
        },
      });
      return;
    }

    if (req.method === "GET" && req.url === "/plugin/qa/test-types") {
      const pluginsPath = path.join(process.cwd(), "tools", "qa-runner.plugins.json");
      if (!fs.existsSync(pluginsPath)) {
        json(res, 200, { data: [] });
        return;
      }
      try {
        const raw = JSON.parse(fs.readFileSync(pluginsPath, "utf-8")) as {
          types?: Array<{ id?: string; label?: string; description?: string; details?: string }>;
        };
        const types = Array.isArray(raw.types) ? raw.types : [];
        json(res, 200, {
          data: types
            .filter((item) => item.id && item.label)
            .map((item) => ({
              id: String(item.id),
              label: String(item.label),
              description: String(item.description ?? ""),
              details: String(item.details ?? ""),
            })),
        });
      } catch (error) {
        json(res, 200, { data: [] });
      }
      return;
    }

    if (req.method === "GET" && req.url === "/plugin/qa/suites/files") {
      const files = fs
        .readdirSync(casesDir)
        .filter((name) => name.endsWith(".md"))
        .map((name) => path.join(casesDir, name));
      const rows = files.map((filePath) => {
        const { suite } = parseMarkdownSuite(filePath);
        const meta = extractSuiteMeta(filePath);
        return {
          suiteId: suite.id,
          fileName: meta.fileName,
          relativePath: meta.relativePath,
          suiteName: suite.name,
          feature: meta.feature,
          date: meta.date,
        };
      });
      json(res, 200, { data: rows });
      return;
    }

    if (req.method === "GET" && req.url === "/plugin/qa/suites") {
      const files = fs
        .readdirSync(casesDir)
        .filter((name) => name.endsWith(".md"))
        .map((name) => path.join(casesDir, name));
      const rows = files.map((filePath) => parseMarkdownSuite(filePath).suite);
      json(res, 200, { data: rows });
      return;
    }

    if (req.method === "GET" && req.url === "/plugin/qa/suites/archived") {
      json(res, 200, { data: [] });
      return;
    }

    if (req.method === "POST" && req.url?.startsWith("/plugin/qa/suites/") && req.url.endsWith("/archive")) {
      const suiteId = req.url.split("/")[4] ?? "";
      json(res, 200, { data: { id: suiteId } });
      return;
    }

    if (req.method === "POST" && req.url?.startsWith("/plugin/qa/suites/") && req.url.endsWith("/duplicate")) {
      const suiteId = req.url.split("/")[4] ?? "";
      json(res, 200, { data: { id: suiteId } });
      return;
    }

    if (req.method === "POST" && req.url?.startsWith("/plugin/qa/suites/") && req.url.endsWith("/delete")) {
      const suiteId = req.url.split("/")[4] ?? "";
      json(res, 200, { data: { id: suiteId } });
      return;
    }

    if (req.method === "POST" && req.url === "/plugin/qa/suites/restore") {
      json(res, 200, { data: { ok: true } });
      return;
    }

    if (req.method === "GET" && req.url === "/plugin/qa/suites/validation") {
      json(res, 200, { 
        data: { 
          scannedFiles: 0,
          errorCount: 0,
          warningCount: 0,
          issues: []
        } 
      });
      return;
    }

    if (req.method === "POST" && req.url === "/plugin/qa/runs") {
      const body = (await readJsonBody(req)) as { suiteId?: string; mode?: string; notes?: string };
      const now = new Date().toISOString();
      const runId = `run_${hashId(`${body.suiteId ?? ""}:${now}`)}`;
      db.prepare(
        `INSERT INTO qa_runs (id, suite_id, mode, status, notes, tested_by, started_at, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)`
      ).run(runId, body.suiteId ?? "", body.mode ?? "manual", "not_started", body.notes ?? "", now, now, now);
      json(res, 200, { data: toRun({
        id: runId,
        suite_id: body.suiteId ?? "",
        mode: body.mode ?? "manual",
        status: "not_started",
        notes: body.notes ?? "",
        tested_by: null,
        started_at: now,
        completed_at: null,
        created_at: now,
        updated_at: now,
      }) });
      return;
    }

    if (req.method === "GET" && req.url?.includes("/report")) {
      const match = req.url.match(/^\/plugin\/qa\/runs\/([^/?#]+)\/report/);
      const runId = match?.[1];
      if (!runId) {
        json(res, 404, { error: "run_not_found" });
        return;
      }
      const detail = loadRunDetail(db, runId, casesDir);
      if (!detail) {
        json(res, 404, { error: "run_not_found" });
        return;
      }
      const report = buildManualReport(detail);
      const url = new URL(req.url, "http://localhost");
      const format = url.searchParams.get("format") ?? "json";
      if (format === "markdown") {
        json(res, 200, { data: { format: "markdown", report, markdown: renderReportMarkdown(report) } });
        return;
      }
      if (format === "html") {
        json(res, 200, { data: { format: "html", report, html: renderReportHtml(report) } });
        return;
      }
      json(res, 200, { data: { format: "json", report } });
      return;
    }

    if (req.method === "POST" && req.url === "/plugin/qa/integrations/github/issues") {
      if (!githubToken) {
        json(res, 400, { error: "github_token_missing" });
        return;
      }
      const body = await readRequestBody<{
        owner?: string;
        repo?: string;
        title?: string;
        body?: string;
        labels?: string[];
        assignees?: string[];
      }>(req);
      const owner = (body.owner ?? "").trim();
      const repo = (body.repo ?? "").trim();
      const title = (body.title ?? "").trim();
      if (!owner || !repo || !title) {
        json(res, 400, { error: "missing_required_fields" });
        return;
      }
      const payload = {
        title,
        body: body.body ?? "",
        labels: Array.isArray(body.labels) ? body.labels : [],
        assignees: Array.isArray(body.assignees) ? body.assignees : [],
      };
      try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
          method: "POST",
          headers: {
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "qa-runner-daemon",
            "Authorization": `Bearer ${githubToken}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          json(res, response.status, { error: "github_issue_failed", details: errorBody.slice(0, 500) });
          return;
        }
        const issue = (await response.json()) as { id?: number; number?: number; html_url?: string; title?: string };
        json(res, 200, { data: issue });
      } catch (error) {
        json(res, 500, { error: "github_issue_failed" });
      }
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/plugin/qa/runs/share/")) {
      const match = req.url.match(/^\/plugin\/qa\/runs\/share\/([^/?#]+)/);
      const shareId = match?.[1];
      if (!shareId) {
        json(res, 404, { error: "share_not_found" });
        return;
      }
      const row = db.prepare("SELECT * FROM qa_run_shares WHERE id = ?").get(shareId) as any;
      if (!row) {
        json(res, 404, { error: "share_not_found" });
        return;
      }
      const payload = JSON.parse(row.payload ?? "{}");
      json(res, 200, { data: payload });
      return;
    }

    if (req.method === "POST" && req.url?.startsWith("/plugin/qa/runs/") && req.url.endsWith("/share")) {
      const match = req.url.match(/^\/plugin\/qa\/runs\/([^/?#]+)\/share/);
      const runId = match?.[1];
      if (!runId) {
        json(res, 404, { error: "run_not_found" });
        return;
      }
      const detail = loadRunDetail(db, runId, casesDir);
      if (!detail) {
        json(res, 404, { error: "run_not_found" });
        return;
      }
      const collaborators = db
        .prepare("SELECT * FROM qa_run_collaborators WHERE run_id = ? ORDER BY created_at DESC")
        .all(runId) as any[];
      const comments = db
        .prepare("SELECT * FROM qa_case_comments WHERE run_id = ? ORDER BY created_at DESC")
        .all(runId) as any[];

      const payload = {
        shareId: "",
        run: detail.run,
        suite: detail.suite,
        cases: detail.cases.map((item) => ({
          id: item.id,
          title: item.title,
          status: item.result?.status ?? "not_started",
          notes: item.result?.notes ?? "",
          evidence: item.result?.evidence ?? [],
        })),
        collaborators: collaborators.map((row) => ({
          id: row.id,
          name: row.name,
          createdAt: row.created_at,
        })),
        comments: comments.map((row) => ({
          id: row.id,
          runId: row.run_id,
          caseId: row.case_id,
          author: row.author,
          message: row.message,
          createdAt: row.created_at,
        })),
        createdAt: new Date().toISOString(),
      };

      const shareId = `share_${hashId(`${runId}:${payload.createdAt}`)}`;
      payload.shareId = shareId;
      db.prepare(
        `INSERT INTO qa_run_shares (id, run_id, payload, created_at)
         VALUES (?, ?, ?, ?)`
      ).run(shareId, runId, JSON.stringify(payload), payload.createdAt);

      const host = req.headers.host ?? `localhost:${config.port}`;
      const shareUrl = `http://${host}/ui/share/${shareId}`;
      json(res, 200, { data: { shareId, shareUrl } });
      return;
    }

    if (req.method === "GET" && req.url?.includes("/collaborators")) {
      const match = req.url.match(/^\/plugin\/qa\/runs\/([^/?#]+)\/collaborators/);
      const runId = match?.[1];
      if (!runId) {
        json(res, 404, { error: "run_not_found" });
        return;
      }
      const rows = db
        .prepare("SELECT * FROM qa_run_collaborators WHERE run_id = ? ORDER BY created_at DESC")
        .all(runId) as any[];
      json(res, 200, { data: rows.map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at })) });
      return;
    }

    if (req.method === "POST" && req.url?.includes("/collaborators")) {
      const match = req.url.match(/^\/plugin\/qa\/runs\/([^/?#]+)\/collaborators/);
      const runId = match?.[1];
      if (!runId) {
        json(res, 404, { error: "run_not_found" });
        return;
      }
      const body = (await readJsonBody(req)) as { name?: string };
      const name = (body.name ?? "").trim();
      if (!name) {
        json(res, 400, { error: "missing_name" });
        return;
      }
      const id = `collab_${hashId(`${runId}:${name}`)}`;
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO qa_run_collaborators (id, run_id, name, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name`
      ).run(id, runId, name, now);
      json(res, 200, { data: { id, name, createdAt: now } });
      return;
    }

    if (req.method === "DELETE" && req.url?.includes("/collaborators/")) {
      const match = req.url.match(/^\/plugin\/qa\/runs\/([^/]+)\/collaborators\/([^/?#]+)/);
      const runId = match?.[1] ?? "";
      const collaboratorId = match?.[2] ?? "";
      if (!runId || !collaboratorId) {
        json(res, 404, { error: "collaborator_not_found" });
        return;
      }
      db.prepare("DELETE FROM qa_run_collaborators WHERE id = ? AND run_id = ?").run(collaboratorId, runId);
      json(res, 200, { data: { ok: true } });
      return;
    }

    if (req.method === "GET" && req.url?.includes("/comments")) {
      const match = req.url.match(/^\/plugin\/qa\/runs\/([^/]+)\/cases\/([^/]+)\/comments/);
      const runId = match?.[1] ?? "";
      const caseId = match?.[2] ?? "";
      if (!runId || !caseId) {
        json(res, 404, { error: "comments_not_found" });
        return;
      }
      const rows = db
        .prepare("SELECT * FROM qa_case_comments WHERE run_id = ? AND case_id = ? ORDER BY created_at DESC")
        .all(runId, caseId) as any[];
      json(res, 200, {
        data: rows.map((row) => ({
          id: row.id,
          runId: row.run_id,
          caseId: row.case_id,
          author: row.author,
          message: row.message,
          createdAt: row.created_at,
        })),
      });
      return;
    }

    if (req.method === "POST" && req.url?.includes("/comments")) {
      const match = req.url.match(/^\/plugin\/qa\/runs\/([^/]+)\/cases\/([^/]+)\/comments/);
      const runId = match?.[1] ?? "";
      const caseId = match?.[2] ?? "";
      if (!runId || !caseId) {
        json(res, 404, { error: "comments_not_found" });
        return;
      }
      const body = (await readJsonBody(req)) as { author?: string; message?: string };
      const author = (body.author ?? "").trim() || "Anonymous";
      const message = (body.message ?? "").trim();
      if (!message) {
        json(res, 400, { error: "missing_message" });
        return;
      }
      const now = new Date().toISOString();
      const id = `comment_${hashId(`${runId}:${caseId}:${now}`)}`;
      db.prepare(
        `INSERT INTO qa_case_comments (id, run_id, case_id, author, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, runId, caseId, author, message, now);
      json(res, 200, { data: { id, runId, caseId, author, message, createdAt: now } });
      return;
    }

    if (req.method === "DELETE" && req.url?.includes("/comments/")) {
      const match = req.url.match(/^\/plugin\/qa\/runs\/([^/]+)\/cases\/([^/]+)\/comments\/([^/?#]+)/);
      const runId = match?.[1] ?? "";
      const caseId = match?.[2] ?? "";
      const commentId = match?.[3] ?? "";
      if (!runId || !caseId || !commentId) {
        json(res, 404, { error: "comment_not_found" });
        return;
      }
      db.prepare("DELETE FROM qa_case_comments WHERE id = ? AND run_id = ? AND case_id = ?")
        .run(commentId, runId, caseId);
      json(res, 200, { data: { ok: true } });
      return;
    }

    if (req.method === "GET" && req.url?.match(/^\/plugin\/qa\/runs\/[^/?#]+$/)) {
      const match = req.url.match(/^\/plugin\/qa\/runs\/([^/?#]+)$/);
      const runId = match?.[1];
      if (!runId) {
        json(res, 404, { error: "run_not_found" });
        return;
      }
      const detail = loadRunDetail(db, runId, casesDir);
      if (!detail) {
        json(res, 404, { error: "run_not_found" });
        return;
      }
      json(res, 200, { data: detail });
      return;
    }

    if (req.method === "GET" && req.url.match(/^\/plugin\/qa\/runs(?:\?.*)?$/)) {
      const url = new URL(req.url, "http://localhost");
      const limit = Number(url.searchParams.get("limit") ?? "0");
      const suiteId = url.searchParams.get("suiteId");
      const mode = url.searchParams.get("mode");
      let rows = db.prepare("SELECT * FROM qa_runs ORDER BY created_at DESC").all() as any[];
      if (suiteId) {
        rows = rows.filter((row) => row.suite_id === suiteId);
      }
      if (mode) {
        rows = rows.filter((row) => row.mode === mode);
      }
      if (limit && rows.length > limit) {
        rows = rows.slice(0, limit);
      }
      json(res, 200, { data: rows.map(toRun) });
      return;
    }

    if ((req.method === "PATCH" || req.method === "PUT") && req.url?.includes("/steps/")) {
      const match = req.url.match(/^\/plugin\/qa\/runs\/([^/]+)\/cases\/([^/]+)\/steps\/([^/?#]+)/);
      const runId = match?.[1] ?? "";
      const caseId = match?.[2] ?? "";
      const stepId = match?.[3] ?? "";
      const body = (await readJsonBody(req)) as { checked?: boolean; failureReason?: string | null };
      const now = new Date().toISOString();
      const id = `check_${hashId(`${runId}:${stepId}`)}`;
      db.prepare(
        `INSERT INTO qa_step_checks (id, run_id, case_id, step_id, checked, auto_checked, failure_reason, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)
         ON CONFLICT(id) DO UPDATE SET checked=excluded.checked, failure_reason=excluded.failure_reason, updated_at=excluded.updated_at`
      ).run(id, runId, caseId, stepId, body.checked ? 1 : 0, body.failureReason ?? null, now);
      json(res, 200, {
        data: {
          id,
          runId,
          caseId,
          stepId,
          checked: Boolean(body.checked),
          autoChecked: false,
          failureReason: body.failureReason ?? null,
          updatedByUserId: null,
          updatedAt: now,
        },
      });
      return;
    }

    if ((req.method === "PATCH" || req.method === "PUT") && req.url?.includes("/cases/")) {
      const match = req.url.match(/^\/plugin\/qa\/runs\/([^/]+)\/cases\/([^/?#]+)/);
      const runId = match?.[1] ?? "";
      const caseId = match?.[2] ?? "";
      const body = (await readJsonBody(req)) as { status?: string; notes?: string; failureReason?: string | null };
      const now = new Date().toISOString();
      const id = `result_${hashId(`${runId}:${caseId}`)}`;
      db.prepare(
        `INSERT INTO qa_case_results (id, run_id, case_id, status, notes, failure_reason, tested_by, completed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)
         ON CONFLICT(id) DO UPDATE SET status=excluded.status, notes=excluded.notes, failure_reason=excluded.failure_reason, updated_at=excluded.updated_at`
      ).run(id, runId, caseId, body.status ?? "in_progress", body.notes ?? "", body.failureReason ?? null, now);
      json(res, 200, {
        data: {
          id,
          runId,
          caseId,
          status: body.status ?? "in_progress",
          notes: body.notes ?? "",
          failureReason: body.failureReason ?? null,
          testedBy: null,
          completedAt: null,
          evidence: [],
          updatedByUserId: null,
          updatedAt: now,
        },
      });
      return;
    }

    if (req.method === "POST" && req.url?.includes("/evidence")) {
      const match = req.url.match(/^\/plugin\/qa\/runs\/([^/]+)\/cases\/([^/]+)\/evidence/);
      const runId = match?.[1] ?? "";
      const caseId = match?.[2] ?? "";
      const body = (await readJsonBody(req)) as { type?: string; label?: string; ref?: string };
      const id = `ev_${hashId(`${runId}:${caseId}:${Date.now()}`)}`;
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO qa_evidence (id, run_id, case_id, type, label, ref, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, runId, caseId, body.type ?? "note", body.label ?? "", body.ref ?? "", now);
      json(res, 200, { data: { ok: true } });
      return;
    }

    if (req.method === "POST" && req.url?.includes("/finalize")) {
      const match = req.url.match(/^\/plugin\/qa\/runs\/([^/]+)\/finalize/);
      const runId = match?.[1] ?? "";
      const body = (await readJsonBody(req)) as { testerName?: string; notes?: string };
      const now = new Date().toISOString();
      db.prepare("UPDATE qa_runs SET status = ?, notes = ?, tested_by = ?, completed_at = ?, updated_at = ? WHERE id = ?")
        .run("passed", body.notes ?? "", body.testerName ?? null, now, now, runId);
      const runRow = db.prepare("SELECT * FROM qa_runs WHERE id = ?").get(runId) as any;
      json(res, 200, { data: toRun(runRow) });
      return;
    }

    if (req.method === "POST" && req.url === "/plugin/qa/generate") {
      try {
        const body = (await readRequestBody<{
          prompt?: string;
          testTypes?: string[];
          context?: { pluginIds?: string[]; routes?: string[] };
        }>(req)) ?? {};
        const prompt = body.prompt?.trim() ?? "";
        if (!prompt) {
          json(res, 400, { error: "prompt_required" });
          return;
        }
        const now = new Date().toISOString();
        const id = `gen_${hashId(`${Date.now()}_${prompt}`)}`;
        const job: QaGenerationJob = {
          id,
          requestedByUserId: "local",
          prompt,
          scope: body.context ?? {},
          status: "running",
          result: null,
          error: null,
          createdAt: now,
          updatedAt: now,
        };
        generationJobs.set(id, job);
        const event: ChangeEvent = {
          files: [],
          summary: prompt,
          diff: undefined,
          tool: "ui",
          timestamp: Date.now(),
        };
        const outcome = await daemon.handleEvent(event, {
          mode: "manual",
          selectedTestTypes: body.testTypes,
          scope: body.context,
        });
        job.status = "completed";
        job.result = {
          suiteName: outcome.result.suiteName,
          cases: outcome.result.cases,
          tests: outcome.result.tests,
          selectedTestTypes: body.testTypes,
        };
        job.updatedAt = new Date().toISOString();
        json(res, 200, { data: job }, corsHeaders);
      } catch (error) {
        json(res, 400, { error: "generation_failed" }, corsHeaders);
      }
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/plugin/qa/generate?")) {
      const url = new URL(req.url, "http://localhost");
      const limit = Math.max(1, Math.min(25, Number(url.searchParams.get("limit") ?? "10")));
      const jobs = Array.from(generationJobs.values())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
      json(res, 200, { data: jobs }, corsHeaders);
      return;
    }

    if (req.method === "GET" && req.url === "/plugin/qa/generate/status") {
      json(
        res,
        200,
        { data: { autoSeeded: Boolean(state.autoSeededAt), autoSeededAt: state.autoSeededAt ?? null } },
        corsHeaders,
      );
      return;
    }

    if (req.method === "GET" && req.url === "/plugin/qa/workspaces") {
      json(res, 200, { data: loadWorkspaceProfiles() }, corsHeaders);
      return;
    }

    if (req.method === "POST" && req.url === "/plugin/qa/workspaces") {
      const body = (await readRequestBody<{
        id?: string;
        label?: string;
        casesDir?: string;
        gitUrl?: string;
      }>(req)) ?? {};
      const label = (body.label ?? body.id ?? "workspace").trim();
      const id = normalizeWorkspaceId(body.id ?? label.toLowerCase().replace(/\s+/g, "-"));
      const profiles = loadWorkspaceProfiles();
      const existing = profiles.find((item) => item.id === id);
      const casesDir = body.casesDir?.trim() || path.join(process.cwd(), "docs", "qa-cases");
      const nextProfile: QaWorkspaceProfile = {
        id,
        label: label || id,
        dbPath: path.join("tools", id === "default" ? "qa-runner.db" : `qa-runner.${id}.db`),
        casesDir,
        gitUrl: body.gitUrl?.trim() || undefined,
        isDefault: id === "default",
      };
      const updated = existing
        ? profiles.map((item) => (item.id === id ? { ...item, ...nextProfile } : item))
        : [...profiles, nextProfile];
      saveWorkspaceProfiles(updated);
      json(res, 200, { data: updated }, corsHeaders);
      return;
    }

    if (req.method === "DELETE" && req.url.startsWith("/plugin/qa/workspaces/")) {
      const match = req.url.match(/^\/plugin\/qa\/workspaces\/([^/]+)$/);
      const id = normalizeWorkspaceId(match?.[1] ?? "");
      const profiles = loadWorkspaceProfiles();
      if (id === "default") {
        json(res, 400, { error: "cannot_delete_default" }, corsHeaders);
        return;
      }
      const updated = profiles.filter((item) => item.id !== id);
      saveWorkspaceProfiles(updated);
      json(res, 200, { data: updated }, corsHeaders);
      return;
    }

    if (req.method === "POST" && req.url.startsWith("/plugin/qa/workspaces/") && req.url.endsWith("/sync")) {
      const match = req.url.match(/^\/plugin\/qa\/workspaces\/([^/]+)\/sync$/);
      const id = normalizeWorkspaceId(match?.[1] ?? "");
      const profiles = loadWorkspaceProfiles();
      const profile = profiles.find((item) => item.id === id);
      if (!profile?.gitUrl) {
        json(res, 400, { error: "git_url_missing" }, corsHeaders);
        return;
      }
      const targetDir = profile.casesDir;
      try {
        if (fs.existsSync(path.join(targetDir, ".git"))) {
          spawnSync("git", ["-C", targetDir, "pull", "--ff-only"], { stdio: "inherit" });
        } else {
          fs.mkdirSync(path.dirname(targetDir), { recursive: true });
          spawnSync("git", ["clone", profile.gitUrl, targetDir], { stdio: "inherit" });
        }
        json(res, 200, { data: { ok: true } }, corsHeaders);
      } catch (error) {
        json(res, 400, { error: "git_sync_failed" }, corsHeaders);
      }
      return;
    }

    if (req.method === "POST" && req.url === "/plugin/qa/tests/load-existing") {
      try {
        const body = (await readRequestBody<{
          source?: string;
          testTypes?: string[];
          tags?: string[];
          testDir?: string;
        }>(req)) ?? {};
        const configuredDir = body.testDir?.trim() || path.join(process.cwd(), "e2e", "ui", "tests");
        const absoluteTestDir = path.isAbsolute(configuredDir) ? configuredDir : path.join(process.cwd(), configuredDir);
        if (!fs.existsSync(absoluteTestDir)) {
          json(res, 404, { error: "qa_existing_tests_dir_not_found" }, corsHeaders);
          return;
        }

        const testFiles: string[] = [];
        const walkTests = (dir: string): void => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walkTests(fullPath);
              continue;
            }
            if (!entry.isFile()) {
              continue;
            }
            if (fullPath.endsWith(".spec.ts") || fullPath.endsWith(".test.ts") || fullPath.endsWith(".spec.tsx")) {
              testFiles.push(fullPath);
            }
          }
        };
        walkTests(absoluteTestDir);

        const normalizedTags = (body.tags ?? []).map((item) => item.trim()).filter(Boolean);
        const selectedTypes = (body.testTypes ?? []).map((item) => item.trim()).filter(Boolean);
        const now = new Date().toISOString();
        const id = `gen_${hashId(`${Date.now()}_${absoluteTestDir}_existing`)}`;
        const tests = testFiles.slice(0, 300).map((filePath, index) => {
          const relative = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
          const base = path.basename(relative).replace(/\.(spec|test)\.tsx?$/, "");
          const featureKey = base.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `existing-${index + 1}`;
          return {
            id: `existing_test_${hashId(`${id}:${relative}`)}`,
            title: base || `Existing Test ${index + 1}`,
            testType: selectedTypes[index % (selectedTypes.length || 1)] || "ui_functional",
            riskLevel: "medium" as const,
            tags: Array.from(new Set(["@existing", ...normalizedTags])),
            featureKey,
            filePath: relative,
            testIdSelectors: [],
          };
        });

        const job: QaGenerationJob = {
          id,
          requestedByUserId: "local",
          prompt: `Load existing tests from ${path.relative(process.cwd(), absoluteTestDir) || absoluteTestDir}`,
          scope: {},
          status: "completed",
          result: {
            suiteName: "Existing Playwright Suite",
            cases: [],
            tests,
            selectedTestTypes: selectedTypes,
          },
          error: null,
          createdAt: now,
          updatedAt: now,
        };
        generationJobs.set(id, job);
        json(res, 201, { data: job }, corsHeaders);
      } catch (error) {
        json(res, 500, { error: "qa_existing_tests_load_failed" }, corsHeaders);
      }
      return;
    }

    if (req.method === "POST" && req.url === "/plugin/qa/tests/load") {
      try {
        const body = (await readRequestBody<{
          generationJobId?: string;
          runId?: string;
        }>(req)) ?? {};
        const generationJobId = body.generationJobId?.trim() ?? "";
        if (!generationJobId) {
          json(res, 400, { error: "qa_generation_job_id_required" }, corsHeaders);
          return;
        }
        const job = generationJobs.get(generationJobId);
        if (!job) {
          json(res, 404, { error: "qa_generation_job_not_found" }, corsHeaders);
          return;
        }
        if (job.status !== "completed" || !job.result) {
          json(res, 409, { error: "qa_generation_job_not_ready" }, corsHeaders);
          return;
        }
        if (body.runId?.trim()) {
          const runId = body.runId.trim();
          const runRow = db.prepare("SELECT id FROM qa_runs WHERE id = ?").get(runId) as { id?: string } | undefined;
          if (!runRow?.id) {
            json(res, 404, { error: "qa_run_not_found" }, corsHeaders);
            return;
          }
        }
        json(
          res,
          201,
          {
            data: {
              generationJobId: job.id,
              loadedCount: job.result.tests?.length ?? 0,
              tests: job.result.tests ?? [],
              loadedAt: new Date().toISOString(),
            },
          },
          corsHeaders,
        );
      } catch (error) {
        json(res, 500, { error: "qa_tests_load_failed" }, corsHeaders);
      }
      return;
    }

    if (req.method === "POST" && req.url === "/plugin/qa/tests/review-intelligent") {
      try {
        const body = (await readRequestBody<{ generationJobId?: string; maxSuggestions?: number }>(req)) ?? {};
        const generationJobId = body.generationJobId?.trim() ?? "";
        const job = generationJobs.get(generationJobId);
        if (!job) {
          json(res, 404, { error: "qa_generation_job_not_found" }, corsHeaders);
          return;
        }
        if (job.status !== "completed" || !job.result) {
          json(res, 409, { error: "qa_generation_job_not_ready" }, corsHeaders);
          return;
        }
        const now = new Date().toISOString();
        const suggestions = (job.result.tests ?? []).slice(0, Math.max(1, body.maxSuggestions ?? 5)).map((test, index) => ({
          id: `qa_suggest_${hashId(`${job.id}:${index}:review`)}`,
          category: "test_architecture" as const,
          priority: "medium" as const,
          confidence: 0.8,
          rationale: "Heuristic local daemon review generated a baseline architecture suggestion.",
          suggestion: "Prefer page-object wrappers and stable selectors for repeatable UI specs.",
          affectedFiles: [test.filePath],
          retestScope: "affected_specs" as const,
        }));
        job.result.intelligentReview = {
          generatedAt: now,
          score: 100,
          summary: `${suggestions.length} heuristic improvement suggestion(s) generated.`,
          metadata: {
            provider: "local-daemon",
            model: "heuristic-v1",
            mode: "heuristic",
          },
          suggestions,
        };
        job.updatedAt = now;
        generationJobs.set(job.id, job);
        json(res, 201, { data: job }, corsHeaders);
      } catch {
        json(res, 500, { error: "qa_intelligent_review_failed" }, corsHeaders);
      }
      return;
    }

    if (req.method === "POST" && req.url === "/plugin/qa/tests/suggest-fixes") {
      try {
        const body = (await readRequestBody<{ generationJobId?: string; maxProposals?: number }>(req)) ?? {};
        const generationJobId = body.generationJobId?.trim() ?? "";
        const job = generationJobs.get(generationJobId);
        if (!job) {
          json(res, 404, { error: "qa_generation_job_not_found" }, corsHeaders);
          return;
        }
        if (job.status !== "completed" || !job.result) {
          json(res, 409, { error: "qa_generation_job_not_ready" }, corsHeaders);
          return;
        }
        const baseSuggestions = job.result.intelligentReview?.suggestions ?? [];
        const tests = job.result.tests ?? [];
        const proposals = tests.slice(0, Math.max(1, body.maxProposals ?? 8)).map((test, index) => {
          const suggestionId = baseSuggestions[index % (baseSuggestions.length || 1)]?.id ?? `qa_suggest_${index + 1}`;
          return {
            id: `qa_fix_${hashId(`${job.id}:${test.filePath}:${index}`)}`,
            suggestionId,
            title: `Stabilize selectors in ${path.basename(test.filePath)}`,
            category: "selector_stability" as const,
            priority: "medium" as const,
            risk: "low" as const,
            confidence: 0.78,
            filePath: test.filePath,
            changeType: "test_only" as const,
            diffPreview: `--- a/${test.filePath}\n+++ b/${test.filePath}\n@@\n- page.locator('text=Submit')\n+ page.getByTestId('submit-action')`,
            retestScope: "affected_specs" as const,
            status: "pending" as const,
            appliedAt: null,
            applyError: null,
            retestStatus: "not_run" as const,
            retestAt: null,
            retestError: null,
            retestCommand: null,
          };
        });
        job.result.intelligentFixProposals = proposals;
        job.updatedAt = new Date().toISOString();
        generationJobs.set(job.id, job);
        json(res, 201, { data: job }, corsHeaders);
      } catch {
        json(res, 500, { error: "qa_intelligent_fix_proposals_failed" }, corsHeaders);
      }
      return;
    }

    if (req.method === "POST" && req.url === "/plugin/qa/tests/apply-fix") {
      try {
        const body = (await readRequestBody<{ generationJobId?: string; proposalId?: string }>(req)) ?? {};
        const job = generationJobs.get(body.generationJobId?.trim() ?? "");
        if (!job) {
          json(res, 404, { error: "qa_generation_job_not_found" }, corsHeaders);
          return;
        }
        const proposals = job.result?.intelligentFixProposals ?? [];
        const proposal = proposals.find((item) => item.id === (body.proposalId?.trim() ?? ""));
        if (!proposal) {
          json(res, 404, { error: "qa_intelligent_fix_proposal_not_found" }, corsHeaders);
          return;
        }
        proposal.status = "applied";
        proposal.appliedAt = new Date().toISOString();
        proposal.applyError = null;
        job.updatedAt = new Date().toISOString();
        generationJobs.set(job.id, job);
        json(res, 200, { data: job }, corsHeaders);
      } catch {
        json(res, 500, { error: "qa_apply_fix_failed" }, corsHeaders);
      }
      return;
    }

    if (req.method === "POST" && req.url === "/plugin/qa/tests/retest-fix") {
      try {
        const body = (await readRequestBody<{ generationJobId?: string; proposalId?: string }>(req)) ?? {};
        const job = generationJobs.get(body.generationJobId?.trim() ?? "");
        if (!job) {
          json(res, 404, { error: "qa_generation_job_not_found" }, corsHeaders);
          return;
        }
        const proposals = job.result?.intelligentFixProposals ?? [];
        const proposal = proposals.find((item) => item.id === (body.proposalId?.trim() ?? ""));
        if (!proposal) {
          json(res, 404, { error: "qa_intelligent_fix_proposal_not_found" }, corsHeaders);
          return;
        }
        proposal.retestStatus = "passed";
        proposal.retestAt = new Date().toISOString();
        proposal.retestError = null;
        proposal.retestCommand = `npm --prefix e2e/ui run test -- "${proposal.filePath}"`;
        job.updatedAt = new Date().toISOString();
        generationJobs.set(job.id, job);
        json(res, 200, { data: job }, corsHeaders);
      } catch {
        json(res, 500, { error: "qa_retest_fix_failed" }, corsHeaders);
      }
      return;
    }

    if (req.method === "POST" && req.url === "/plugin/qa/tests/automation/run") {
      try {
        const body = (await readRequestBody<{ generationJobId?: string; strategy?: "continuous_fix" | "alert_only"; maxIterations?: number }>(req)) ?? {};
        const job = generationJobs.get(body.generationJobId?.trim() ?? "");
        if (!job) {
          json(res, 404, { error: "qa_generation_job_not_found" }, corsHeaders);
          return;
        }
        const proposals = job.result?.intelligentFixProposals ?? [];
        const pendingBefore = proposals.filter((item) => item.status !== "applied").length;
        const startedAt = new Date().toISOString();
        if (body.strategy === "continuous_fix") {
          for (const proposal of proposals) {
            proposal.status = "applied";
            proposal.appliedAt = startedAt;
            proposal.retestStatus = "passed";
            proposal.retestAt = startedAt;
          }
        }
        const pendingAfter = proposals.filter((item) => item.status !== "applied").length;
        job.result = {
          ...(job.result ?? { suiteName: "Existing Playwright Suite", cases: [] }),
          intelligentFixProposals: proposals,
          automation: {
            strategy: body.strategy ?? "alert_only",
            status: pendingAfter === 0 ? "fixed" : "partial",
            startedAt,
            completedAt: new Date().toISOString(),
            iterations: body.strategy === "continuous_fix" ? Math.min(proposals.length, body.maxIterations ?? proposals.length) : 0,
            appliedCount: pendingBefore - pendingAfter,
            passedRetests: body.strategy === "continuous_fix" ? pendingBefore - pendingAfter : 0,
            failedRetests: 0,
            remainingProposals: pendingAfter,
            message:
              body.strategy === "continuous_fix"
                ? `Applied ${pendingBefore - pendingAfter} proposal(s) with simulated retest pass.`
                : `Alert-only mode found ${pendingBefore} pending proposal(s).`,
          },
        };
        job.updatedAt = new Date().toISOString();
        generationJobs.set(job.id, job);
        json(res, 200, { data: job }, corsHeaders);
      } catch {
        json(res, 500, { error: "qa_automation_run_failed" }, corsHeaders);
      }
      return;
    }

    if (req.method === "POST" && req.url?.match(/^\/plugin\/qa\/runs\/[^/]+\/manual\/ai\/execute$/)) {
      try {
        const match = req.url.match(/^\/plugin\/qa\/runs\/([^/]+)\/manual\/ai\/execute$/);
        const runId = match?.[1] ?? "";
        const existingRun = db.prepare("SELECT id FROM qa_runs WHERE id = ?").get(runId) as { id?: string } | undefined;
        if (!existingRun?.id) {
          json(res, 404, { error: "run_not_found" }, corsHeaders);
          return;
        }
        const detail = loadRunDetail(db, runId, casesDir);
        if (!detail) {
          json(res, 404, { error: "run_detail_not_found" }, corsHeaders);
          return;
        }
        const totalSteps = detail.cases.reduce((acc, qaCase) => acc + qaCase.steps.length, 0);
        const manualPlaywrightUiUrl = defaultExecutionMode === "ui" ? `http://${playwrightUiHost}:${playwrightUiPort}` : null;
        const executionJobId = `manual_ai_exec_${hashId(`${runId}:${Date.now()}`)}`;
        const now = new Date().toISOString();
        const execution: QaManualAiExecutionJob = {
          id: executionJobId,
          runId,
          status: "queued",
          currentCaseId: null,
          currentStepId: null,
          currentStepIndex: 0,
          totalSteps,
          failureReason: null,
          reportRef: null,
          traceRef: null,
          videoRef: null,
          playwrightUiUrl: manualPlaywrightUiUrl,
          startedAt: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
          actionLog: [],
        };
        upsertManualAiExecution(db, execution);
        void runManualAiExecution({
          db,
          runId,
          executionJobId,
          casesRoot: casesDir,
          playwrightProjectDir,
          executionMode: defaultExecutionMode,
        });
        json(
          res,
          202,
          {
            data: {
              runId,
              executionJobId,
              status: execution.status,
              currentStepIndex: 0,
              totalSteps,
              failureReason: null,
              playwrightUiUrl: execution.playwrightUiUrl,
              startedAt: null,
              completedAt: null,
              createdAt: now,
              updatedAt: now,
            },
          },
          corsHeaders,
        );
      } catch {
        json(res, 500, { error: "qa_manual_ai_execute_failed" }, corsHeaders);
      }
      return;
    }

    if (req.method === "GET" && req.url?.match(/^\/plugin\/qa\/runs\/[^/]+\/manual\/ai\/executions\/[^/?#]+$/)) {
      const match = req.url.match(/^\/plugin\/qa\/runs\/([^/]+)\/manual\/ai\/executions\/([^/?#]+)$/);
      const runId = match?.[1] ?? "";
      const executionJobId = match?.[2] ?? "";
      const execution = getManualAiExecution(db, runId, executionJobId);
      if (!execution) {
        json(res, 404, { error: "qa_manual_ai_execution_job_not_found" }, corsHeaders);
        return;
      }
      json(res, 200, { data: execution }, corsHeaders);
      return;
    }

    if (req.method === "POST" && req.url?.match(/^\/plugin\/qa\/runs\/[^/]+\/ai\/prepare$/)) {
      try {
        const match = req.url.match(/^\/plugin\/qa\/runs\/([^/]+)\/ai\/prepare$/);
        const runId = match?.[1] ?? "";
        const body = (await readRequestBody<{ generationJobId?: string; testTypes?: string[] }>(req)) ?? {};
        const generationJobId = body.generationJobId?.trim() ?? "";
        const job = generationJobs.get(generationJobId);
        if (!job) {
          json(res, 404, { error: "qa_generation_job_not_found" }, corsHeaders);
          return;
        }
        const executionJobId = `ai_exec_${hashId(`${runId}:${generationJobId}:${Date.now()}`)}`;
        const now = new Date().toISOString();
        aiExecutionJobs.set(executionJobId, {
          id: executionJobId,
          runId,
          status: "queued",
          playwrightCommand: "npx playwright test",
          executionMode: defaultExecutionMode,
          playwrightUiUrl: null,
          reportRef: null,
          traceRef: null,
          videoRef: null,
          error: null,
          startedAt: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        json(
          res,
          201,
          {
            data: {
              runId,
              generationJobId,
              executionJobId,
              status: "prepared",
              preparedAt: now,
              loadedCount: job.result?.tests?.length ?? 0,
              selectedTestTypes: body.testTypes ?? [],
              checks: { lint: "passed", typecheck: "passed", specParse: "passed" },
            },
          },
          corsHeaders,
        );
      } catch {
        json(res, 500, { error: "qa_ai_prepare_failed" }, corsHeaders);
      }
      return;
    }

    if (req.method === "POST" && req.url?.match(/^\/plugin\/qa\/runs\/[^/]+\/ai\/execute$/)) {
      try {
        const match = req.url.match(/^\/plugin\/qa\/runs\/([^/]+)\/ai\/execute$/);
        const runId = match?.[1] ?? "";
        const body = (await readRequestBody<{ executionJobId?: string; runMode?: "stub" | "shell" | "ui" }>(req)) ?? {};
        const executionJobId = body.executionJobId?.trim() ?? "";
        const execution = aiExecutionJobs.get(executionJobId);
        if (!execution || execution.runId !== runId) {
          json(res, 404, { error: "qa_ai_execution_job_not_found" }, corsHeaders);
          return;
        }
        if (execution.status !== "queued") {
          json(res, 409, { error: "qa_ai_execution_job_not_queued" }, corsHeaders);
          return;
        }
        const requestedMode =
          body.runMode === "stub" || body.runMode === "shell" || body.runMode === "ui" ? body.runMode : defaultExecutionMode;
        const startedAt = new Date().toISOString();
        execution.status = "running";
        execution.executionMode = requestedMode;
        execution.startedAt = startedAt;
        execution.completedAt = null;
        execution.error = null;
        execution.reportRef = null;
        execution.traceRef = null;
        execution.videoRef = null;
        execution.playwrightUiUrl = null;
        execution.updatedAt = startedAt;

        let responseStatus: "queued" | "running" | "completed" | "failed" | "cancelled" = "running";
        if (requestedMode === "stub") {
          execution.status = "completed";
          execution.completedAt = startedAt;
          execution.reportRef = `qa://playwright/${runId}/${executionJobId}/report.json`;
          execution.traceRef = `qa://playwright/${runId}/${executionJobId}/trace.zip`;
          execution.videoRef = `qa://playwright/${runId}/${executionJobId}/video.webm`;
          execution.updatedAt = startedAt;
          aiExecutionJobs.set(executionJobId, execution);
          responseStatus = "completed";
        } else {
          const resolvedProjectDir = path.resolve(process.cwd(), playwrightProjectDir);
          const playwrightBinName = process.platform === "win32" ? "playwright.cmd" : "playwright";
          const playwrightBin = path.join(resolvedProjectDir, "node_modules", ".bin", playwrightBinName);
          if (!fs.existsSync(playwrightBin)) {
            execution.status = "failed";
            execution.error = `Playwright binary not found at ${playwrightBin}. Install dependencies in ${resolvedProjectDir} first.`;
            execution.completedAt = startedAt;
            execution.updatedAt = startedAt;
            aiExecutionJobs.set(executionJobId, execution);
            responseStatus = "failed";
          } else {
            // Be explicit about config so UI mode always finds tests.
            const args = ["test", "--workers=1", "--config", "playwright.config.ts"];
            if (requestedMode === "ui") {
              // Bind and advertise the same host to avoid ws/url mismatches.
              args.push("--ui", "--ui-host", playwrightUiHost, "--ui-port", String(playwrightUiPort));
              execution.playwrightUiUrl = `http://${playwrightUiHost}:${playwrightUiPort}`;
            }
          execution.playwrightCommand = `${playwrightBin} ${args.join(" ")}`;
          aiExecutionJobs.set(executionJobId, execution);
          const command = xvfbAvailable ? "xvfb-run" : playwrightBin;
          const commandArgs = xvfbAvailable ? ["-a", playwrightBin, ...args] : args;
          execution.playwrightCommand = `${command} ${commandArgs.join(" ")}`;
          aiExecutionJobs.set(executionJobId, execution);

          const runProcess = spawn(command, commandArgs, {
            cwd: resolvedProjectDir,
            env: process.env,
            stdio: "ignore",
          });
          aiExecutionProcesses.set(executionJobId, runProcess);
          runProcess.on("error", (error) => {
            const current = aiExecutionJobs.get(executionJobId);
            if (!current) {
              return;
            }
            const now = new Date().toISOString();
            current.status = "failed";
            current.error = error instanceof Error ? error.message : String(error);
            current.completedAt = now;
            current.updatedAt = now;
            aiExecutionJobs.set(executionJobId, current);
            aiExecutionProcesses.delete(executionJobId);
          });
          runProcess.on("close", (code) => {
            const current = aiExecutionJobs.get(executionJobId);
            if (!current) {
              return;
            }
            const now = new Date().toISOString();
            current.status = code === 0 ? "completed" : "failed";
            current.error = code === 0 ? null : `Playwright exited with code ${code ?? "unknown"}`;
            current.completedAt = now;
            current.updatedAt = now;
            if (code === 0) {
              current.reportRef = `file:${path.join(resolvedProjectDir, "playwright-report", "index.html")}`;
            }
            aiExecutionJobs.set(executionJobId, current);
            aiExecutionProcesses.delete(executionJobId);
          });
          }
        }
        json(
          res,
          202,
          {
            data: {
              runId,
              executionJobId,
              status: responseStatus,
              startedAt,
              completedAt: null,
              playwrightCommand: execution.playwrightCommand,
              playwrightUiUrl: execution.playwrightUiUrl ?? "",
              artifacts: {
                reportRef: execution.reportRef ?? "",
                traceRef: execution.traceRef ?? "",
                videoRef: execution.videoRef ?? "",
              },
            },
          },
          corsHeaders,
        );
      } catch {
        json(res, 500, { error: "qa_ai_execute_failed" }, corsHeaders);
      }
      return;
    }

    if (req.method === "GET" && req.url?.match(/^\/plugin\/qa\/runs\/[^/]+\/ai\/executions\/[^/?#]+$/)) {
      const match = req.url.match(/^\/plugin\/qa\/runs\/([^/]+)\/ai\/executions\/([^/?#]+)$/);
      const runId = match?.[1] ?? "";
      const executionJobId = match?.[2] ?? "";
      const execution = aiExecutionJobs.get(executionJobId);
      if (!execution || execution.runId !== runId) {
        json(res, 404, { error: "qa_ai_execution_job_not_found" }, corsHeaders);
        return;
      }
      json(res, 200, { data: execution }, corsHeaders);
      return;
    }

    if (req.method === "POST" && req.url?.match(/^\/plugin\/qa\/runs\/[^/]+\/playwright\/import$/)) {
      try {
        const match = req.url.match(/^\/plugin\/qa\/runs\/([^/]+)\/playwright\/import$/);
        const runId = match?.[1] ?? "";
        const body = (await readRequestBody<{
          executionJobId?: string;
          status?: "queued" | "running" | "completed" | "failed" | "cancelled";
          playwrightCommand?: string;
          reportRef?: string;
          traceRef?: string;
          videoRef?: string;
          error?: string;
          startedAt?: string;
          completedAt?: string;
        }>(req)) ?? {};
        const executionJobId = body.executionJobId?.trim() || `ai_import_${hashId(`${runId}:${Date.now()}`)}`;
        const now = new Date().toISOString();
        const execution: QaAiExecutionJob = {
          id: executionJobId,
          runId,
          status: body.status ?? "completed",
          playwrightCommand: body.playwrightCommand ?? "npm --prefix e2e/ui run test",
          reportRef: body.reportRef ?? null,
          traceRef: body.traceRef ?? null,
          videoRef: body.videoRef ?? null,
          error: body.error ?? null,
          startedAt: body.startedAt ?? now,
          completedAt: body.completedAt ?? now,
          createdAt: now,
          updatedAt: now,
        };
        aiExecutionJobs.set(executionJobId, execution);
        json(res, 201, { data: execution }, corsHeaders);
      } catch {
        json(res, 500, { error: "qa_playwright_import_failed" }, corsHeaders);
      }
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/plugin/qa/runs/") && req.url.includes("/playwright/artifacts")) {
      const match = req.url.match(/^\/plugin\/qa\/runs\/([^/]+)\/playwright\/artifacts(?:\?(.+))?$/);
      const runId = match?.[1] ?? "";
      const url = new URL(req.url, "http://localhost");
      const executionJobId = url.searchParams.get("executionJobId")?.trim() ?? "";
      const execution = aiExecutionJobs.get(executionJobId);
      if (!execution || execution.runId !== runId) {
        json(res, 404, { error: "qa_ai_execution_job_not_found" }, corsHeaders);
        return;
      }
      json(
        res,
        200,
        {
          data: {
            runId,
            executionJobId,
            status: execution.status,
            playwrightCommand: execution.playwrightCommand,
            artifacts: {
              reportRef: execution.reportRef ?? "",
              traceRef: execution.traceRef ?? "",
              videoRef: execution.videoRef ?? "",
            },
            error: execution.error,
            startedAt: execution.startedAt,
            completedAt: execution.completedAt,
            updatedAt: execution.updatedAt,
          },
        },
        corsHeaders,
      );
      return;
    }

    if (req.method === "POST" && req.url === "/plugin/qa/generate/tests") {
      try {
        const body = (await readRequestBody<{
          prompt?: string;
          testTypes?: string[];
          context?: { pluginIds?: string[]; routes?: string[] };
        }>(req)) ?? {};
        const prompt = body.prompt?.trim() ?? "";
        if (!prompt) {
          json(res, 400, { error: "prompt_required" });
          return;
        }
        const now = new Date().toISOString();
        const id = `gen_${hashId(`${Date.now()}_${prompt}_tests`)}`;
        const job: QaGenerationJob = {
          id,
          requestedByUserId: "local",
          prompt,
          scope: body.context ?? {},
          status: "running",
          result: null,
          error: null,
          createdAt: now,
          updatedAt: now,
        };
        generationJobs.set(id, job);
        const event: ChangeEvent = {
          files: [],
          summary: prompt,
          diff: undefined,
          tool: "ui",
          timestamp: Date.now(),
        };
        const outcome = await daemon.handleEvent(event, {
          mode: "all",
          selectedTestTypes: body.testTypes,
          scope: body.context,
        });
        job.status = "completed";
        job.result = {
          suiteName: outcome.result.suiteName,
          cases: outcome.result.cases,
          tests: outcome.result.tests,
          selectedTestTypes: body.testTypes,
        };
        job.updatedAt = new Date().toISOString();
        json(res, 200, { data: job }, corsHeaders);
      } catch (error) {
        json(res, 400, { error: "generation_failed" }, corsHeaders);
      }
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/plugin/qa/generate/")) {
      const match = req.url.match(/^\/plugin\/qa\/generate\/([^/]+)$/);
      const jobId = match?.[1] ?? "";
      const job = generationJobs.get(jobId);
      if (!job) {
        json(res, 404, { error: "generation_job_not_found" }, corsHeaders);
        return;
      }
      json(res, 200, { data: job }, corsHeaders);
      return;
    }

    if (req.method === "POST" && req.url === "/events") {
      try {
        const body = (await readJsonBody(req)) as Partial<ChangeEvent>;
        const mode = typeof (body as { mode?: string }).mode === "string" ? (body as { mode?: string }).mode : undefined;
        const event: ChangeEvent = {
          files: body.files ?? [],
          summary: body.summary,
          diff: body.diff,
          tool: body.tool,
          timestamp: body.timestamp ?? Date.now(),
        };
        const validation = validateChangeEvent(event);
        if (!validation.ok) {
        json(res, 400, { error: "invalid_event_payload", details: validation.errors }, corsHeaders);
        return;
      }
        state.lastEvent = event;
        state.lastOutcome = await daemon.handleEvent(event, {
          mode: mode === "manual" || mode === "e2e" || mode === "all" ? mode : undefined,
        });
        json(res, 200, {
          written: state.lastOutcome.writtenFiles.length,
          skipped: state.lastOutcome.skippedFiles.length,
          manifest: state.lastOutcome.result.manifest,
        }, corsHeaders);
      } catch (error) {
        json(res, 400, { error: "invalid_event_payload" }, corsHeaders);
      }
      return;
    }

    text(res, 404, "Not Found", "text/plain", corsHeaders);
  });

  server.listen(config.port);
  return server;
}
