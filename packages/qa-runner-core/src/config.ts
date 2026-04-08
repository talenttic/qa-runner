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

export function validateConfig(config: QaRunnerConfig): QaRunnerConfigValidation {
  const errors: string[] = [];
  if (!config.outputs.manual) {
    errors.push("outputs.manual is required");
  }
  if (!config.outputs.e2e) {
    errors.push("outputs.e2e is required");
  }
  if (!config.outputs.reports) {
    errors.push("outputs.reports is required");
  }
  if (!Array.isArray(config.ui.readPaths) || config.ui.readPaths.length === 0) {
    errors.push("ui.readPaths must be a non-empty array");
  }
  return { ok: errors.length === 0, errors };
}
