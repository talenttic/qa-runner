import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

export type McpTransportMode = "http" | "stdio";

export type PlaywrightMcpClientConfig = {
  transport: McpTransportMode;
  url: string;
  command: string;
  args: string[];
  timeoutMs: number;
};

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

const parseSseDataMessages = (raw: string): JsonRpcResponse[] => {
  const responses: JsonRpcResponse[] = [];
  const lines = raw.split(/\r?\n/);
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0) {
      return;
    }
    const payload = buffer.join("\n").trim();
    buffer = [];
    if (!payload) {
      return;
    }
    try {
      const parsed = JSON.parse(payload) as JsonRpcResponse;
      if (parsed && typeof parsed === "object") {
        responses.push(parsed);
      }
    } catch {
      // ignore malformed SSE chunks
    }
  };

  for (const line of lines) {
    if (line.startsWith("data:")) {
      buffer.push(line.slice(5).trimStart());
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (buffer.length > 0) {
      // Non-data line after data block means current event is done.
      flush();
    }
  }

  flush();
  return responses;
};

const joinUrl = (baseUrl: string): string => {
  if (/\/mcp\/?$/i.test(baseUrl)) {
    return baseUrl;
  }
  return `${baseUrl.replace(/\/$/, "")}/mcp`;
};

const parseToolText = (response: JsonRpcResponse): string => {
  const content = response.result?.content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      if (typeof item.text === "string") {
        return item.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
};

const extractSessionId = (headers: Headers): string | null => {
  const value = headers.get("mcp-session-id")?.trim();
  return value ? value : null;
};

const randomPort = (): number => 39000 + Math.floor(Math.random() * 2000);
const MAX_PROCESS_LOG_LINES = 40;

const appendProcessLogLine = (target: string[], chunk: Buffer | string): void => {
  const raw = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    target.push(line);
    if (target.length > MAX_PROCESS_LOG_LINES) {
      target.shift();
    }
  }
};

export class PlaywrightMcpClient {
  private requestId = 1;
  private sessionId: string | null = null;
  private childProcess: ChildProcess | null = null;
  private endpoint: string;
  private actionCount = 0;

  private constructor(private readonly config: PlaywrightMcpClientConfig, endpoint: string) {
    this.endpoint = endpoint;
  }

