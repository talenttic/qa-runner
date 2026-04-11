import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import type http from "node:http";
import { startDaemonServer } from "../server.js";

type JsonResponse<T> = { data?: T; error?: string };

const writeFile = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
};

const writeFakePlaywrightModule = (projectDir: string): void => {
  writeFile(
    path.join(projectDir, "package.json"),
    JSON.stringify({ name: "fake-playwright-project", private: true }, null, 2),
  );
  writeFile(
    path.join(projectDir, "node_modules", "playwright", "index.js"),
    `
class FakeLocator {
  constructor(page, kind, token) {
    this.page = page;
    this.kind = kind;
    this.token = String(token || "");
  }
  first() {
    return this;
  }
  async waitFor() {
    if (this.kind === "text") {
      const key = this.token.trim().toLowerCase();
      if (!this.page.visibleTexts.has(key)) {
        throw new Error("text_not_visible");
      }
    }
  }
  async fill(value) {
    const key = this.token.trim().toLowerCase();
    this.page.fields[key] = String(value);
  }
  async click() {
    const key = this.token.trim().toLowerCase();
    if (key.includes("login")) {
      const expectedPassword = process.env.FAKE_EXPECTED_PASSWORD || "correct-password";
      const providedPassword = this.page.fields["password"] || "";
      if (providedPassword === expectedPassword) {
        const current = new URL(this.page.currentUrl);
        this.page.currentUrl = current.origin + "/dashboard";
        this.page.visibleTexts.add("dashboard");
      }
    }
  }
}

class FakePage {
  constructor() {
    this.currentUrl = "http://example.test/";
    this.fields = {};
    this.visibleTexts = new Set(["login"]);
    this.listeners = new Map();
  }
  on(eventName, handler) {
    const list = this.listeners.get(eventName) || [];
    list.push(handler);
    this.listeners.set(eventName, list);
  }
  emit(eventName, payload) {
    const list = this.listeners.get(eventName) || [];
    for (const handler of list) {
      handler(payload);
    }
  }
  async goto(url) {
    this.currentUrl = String(url);
  }
  url() {
    return this.currentUrl;
  }
  getByLabel(value) {
    return new FakeLocator(this, "field", value);
  }
  getByPlaceholder(value) {
    return new FakeLocator(this, "field", value);
  }
  getByTestId(value) {
    return new FakeLocator(this, "field", value);
  }
  locator(value) {
    return new FakeLocator(this, "field", value);
  }
  getByRole(_, options) {
    return new FakeLocator(this, "click", options && options.name ? options.name : "");
  }
  getByText(value) {
    return new FakeLocator(this, "text", value);
  }
}

module.exports = {
  chromium: {
    launch: async function launch() {
      return {
        newContext: async function newContext() {
          return {
            newPage: async function newPage() {
              return new FakePage();
            },
            close: async function close() {},
          };
        },
        close: async function close() {},
      };
    },
  },
};
`.trimStart(),
  );
};

const writeChecklist = (casesDir: string): void => {
  writeFile(
    path.join(casesDir, "2026-04-10__manual-ai-login.md"),
    `
# Manual AI Login Suite

## [login] Login works with valid credentials
Use Case: User can sign in with valid credentials.
Expected: User lands on dashboard.
Priority: high
### Steps
1. Open /login
2. Fill Email: E2E_EMAIL
3. Fill Password: E2E_PASSWORD
4. Click Login
5. Verify URL contains /dashboard
`.trimStart(),
  );
};

const closeServer = async (server: http.Server): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

const setupWorkspace = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qa-runner-manual-ai-"));
  const casesDir = path.join(root, "docs", "qa-cases");
  const projectDir = path.join(root, "e2e", "ui");
  const e2eDir = path.join(projectDir, "tests");
  const manifestPath = path.join(root, "tools", "qa-manifest.json");
  fs.mkdirSync(path.join(root, "tools"), { recursive: true });
  writeChecklist(casesDir);
  writeFakePlaywrightModule(projectDir);
  return { root, casesDir, e2eDir, manifestPath, projectDir };
};

const requestJson = async <T>(baseUrl: string, relativePath: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(new URL(relativePath, baseUrl), init);
  assert.equal(response.ok, true, `request failed: ${response.status} ${response.statusText}`);
  const body = (await response.json()) as JsonResponse<T>;
  assert.ok(body.data, `missing data payload: ${JSON.stringify(body)}`);
  return body.data as T;
};

