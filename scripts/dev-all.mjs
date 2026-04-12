import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:net";
import process from "node:process";

const children = [];
let shuttingDown = false;
const uiDevPort = process.env.QA_RUNNER_UI_DEV_PORT || "2173";
const daemonPort = process.env.QA_RUNNER_DAEMON_PORT || "4545";
const uiOrigin = `http://localhost:${uiDevPort}`;
const daemonOrigin = `http://localhost:${daemonPort}`;

const ensurePortAvailable = (port, name) =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", (error) => {
      if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
        reject(new Error(`${name} port ${port} is already in use.`));
        return;
      }
      reject(error);
    });
    probe.listen(Number(port), () => {
      probe.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve();
      });
    });
  });

const stopChildren = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
};

const spawnNpm = (args, env) =>
  spawn("npm", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  });

const waitForExit = (child, name) =>
  new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const exitCode = typeof code === "number" ? code : 1;
      reject(new Error(`${name} failed with exit code ${exitCode}.`));
    });
  });

const ensureUiNodeBuild = async () => {
  const projectRoot = process.cwd();
  const distInWorkspace = path.join(projectRoot, "packages", "qa-runner-ui", "dist", "index.js");
  const distInNodeModules = path.join(
    projectRoot,
    "node_modules",
    "@talenttic",
    "qa-runner-ui",
    "dist",
    "index.js",
  );
  if (fs.existsSync(distInWorkspace) || fs.existsSync(distInNodeModules)) {
    return;
  }
  console.log("qa-runner ui: building node assets (dist/index.js)...");
  const build = spawnNpm(["run", "build:node", "-w", "@talenttic/qa-runner-ui"], {
    ...process.env,
  });
  await waitForExit(build, "qa-runner ui build:node");
};

const start = async () => {
  await ensurePortAvailable(daemonPort, "Daemon");
  await ensurePortAvailable(uiDevPort, "UI dev");
  await ensureUiNodeBuild();

  const daemon = spawnNpm(["run", "dev:daemon:watch", "--", "--port", daemonPort], {
      ...process.env,
      QA_RUNNER_CORS_ORIGIN: process.env.QA_RUNNER_CORS_ORIGIN || uiOrigin,
      QA_RUNNER_DAEMON_PORT: daemonPort,
  });
  const uiDevWithPort = spawnNpm(["run", "dev:ui", "--", "--port", uiDevPort], {
    ...process.env,
    VITE_API_URL: process.env.VITE_API_URL || daemonOrigin,
    QA_RUNNER_UI_DEV_PORT: uiDevPort,
  });
  children.push(daemon, uiDevWithPort);

  daemon.on("exit", (code) => {
    if (!shuttingDown) {
      const exitCode = typeof code === "number" ? code : 1;
      console.error(`qa-runner daemon process exited (code=${exitCode}). Stopping dev:all.`);
      stopChildren();
      process.exit(exitCode === 0 ? 1 : exitCode);
    }
  });

  uiDevWithPort.on("exit", (code) => {
    if (!shuttingDown) {
      const exitCode = typeof code === "number" ? code : 1;
      console.error(`qa-runner UI dev process exited (code=${exitCode}). Stopping dev:all.`);
      stopChildren();
      process.exit(exitCode === 0 ? 1 : exitCode);
    }
  });
};

process.on("SIGINT", () => {
  stopChildren();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopChildren();
  process.exit(0);
});

start().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