  static async connect(config: PlaywrightMcpClientConfig): Promise<PlaywrightMcpClient> {
    if (config.transport === "http") {
      const client = new PlaywrightMcpClient(config, joinUrl(config.url));
      const startedAt = Date.now();
      let lastError = "";
      while (Date.now() - startedAt < config.timeoutMs) {
        try {
          await client.initialize();
          return client;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
        await sleep(250);
      }
      throw new Error(`mcp_connect_timeout: ${lastError || "could_not_initialize"}`);
    }

    const args = config.args
      .map((value) => value.trim())
      .filter(Boolean)
      // Headed is Playwright MCP default; this flag is unsupported and causes process exit.
      .filter((value) => value !== "--headed");
    if (
      config.command === "npx" &&
      !args.some((value) => value === "-y" || value === "--yes")
    ) {
      args.unshift("-y");
    }
    if (!args.includes("--isolated")) {
      args.push("--isolated");
    }
    const noDisplay = process.platform === "linux" && !process.env.DISPLAY;
    if (noDisplay && !args.includes("--headless")) {
      args.push("--headless");
    }
    const baseArgsWithoutPort: string[] = [];
    for (let index = 0; index < args.length; index += 1) {
      const current = args[index]!;
      if (current === "--port") {
        index += 1;
        continue;
      }
      if (current.startsWith("--port=")) {
        continue;
      }
      baseArgsWithoutPort.push(current);
    }

    const startedAt = Date.now();
    let lastError = "";
    while (Date.now() - startedAt < config.timeoutMs) {
      const port = randomPort();
      const endpoint = joinUrl(`http://localhost:${port}/mcp`);
      const attemptArgs = [...baseArgsWithoutPort, "--port", String(port)];
      const child = spawn(config.command, attemptArgs, {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const processLogs: string[] = [];
      child.stdout?.on("data", (chunk) => appendProcessLogLine(processLogs, chunk));
      child.stderr?.on("data", (chunk) => appendProcessLogLine(processLogs, chunk));

      const client = new PlaywrightMcpClient(config, endpoint);
      client.childProcess = child;
      let retryWithNewPort = false;

      while (Date.now() - startedAt < config.timeoutMs) {
        if (child.exitCode !== null) {
          const tail = processLogs.length > 0 ? processLogs.slice(-6).join(" | ") : "";
          const message = `mcp_process_exited: ${child.exitCode}${tail ? ` (${tail})` : ""}`;
          const normalized = message.toLowerCase();
          const isPortCollision =
            normalized.includes("eaddrinuse") ||
            normalized.includes("errno: -98") ||
            normalized.includes("address already in use") ||
            normalized.includes("syscall: 'listen'");
          if (isPortCollision) {
            lastError = message;
            retryWithNewPort = true;
            break;
          }
          throw new Error(message);
        }
        try {
          await client.initialize();
          return client;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
        await sleep(250);
      }

      if (retryWithNewPort) {
        child.kill("SIGTERM");
        continue;
      }

      child.kill("SIGTERM");
      break;
    }

    throw new Error(`mcp_connect_timeout: ${lastError || "could_not_initialize"}`);
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getEndpoint(): string {
    return this.endpoint;
  }

  getActionCount(): number {
    return this.actionCount;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const response = await this.rpc({
      jsonrpc: "2.0",
      id: this.requestId++,
      method: "tools/call",
      params: {
        name,
        arguments: args,
      },
    });

    if (response.error) {
      throw new Error(`mcp_tool_error(${name}): ${response.error.message}`);
    }
    if (response.result?.isError) {
      const text = parseToolText(response).trim();
      throw new Error(text ? `mcp_tool_error(${name}): ${text}` : `mcp_tool_error(${name})`);
    }
    this.actionCount += 1;
    return parseToolText(response);
  }

  async close(): Promise<void> {
    try {
      if (this.sessionId) {
        await fetch(this.endpoint, {
          method: "DELETE",
          headers: {
            "mcp-session-id": this.sessionId,
          },
        }).catch(() => undefined);
      }
    } finally {
      if (this.childProcess && this.childProcess.exitCode === null) {
        this.childProcess.kill("SIGTERM");
      }
      this.childProcess = null;
      this.sessionId = null;
    }
  }

  private async initialize(): Promise<void> {
    const initResponse = await this.rpc(
      {
        jsonrpc: "2.0",
        id: this.requestId++,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: {
            name: "qa-runner",
            version: "0.1.0",
          },
        },
      },
      false,
    );

    if (initResponse.error) {
      throw new Error(`mcp_initialize_failed: ${initResponse.error.message}`);
    }

    await this.rpc(
      {
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      },
      true,
      true,
    );
  }

  private async rpc(
    request: JsonRpcRequest,
    withSession = true,
    notificationOnly = false,
    allowSessionRecovery = true,
    emptyPayloadRetriesLeft = 2,
  ): Promise<JsonRpcResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      };
      if (withSession && this.sessionId) {
        headers["mcp-session-id"] = this.sessionId;
      }

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      const sessionId = extractSessionId(response.headers);
      if (sessionId && !this.sessionId) {
        this.sessionId = sessionId;
      }

      if (response.status >= 400) {
        const text = await response.text();
        const normalized = text.toLowerCase();
        const sessionLost =
          response.status === 404 &&
          withSession &&
          allowSessionRecovery &&
          normalized.includes("session not found");
        if (sessionLost) {
          this.sessionId = null;
          await this.initialize();
          return this.rpc(request, withSession, notificationOnly, false);
        }
        throw new Error(`mcp_http_${response.status}: ${text || "request_failed"}`);
      }

      if (notificationOnly || request.id === undefined) {
        return { jsonrpc: "2.0", result: {} };
      }

      const text = await response.text();
      const payloads = parseSseDataMessages(text);
      if (payloads.length === 0) {
        const trimmed = text.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            const parsed = JSON.parse(trimmed) as JsonRpcResponse;
            if (parsed && typeof parsed === "object") {
              payloads.push(parsed);
            }
          } catch {
            // ignore and fail with invalid response below
          }
        }
      }
      const match = payloads.find((item) => item.id === request.id) ?? payloads[payloads.length - 1];
      if (!match) {
        const compact = text.replace(/\s+/g, " ").trim().slice(0, 240);
        const contentType = response.headers.get("content-type") ?? "unknown";
        if (contentType.includes("text/event-stream") && !compact && emptyPayloadRetriesLeft > 0) {
          await sleep(120);
          return this.rpc(
            request,
            withSession,
            notificationOnly,
            allowSessionRecovery,
            emptyPayloadRetriesLeft - 1,
          );
        }
        throw new Error(`mcp_invalid_response: missing payload (content-type=${contentType}, body=${compact || "empty"})`);
      }
      return match;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("mcp_timeout");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