const waitForTerminalManualStatus = async (
  baseUrl: string,
  runId: string,
  executionJobId: string,
): Promise<{ status: string; failureReason: string | null }> => {
  for (let index = 0; index < 80; index += 1) {
    const data = await requestJson<{
      status: string;
      failureReason: string | null;
    }>(baseUrl, `/plugin/qa/runs/${runId}/manual/ai/executions/${executionJobId}`);
    if (data.status === "completed" || data.status === "failed" || data.status === "cancelled") {
      return data;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timed_out_waiting_for_manual_ai_execution");
};

const withEnv = async (values: Record<string, string>, fn: () => Promise<void>): Promise<void> => {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

test("manual AI execution completes happy path checklist", { concurrency: false }, async () => {
  const workspace = setupWorkspace();
  const previousCwd = process.cwd();
  process.chdir(workspace.root);
  const server = startDaemonServer({
    port: 0,
    daemonConfig: {
      outputs: {
        manualDir: workspace.casesDir,
        e2eDir: workspace.e2eDir,
        manifestPath: workspace.manifestPath,
      },
    },
  });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await withEnv(
      {
        QA_RUNNER_PLAYWRIGHT_PROJECT_DIR: "e2e/ui",
        QA_RUNNER_PLAYWRIGHT_EXECUTION_MODE: "shell",
        QA_RUNNER_BASE_URL: "http://example.test",
        E2E_EMAIL: "user@example.test",
        E2E_PASSWORD: "correct-password",
        FAKE_EXPECTED_PASSWORD: "correct-password",
      },
      async () => {
        const suites = await requestJson<Array<{ id: string }>>(baseUrl, "/plugin/qa/suites");
        assert.ok(suites.length > 0);
        const run = await requestJson<{ id: string }>(baseUrl, "/plugin/qa/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suiteId: suites[0]!.id, mode: "manual" }),
        });
        const started = await requestJson<{ executionJobId: string }>(
          baseUrl,
          `/plugin/qa/runs/${run.id}/manual/ai/execute`,
          { method: "POST" },
        );
        const finalStatus = await waitForTerminalManualStatus(baseUrl, run.id, started.executionJobId);
        assert.equal(finalStatus.status, "completed");
        assert.equal(finalStatus.failureReason, null);

        const detail = await requestJson<{
          run: { status: string };
          cases: Array<{
            result: { status: string } | null;
            steps: Array<{ check: { checked: boolean; failureReason: string | null } | null }>;
          }>;
        }>(baseUrl, `/plugin/qa/runs/${run.id}`);
        assert.equal(detail.run.status, "passed");
        assert.ok(detail.cases[0]?.result);
        assert.equal(detail.cases[0]!.result!.status, "passed");
        for (const step of detail.cases[0]!.steps) {
          assert.equal(step.check?.checked, true);
          assert.equal(step.check?.failureReason ?? null, null);
        }
      },
    );
  } finally {
    await closeServer(server);
    process.chdir(previousCwd);
    fs.rmSync(workspace.root, { recursive: true, force: true });
  }
});

test("manual AI execution fails with useful reason when verify step fails", { concurrency: false }, async () => {
  const workspace = setupWorkspace();
  const previousCwd = process.cwd();
  process.chdir(workspace.root);
  const server = startDaemonServer({
    port: 0,
    daemonConfig: {
      outputs: {
        manualDir: workspace.casesDir,
        e2eDir: workspace.e2eDir,
        manifestPath: workspace.manifestPath,
      },
    },
  });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await withEnv(
      {
        QA_RUNNER_PLAYWRIGHT_PROJECT_DIR: "e2e/ui",
        QA_RUNNER_PLAYWRIGHT_EXECUTION_MODE: "shell",
        QA_RUNNER_BASE_URL: "http://example.test",
        E2E_EMAIL: "user@example.test",
        E2E_PASSWORD: "wrong-password",
        FAKE_EXPECTED_PASSWORD: "correct-password",
      },
      async () => {
        const suites = await requestJson<Array<{ id: string }>>(baseUrl, "/plugin/qa/suites");
        assert.ok(suites.length > 0);
        const run = await requestJson<{ id: string }>(baseUrl, "/plugin/qa/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suiteId: suites[0]!.id, mode: "manual" }),
        });
        const started = await requestJson<{ executionJobId: string }>(
          baseUrl,
          `/plugin/qa/runs/${run.id}/manual/ai/execute`,
          { method: "POST" },
        );
        const finalStatus = await waitForTerminalManualStatus(baseUrl, run.id, started.executionJobId);
        assert.equal(finalStatus.status, "failed");
        assert.match(finalStatus.failureReason ?? "", /url_mismatch/i);

        const detail = await requestJson<{
          run: { status: string };
          cases: Array<{
            result: { status: string; failureReason: string | null } | null;
            steps: Array<{ text: string; check: { checked: boolean; failureReason: string | null } | null }>;
          }>;
        }>(baseUrl, `/plugin/qa/runs/${run.id}`);
        assert.equal(detail.run.status, "failed");
        assert.ok(detail.cases[0]?.result);
        assert.equal(detail.cases[0]!.result!.status, "failed");
        const failedStep = detail.cases[0]!.steps.find((step) => step.check?.checked === false);
        assert.ok(failedStep, "expected at least one failed step");
        assert.match(failedStep!.check!.failureReason ?? "", /url_mismatch/i);
      },
    );
  } finally {
    await closeServer(server);
    process.chdir(previousCwd);
    fs.rmSync(workspace.root, { recursive: true, force: true });
  }
});
