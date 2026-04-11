import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import http from "node:http";
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

const readRequestBody = (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });

const startFakeMcpServer = async (): Promise<{ url: string; close: () => Promise<void> }> => {
  const state = {
    currentUrl: "http://example.test/",
    fields: new Map<string, string>(),
    visibleTexts: new Set<string>(["login"]),
  };
  const sessionId = "qa-runner-mcp-session";
  const expectedPassword = process.env.FAKE_EXPECTED_PASSWORD || "correct-password";

  const sendSse = (res: http.ServerResponse, id: number, result: unknown): void => {
    const payload = JSON.stringify({ jsonrpc: "2.0", id, result });
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "mcp-session-id": sessionId,
    });
    res.end(`event: message\ndata: ${payload}\n\n`);
  };

  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/mcp") {
      res.writeHead(404).end("not_found");
      return;
    }
    const rawBody = await readRequestBody(req);
    const body = JSON.parse(rawBody || "{}") as {
      id?: number;
      method?: string;
      params?: any;
    };
    if (body.method === "initialize") {
      sendSse(res, Number(body.id ?? 1), {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "fake-playwright-mcp", version: "0.0.1" },
      });
      return;
    }
    if (body.method === "notifications/initialized") {
      res.writeHead(202).end("ok");
      return;
    }
    if (body.method !== "tools/call") {
      sendSse(res, Number(body.id ?? 1), {
        content: [{ type: "text", text: "unsupported" }],
        isError: true,
      });
      return;
    }

    const name = String(body.params?.name ?? "");
    const args = (body.params?.arguments ?? {}) as Record<string, unknown>;
    const id = Number(body.id ?? 1);
    const ok = (text: string) => sendSse(res, id, { content: [{ type: "text", text }] });
    const fail = (text: string) => sendSse(res, id, { content: [{ type: "text", text }], isError: true });

    switch (name) {
      case "browser_navigate": {
        const target = String(args.url ?? "");
        state.currentUrl = target;
        ok(`navigated:${target}`);
        return;
      }
      case "browser_snapshot": {
        const includeDashboard = state.visibleTexts.has("dashboard");
        const snapshot =
          `- textbox \"Email\" [ref=email_field]\n` +
          `- textbox \"Password\" [ref=password_field]\n` +
          `- button \"Login\" [ref=login_button]\n` +
          (includeDashboard ? `- text \"dashboard\" [ref=dashboard_text]\n` : "");
        ok(snapshot);
        return;
      }
      case "browser_type": {
        const ref = String(args.ref ?? "");
        const text = String(args.text ?? "");
        state.fields.set(ref, text);
        ok("typed");
        return;
      }
      case "browser_click": {
        const ref = String(args.ref ?? "");
        if (ref === "login_button") {
          const password = state.fields.get("password_field") ?? "";
          if (password === expectedPassword) {
            state.currentUrl = "http://example.test/dashboard";
            state.visibleTexts.add("dashboard");
          }
        }
        ok("clicked");
        return;
      }
      case "browser_wait_for": {
        const text = String(args.text ?? "").toLowerCase();
        if (text && !Array.from(state.visibleTexts).some((item) => item.includes(text))) {
          fail(`text_not_visible: ${text}`);
          return;
        }
        ok("waited");
        return;
      }
      case "browser_evaluate": {
        ok(state.currentUrl);
        return;
      }
      case "browser_console_messages": {
        ok("No console messages");
        return;
      }
      case "browser_network_requests": {
        ok("No network requests");
        return;
      }
      default: {
        fail(`unknown_tool: ${name}`);
      }
    }
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    close: () => closeServer(server),
  };
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
  let server: http.Server | null = null;

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
        server = startDaemonServer({
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
        const runtime = await requestJson<{ executionMode: string }>(baseUrl, "/plugin/qa/runtime");
        assert.equal(runtime.executionMode, "shell");

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
    if (server) {
      await closeServer(server);
    }
    process.chdir(previousCwd);
    fs.rmSync(workspace.root, { recursive: true, force: true });
  }
});

test("manual AI execution fails with useful reason when verify step fails", { concurrency: false }, async () => {
  const workspace = setupWorkspace();
  const previousCwd = process.cwd();
  process.chdir(workspace.root);
  let server: http.Server | null = null;

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
        server = startDaemonServer({
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
        const runtime = await requestJson<{ executionMode: string }>(baseUrl, "/plugin/qa/runtime");
        assert.equal(runtime.executionMode, "shell");

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
    if (server) {
      await closeServer(server);
    }
    process.chdir(previousCwd);
    fs.rmSync(workspace.root, { recursive: true, force: true });
  }
});

test("manual AI execution completes checklist in MCP mode via HTTP transport", { concurrency: false }, async () => {
  const workspace = setupWorkspace();
  const mcp = await startFakeMcpServer();
  const previousCwd = process.cwd();
  process.chdir(workspace.root);
  let server: http.Server | null = null;

  try {
    await withEnv(
      {
        QA_RUNNER_PLAYWRIGHT_PROJECT_DIR: "e2e/ui",
        QA_RUNNER_PLAYWRIGHT_EXECUTION_MODE: "mcp",
        QA_RUNNER_PLAYWRIGHT_MCP_TRANSPORT: "http",
        QA_RUNNER_PLAYWRIGHT_MCP_URL: mcp.url,
        QA_RUNNER_BASE_URL: "http://example.test",
        E2E_EMAIL: "user@example.test",
        E2E_PASSWORD: "correct-password",
        FAKE_EXPECTED_PASSWORD: "correct-password",
      },
      async () => {
        server = startDaemonServer({
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
        const runtime = await requestJson<{ executionMode: string }>(baseUrl, "/plugin/qa/runtime");
        assert.equal(runtime.executionMode, "mcp");
        const health = await requestJson<{
          enabled: boolean;
          transport: string;
          endpoint: string;
          lastStatus: string;
        }>(baseUrl, "/plugin/qa/mcp/health?probe=1");
        assert.equal(health.enabled, true);
        assert.equal(health.transport, "http");
        assert.equal(health.lastStatus, "healthy");
        assert.match(health.endpoint, /\/mcp$/);

        const suites = await requestJson<Array<{ id: string }>>(baseUrl, "/plugin/qa/suites");
        assert.ok(suites.length > 0);
        const run = await requestJson<{ id: string }>(baseUrl, "/plugin/qa/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suiteId: suites[0]!.id, mode: "manual" }),
        });
        const started = await requestJson<{
          executionJobId: string;
          executionMode: string;
          mcpTransport: string | null;
          mcpEndpoint: string | null;
        }>(baseUrl, `/plugin/qa/runs/${run.id}/manual/ai/execute`, { method: "POST" });
        assert.equal(started.executionMode, "mcp");
        assert.equal(started.mcpTransport, "http");
        assert.ok(started.mcpEndpoint);

        const finalStatus = await waitForTerminalManualStatus(baseUrl, run.id, started.executionJobId);
        assert.equal(finalStatus.status, "completed");
        assert.equal(finalStatus.failureReason, null);
      },
    );
  } finally {
    if (server) {
      await closeServer(server);
    }
    await mcp.close();
    process.chdir(previousCwd);
    fs.rmSync(workspace.root, { recursive: true, force: true });
  }
});
