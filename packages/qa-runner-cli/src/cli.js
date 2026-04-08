#!/usr/bin/env node
import fs from "node:fs";
import { QaRunnerDaemon, startDaemonServer, startWatcher } from "@talenttic/qa-runner-daemon";
import { loadConfig, resolveOutputs } from "./config";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const command = args[0];
const cwd = process.cwd();
const parseFlag = (name) => {
    const index = args.indexOf(name);
    if (index === -1) {
        return undefined;
    }
    return args[index + 1];
};
const parseList = (name) => {
    const value = parseFlag(name);
    return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
};
const config = await loadConfig(cwd);
const outputs = resolveOutputs(cwd, config);
if (command === "generate") {
    const summary = parseFlag("--summary") ?? "";
    const files = parseList("--files");
    const mode = parseFlag("--mode") ?? "all";
    const ci = args.includes("--ci");
    const timestampOverride = parseFlag("--timestamp");
    const diffOverride = parseFlag("--diff");
    const event = {
        files,
        summary,
        diff: diffOverride ?? process.env.QA_RUNNER_DIFF,
        timestamp: timestampOverride ? Number(timestampOverride) : ci ? 0 : Date.now(),
    };
    const daemon = new QaRunnerDaemon({
        outputs,
    });
    daemon
        .handleEvent(event, {
        mode: mode === "manual" || mode === "e2e" || mode === "all" ? mode : "all",
        ci,
        timestampOverride: timestampOverride ? Number(timestampOverride) : undefined,
    })
        .then((outcome) => {
        console.log(JSON.stringify({ written: outcome.writtenFiles, skipped: outcome.skippedFiles }, null, 2));
    });
}
else if (command === "daemon") {
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
        }
        catch {
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
        }
        catch {
            console.log("qa-runner daemon not running");
            process.exit(1);
        }
    }
    if (subcommand !== "start") {
        console.log("Usage: qa-runner daemon start|stop|status");
        process.exit(1);
    }
    startDaemonServer({
        port,
        daemonConfig: { outputs },
    });
    startWatcher({
        rootDir: cwd,
        intervalMs: config.watcher?.intervalMs,
        debounceMs: config.watcher?.debounceMs,
        maxFiles: config.watcher?.maxFiles,
        onEvent: (event) => {
            const daemon = new QaRunnerDaemon({ outputs });
            daemon.handleEvent(event).catch((error) => {
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
}
else if (command === "ui") {
    const port = Number(parseFlag("--port") ?? String(config.server?.port ?? 4545));
    startDaemonServer({
        port,
        daemonConfig: { outputs },
    });
    console.log(`qa-runner UI available at http://localhost:${port}/ui`);
}
else if (command === "test") {
    const targetEnv = parseFlag("--env");
    const commandLine = config.tests?.command ?? "npm --prefix e2e/ui test";
    const [cmd, ...cmdArgs] = commandLine.split(" ").filter(Boolean);
    const env = {
        ...process.env,
        QA_RUNNER_ENV: targetEnv ?? process.env.QA_RUNNER_ENV ?? "",
    };
    const result = spawnSync(cmd, cmdArgs, { stdio: "inherit", env });
    process.exit(result.status ?? 1);
}
else if (command === "report") {
    const outputPath = config.report?.outputPath ?? path.join(cwd, "tools", "qa-runner.report.json");
    const payload = {
        generatedAt: new Date().toISOString(),
        manifestPath: outputs.manifestPath,
    };
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf-8");
    console.log(`qa-runner report written to ${outputPath}`);
}
else {
    console.log("qa-runner CLI scaffold");
    console.log("Usage:");
    console.log("  qa-runner generate --summary '...' --files file1.ts,file2.ts --mode manual|e2e|all --ci --diff '<git diff>'");
    console.log("  qa-runner daemon start|stop|status --port 4545");
    console.log("  qa-runner ui --port 4545");
    console.log("  qa-runner test --env stage|prod");
    console.log("  qa-runner report");
}
//# sourceMappingURL=cli.js.map