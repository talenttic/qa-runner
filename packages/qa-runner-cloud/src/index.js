export class QaRunnerCloudClient {
    config;
    constructor(config) {
        this.config = config;
    }
    async uploadRunReport(report) {
        await this.postJson("/reports", report);
    }
    async uploadCoverage(report) {
        await this.postJson("/coverage", report);
    }
    async postJson(path, payload) {
        const res = await fetch(`${this.config.endpoint}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
            },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`cloud_upload_failed:${res.status}:${text}`);
        }
    }
}
//# sourceMappingURL=index.js.map