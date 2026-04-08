import fs from "node:fs";
import path from "node:path";
const defaultIgnore = (filePath) => {
    return (filePath.includes(`${path.sep}.git${path.sep}`) ||
        filePath.includes(`${path.sep}node_modules${path.sep}`) ||
        filePath.includes(`${path.sep}dist${path.sep}`));
};
const scanDir = (rootDir, ignore) => {
    const snapshot = new Map();
    const queue = [rootDir];
    while (queue.length > 0) {
        const current = queue.pop();
        if (!current) {
            continue;
        }
        let entries;
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (ignore(fullPath)) {
                continue;
            }
            if (entry.isDirectory()) {
                queue.push(fullPath);
                continue;
            }
            if (entry.isFile()) {
                try {
                    const stat = fs.statSync(fullPath);
                    snapshot.set(fullPath, stat.mtimeMs);
                }
                catch {
                    continue;
                }
            }
        }
    }
    return snapshot;
};
export function startWatcher(config) {
    const ignore = config.ignore ?? defaultIgnore;
    let previous = scanDir(config.rootDir, ignore);
    const intervalMs = config.intervalMs ?? 2000;
    const debounceMs = config.debounceMs ?? 1000;
    const pending = new Set();
    let debounceTimer = null;
    const flush = () => {
        if (pending.size === 0) {
            return;
        }
        const files = Array.from(pending).slice(0, config.maxFiles ?? 200);
        pending.clear();
        config.onEvent({
            files,
            summary: "File changes detected",
            timestamp: Date.now(),
        });
    };
    const interval = setInterval(() => {
        const current = scanDir(config.rootDir, ignore);
        current.forEach((mtime, filePath) => {
            const prev = previous.get(filePath);
            if (!prev || prev !== mtime) {
                pending.add(filePath);
            }
        });
        if (pending.size > 0) {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(() => {
                flush();
                debounceTimer = null;
            }, debounceMs);
        }
        previous = current;
    }, intervalMs);
    return () => {
        clearInterval(interval);
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
    };
}
//# sourceMappingURL=watcher.js.map