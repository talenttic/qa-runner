import { type ChangeEvent, type GenerationResult } from "@talenttic-tech-hub/qa-runner-core";
export type DaemonConfig = {
    outputs: {
        manualDir: string;
        e2eDir: string;
        manifestPath: string;
    };
    overwriteGenerated?: boolean;
};
export type GenerationOutcome = {
    writtenFiles: string[];
    skippedFiles: string[];
    result: GenerationResult<string>;
};
export type GenerationMode = "manual" | "e2e" | "all";
export type GenerationOptions = {
    mode?: GenerationMode;
    ci?: boolean;
    timestampOverride?: number;
};
export declare class QaRunnerDaemon {
    private config;
    constructor(config: DaemonConfig);
    handleEvent(event: ChangeEvent, options?: GenerationOptions): Promise<GenerationOutcome>;
}
//# sourceMappingURL=daemon.d.ts.map