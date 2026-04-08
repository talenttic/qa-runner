import type { QaRunReport, QaCoverageReport } from "@talenttic-tech-hub/qa-runner-core";
export type CloudClientConfig = {
    endpoint: string;
    apiKey?: string;
};
export declare class QaRunnerCloudClient {
    private config;
    constructor(config: CloudClientConfig);
    uploadRunReport(report: QaRunReport): Promise<void>;
    uploadCoverage(report: QaCoverageReport): Promise<void>;
    private postJson;
}
//# sourceMappingURL=index.d.ts.map