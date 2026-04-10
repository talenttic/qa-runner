import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseAutoTestOverride, parseHealingOverride, resolveRuntimeProfile } from "../../runtime-profile.js";
import type { QaRunnerCliConfig } from "../../config.js";

test("resolveRuntimeProfile applies env defaults and runtime overrides", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qa-runner-profile-"));
  const config: QaRunnerCliConfig = {};

  const prod = resolveRuntimeProfile({
    cwd: tmp,
    e2eDir: path.join(tmp, "e2e"),
    environment: "prod",
    config,
  });
  assert.equal(prod.autoTestEnabled, false);
  assert.equal(prod.healingStrategy, "conservative");

  const overridden = resolveRuntimeProfile({
    cwd: tmp,
    e2eDir: path.join(tmp, "e2e"),
    environment: "prod",
    config,
    overrides: { autoTest: true, healingStrategy: "aggressive" },
  });
  assert.equal(overridden.autoTestEnabled, true);
  assert.equal(overridden.healingStrategy, "aggressive");
});

test("resolveRuntimeProfile reads suite-level test-suite.yml", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qa-runner-suite-"));
  const suitePath = path.join(tmp, "test-suite.yml");
  fs.writeFileSync(
    suitePath,
    [
      "suite:",
      "  autoTest:",
      "    enabled: false",
      "  healing:",
      "    strategy: conservative",
      "    retryBudget: 1",
    ].join("\n"),
    "utf-8",
  );

  const resolved = resolveRuntimeProfile({
    cwd: tmp,
    e2eDir: path.join(tmp, "e2e"),
    environment: "dev",
    config: {},
  });
  assert.equal(resolved.autoTestEnabled, false);
  assert.equal(resolved.healingStrategy, "conservative");
  assert.equal(resolved.healingRetryBudget, 1);
});

test("parseAutoTestOverride and parseHealingOverride parse CLI flags", () => {
  assert.equal(parseAutoTestOverride(["--auto-test"]), true);
  assert.equal(parseAutoTestOverride(["--no-auto-test"]), false);
  assert.equal(parseAutoTestOverride([]), undefined);
  assert.equal(parseHealingOverride(["--healing=moderate"]), "moderate");
  assert.equal(parseHealingOverride(["--healing", "aggressive"]), "aggressive");
});

