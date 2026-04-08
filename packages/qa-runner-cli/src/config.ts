import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type QaRunnerCliConfig = {
  outputs?: {
    manualDir?: string;
    e2eDir?: string;
    manifestPath?: string;
  };
  server?: {
    port?: number;
  };
  watcher?: {
    intervalMs?: number;
    debounceMs?: number;
    maxFiles?: number;
  };
  tests?: {
    command?: string;
  };
  report?: {
    outputPath?: string;
  };
  ui?: {
    readPaths?: string[];
  };
};

const loadJson = (filePath: string): QaRunnerCliConfig => JSON.parse(fs.readFileSync(filePath, "utf-8"));

export async function loadConfig(cwd: string): Promise<QaRunnerCliConfig> {
  const jsonPath = path.join(cwd, "tools", "qa-runner.config.json");
  const jsPath = path.join(cwd, "tools", "qa-runner.config.js");

  if (fs.existsSync(jsonPath)) {
    return loadJson(jsonPath);
  }

  if (fs.existsSync(jsPath)) {
    const mod = await import(pathToFileURL(jsPath).toString());
    return (mod.default ?? mod) as QaRunnerCliConfig;
  }

  return {};
}

export function resolveOutputs(cwd: string, config: QaRunnerCliConfig) {
  return {
    manualDir: path.resolve(cwd, config.outputs?.manualDir ?? path.join(cwd, "docs", "qa-cases")),
    e2eDir: path.resolve(cwd, config.outputs?.e2eDir ?? path.join(cwd, "e2e", "generated")),
    manifestPath: path.resolve(
      cwd,
      config.outputs?.manifestPath ?? path.join(cwd, "tools", "qa-runner.manifest.json"),
    ),
  };
}
