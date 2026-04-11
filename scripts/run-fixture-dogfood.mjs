import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const fixtureName = process.argv[2];
if (!fixtureName || !["node-api", "react-web"].includes(fixtureName)) {
  console.error("Usage: node scripts/run-fixture-dogfood.mjs <node-api|react-web>");
  process.exit(1);
}

const fixtureRoot = path.join(repoRoot, "fixtures", fixtureName);
const appPort = fixtureName === "node-api" ? 3101 : 3102;
const daemonPort = fixtureName === "node-api" ? 4551 : 4552;
const appReadyPath = fixtureName === "node-api" ? "/health" : "/";

const run = (cmd, args, options = {}) => {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd || repoRoot,
    stdio: "inherit",
    env: { ...process.env, ...(options.env || {}) },
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed with status ${result.status}`);
  }
};

const runJson = (cmd, args, options = {}) => {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd || repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf-8",
  });
  if ((result.status ?? 1) !== 0) {
    process.stderr.write(result.stderr || "");
    throw new Error(`${cmd} ${args.join(" ")} failed with status ${result.status}`);
  }
  return result.stdout;
};

const waitHttp = async (url, timeoutMs = 30000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const pollManualExecution = async (runId, executionJobId) => {
  const started = Date.now();
  while (Date.now() - started < 60000) {
    const response = await fetch(`http://127.0.0.1:${daemonPort}/plugin/qa/runs/${runId}/manual/ai/executions/${executionJobId}`);
    const payload = await response.json();
    const status = payload?.data?.status;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      return payload.data;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error("Timed out waiting for manual AI execution completion");
};

const ensureDependencies = () => {
  run("npm", ["install"], { cwd: fixtureRoot });
  run("npm", ["install"], { cwd: path.join(fixtureRoot, "e2e", "ui") });
  run("npx", ["playwright", "install", "chromium"], { cwd: path.join(fixtureRoot, "e2e", "ui") });
};

const installPackageTarball = () => {
  const output = runJson("npm", ["pack", "--json"], { cwd: path.join(repoRoot, "packages", "qa-runner-cli") });
  const parsed = JSON.parse(output);
  const packedFile = parsed?.[0]?.filename;
  if (!packedFile) {
    throw new Error("npm pack did not return filename");
  }
  const tarballPath = path.join(repoRoot, "packages", "qa-runner-cli", packedFile);
  run("npm", ["install", tarballPath], { cwd: fixtureRoot });
  fs.rmSync(tarballPath, { force: true });
};

const runGenerateAndTest = () => {
  const summary = `Dogfood ${fixtureName} fixture with qa-runner generation, auto-testing, self-healing, and flakiness tracking.`;
  const files = fixtureName === "node-api" ? "src/server.js" : "src/main.jsx";
  run("npx", ["qa-runner", "generate", "--summary", summary, "--files", files, "--mode", "all", "--env", "stage", "--auto-test", "--healing=moderate"], { cwd: fixtureRoot });
  run("npx", ["qa-runner", "test", "--env", "stage", "--auto-test", "--healing=moderate", "--report-healing-stats"], {
    cwd: fixtureRoot,
    env: {
      APP_BASE_URL: `http://127.0.0.1:${appPort}`,
    },
  });
};

const runManualAiFlow = async () => {
  const suitesResp = await fetch(`http://127.0.0.1:${daemonPort}/plugin/qa/suites`);
  const suitesJson = await suitesResp.json();
  const suites = suitesJson?.data || [];
  const preferredName = fixtureName === "node-api" ? "Node Fixture Login Suite" : "React Fixture Login Suite";
  const matched = suites.find((suite) => suite?.name === preferredName);
  const suiteId = matched?.id || suites[0]?.id;
  if (!suiteId) {
    throw new Error("No suite found for manual AI execution");
  }
  const runResp = await fetch(`http://127.0.0.1:${daemonPort}/plugin/qa/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ suiteId, mode: "manual" }),
  });
  const runJson = await runResp.json();
  const runId = runJson?.data?.id;
  if (!runId) {
    throw new Error("Failed to create run for manual AI flow");
  }
  const execResp = await fetch(`http://127.0.0.1:${daemonPort}/plugin/qa/runs/${runId}/manual/ai/execute`, {
    method: "POST",
  });
  const execJson = await execResp.json();
  const executionJobId = execJson?.data?.executionJobId;
  if (!executionJobId) {
    throw new Error("Failed to start manual AI execution");
  }
  const final = await pollManualExecution(runId, executionJobId);
  if (final.status !== "completed") {
    throw new Error(`Manual AI execution failed: ${final.failureReason || "unknown"}`);
  }
};

const main = async () => {
  ensureDependencies();
  installPackageTarball();

  const app = spawn("npm", ["run", "start"], {
    cwd: fixtureRoot,
    stdio: "inherit",
    env: { ...process.env, PORT: String(appPort) },
  });

  const daemon = spawn("npx", ["qa-runner", "ui", "--port", String(daemonPort)], {
    cwd: fixtureRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      APP_BASE_URL: `http://127.0.0.1:${appPort}`,
      QA_RUNNER_BASE_URL: `http://127.0.0.1:${appPort}`,
      QA_RUNNER_PLAYWRIGHT_PROJECT_DIR: "e2e/ui",
      QA_RUNNER_PLAYWRIGHT_EXECUTION_MODE: "shell",
      E2E_EMAIL: "user@example.com",
      E2E_PASSWORD: "correct-password",
    },
  });

  try {
    await waitHttp(`http://127.0.0.1:${appPort}${appReadyPath}`);
    await waitHttp(`http://127.0.0.1:${daemonPort}/plugin/qa/suites`);
    runGenerateAndTest();
    await runManualAiFlow();
    console.log(`Fixture ${fixtureName} dogfood run completed.`);
  } finally {
    daemon.kill("SIGTERM");
    app.kill("SIGTERM");
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
