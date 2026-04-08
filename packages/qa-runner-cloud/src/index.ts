import type { QaRunReport, QaCoverageReport } from "@talenttic-tech-hub/qa-runner-core";

export type CloudClientConfig = {
  endpoint: string;
  apiKey?: string;
};

export class QaRunnerCloudClient {
  constructor(private config: CloudClientConfig) {}

  async uploadRunReport(report: QaRunReport): Promise<void> {
    await this.postJson("/reports", report);
  }

  async uploadCoverage(report: QaCoverageReport): Promise<void> {
    await this.postJson("/coverage", report);
  }

  private async postJson(path: string, payload: unknown): Promise<void> {
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
