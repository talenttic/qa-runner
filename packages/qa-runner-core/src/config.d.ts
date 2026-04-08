export type QaRunnerConfig = {
    outputs: {
        manual: string;
        e2e: string;
        reports: string;
    };
    ui: {
        readPaths: string[];
    };
};
export type QaRunnerConfigValidation = {
    ok: boolean;
    errors: string[];
};
export declare function validateConfig(config: QaRunnerConfig): QaRunnerConfigValidation;
//# sourceMappingURL=config.d.ts.map