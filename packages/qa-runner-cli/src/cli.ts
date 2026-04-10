#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { QaRunnerDaemon, startDaemonServer, startWatcher } from "./daemon/index.js";
import type { ChangeEvent } from "./core/index.js";
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
  const validateHealingRate = parseRatePercent(parseFlag("--validate-healing-rate"));
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
  };
  if (validateManualCases) {
    console.log("qa-runner manual case validation mode enabled (QA_RUNNER_VALIDATE_MANUAL_CASES=1)");
  }
  const result = spawnSync(cmd, cmdArgs, { stdio: "inherit", env });
  let exitCode = result.status ?? 1;

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
