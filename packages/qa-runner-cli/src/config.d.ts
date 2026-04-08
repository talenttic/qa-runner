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
};
export declare function loadConfig(cwd: string): Promise<QaRunnerCliConfig>;
export declare function resolveOutputs(cwd: string, config: QaRunnerCliConfig): {
    manualDir: any;
    e2eDir: any;
    manifestPath: any;
};
//# sourceMappingURL=config.d.ts.map