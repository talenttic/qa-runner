/** @type {import("@talenttic/qa-runner").QaRunnerCliConfig} */
module.exports = {
  skills: {
    manualGuide: { enabled: true },
    e2eScaffold: { enabled: true },
    selfHealing: {
      enabled: true,
      strategy: "moderate",
      retryBudget: 5,
      priority: ["data-testid", "aria-label", "visual-hash"],
      flakinessTolerance: 0.2,
    },
    aiAutoTester: {
      enabled: true,
      confidenceThreshold: 0.7,
      executionMode: "simulated",
      environments: ["dev", "stage", "prod"],
    },
    flakinessDetector: {
      enabled: true,
      unstableThreshold: 0.2,
    },
  },
  environments: {
    dev: {
      autoTest: { enabled: true },
      healing: { strategy: "aggressive", retryBudget: "unlimited" },
    },
    stage: {
      autoTest: { enabled: true },
      healing: { strategy: "moderate", retryBudget: 5 },
    },
    prod: {
      autoTest: { enabled: false },
      healing: { strategy: "conservative", retryBudget: 2 },
    },
  },
  report: {
    outputPath: "tools/qa-runner.report.json",
  },
};

