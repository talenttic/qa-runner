import type { ChangeEvent } from "@talenttic/qa-runner-core";
export type WatcherConfig = {
    rootDir: string;
    intervalMs?: number;
    debounceMs?: number;
    maxFiles?: number;
    ignore?: (filePath: string) => boolean;
    onEvent: (event: ChangeEvent) => void;
};
export declare function startWatcher(config: WatcherConfig): () => void;
//# sourceMappingURL=watcher.d.ts.map