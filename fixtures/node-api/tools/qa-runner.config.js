/** @type {import("@talenttic/qa-runner").QaRunnerCliConfig} */
export default {
  outputs: {
    manualDir: "docs/qa-cases",
    e2eDir: "e2e/generated",
    manifestPath: "tools/qa-runner.manifest.json",
  },
  skills: {
    manualGuide: { enabled: true },
    e2eScaffold: { enabled: true },
    selfHealing: { enabled: true, strategy: "moderate", retryBudget: 3 },
    aiAutoTester: { enabled: true, executionMode: "simulated" },
    flakinessDetector: { enabled: true, unstableThreshold: 0.2 },
  },
  tests: {
    command: "npm --prefix e2e/ui test",
  },
};
