import http from "node:http";
import fs from "node:fs";
import { QaRunnerDaemon } from "./daemon";
import { validateChangeEvent } from "@talenttic-tech-hub/qa-runner-core";
import { getUiHtml } from "@talenttic-tech-hub/qa-runner-ui";
const readJsonBody = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
        try {
            const body = Buffer.concat(chunks).toString("utf-8");
            resolve(body ? JSON.parse(body) : {});
        }
        catch (error) {
            reject(error);
        }
    });
    req.on("error", reject);
});
const json = (res, status, payload) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
};
const text = (res, status, payload, contentType = "text/plain") => {
    res.writeHead(status, { "Content-Type": contentType });
    res.end(payload);
};
export function startDaemonServer(config) {
    const daemon = new QaRunnerDaemon(config.daemonConfig);
    const state = {};
    const server = http.createServer(async (req, res) => {
        if (!req.url) {
            text(res, 404, "Not Found");
            return;
        }
        if (req.method === "GET" && req.url === "/ui") {
            text(res, 200, getUiHtml(), "text/html");
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
        if (req.method === "GET" && req.url === "/manifest") {
            const manifestPath = config.daemonConfig.outputs.manifestPath;
            if (!fs.existsSync(manifestPath)) {
                json(res, 404, { error: "manifest_not_found" });
                return;
            }
            const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
            json(res, 200, manifest);
            return;
        }
        if (req.method === "POST" && req.url === "/events") {
            try {
                const body = (await readJsonBody(req));
                const mode = typeof body.mode === "string" ? body.mode : undefined;
                const event = {
                    files: body.files ?? [],
                    summary: body.summary,
                    diff: body.diff,
                    tool: body.tool,
                    timestamp: body.timestamp ?? Date.now(),
                };
                const validation = validateChangeEvent(event);
                if (!validation.ok) {
                    json(res, 400, { error: "invalid_event_payload", details: validation.errors });
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
                });
            }
            catch (error) {
                json(res, 400, { error: "invalid_event_payload" });
            }
            return;
        }
        text(res, 404, "Not Found");
    });
    server.listen(config.port);
    return server;
}
//# sourceMappingURL=server.js.map