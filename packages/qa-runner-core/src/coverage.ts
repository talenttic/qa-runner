export type QaRunReport = {
  runId: string;
  status: "passed" | "failed" | "unknown";
  startedAt: string;
  completedAt: string;
  artifacts?: string[];
};

export type QaCoverageReport = {
  runId: string;
  generatedAt: string;
  summary: {
    linesCovered: number;
    linesTotal: number;
    coveragePercent: number;
  };
  files?: Array<{ path: string; linesCovered: number; linesTotal: number }>;
};

export type CoveragePlugin = {
  name: string;
  collectCoverage(runId: string): Promise<QaCoverageReport> | QaCoverageReport;
};
