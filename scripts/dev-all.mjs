import { spawn } from "node:child_process";
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

const start = async () => {
  await ensurePortAvailable(daemonPort, "Daemon");
  await ensurePortAvailable(uiDevPort, "UI dev");

  const daemon = spawn("npm", ["run", "dev:daemon:watch"], {
    stdio: "inherit",
    env: {
      ...process.env,
      QA_RUNNER_CORS_ORIGIN: process.env.QA_RUNNER_CORS_ORIGIN || uiOrigin,
      QA_RUNNER_DAEMON_PORT: daemonPort,
    },
  });
  const uiDevWithPort = spawn(
    "npm",
    ["run", "dev:ui"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        VITE_API_URL: process.env.VITE_API_URL || daemonOrigin,
        QA_RUNNER_UI_DEV_PORT: uiDevPort,
      },
    },
  );
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
