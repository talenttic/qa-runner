import test from "node:test";
import assert from "node:assert/strict";
import { buildAiExecutionPlan, buildAiValidationSignals, createAiAutoTesterSkill } from "../index.js";

test("buildAiExecutionPlan classifies steps into preconditions/actions/assertions", () => {
  const plan = buildAiExecutionPlan({
    suiteName: "Checkout",
    cases: [
      {
        title: "Checkout works",
        useCase: "order",
        expectedResult: "success",
        priority: "high",
        steps: [
          "Given user is logged in as buyer",
          "Click checkout button",
          "Verify order confirmation is visible",
        ],
      },
    ],
  });

  assert.equal(plan.cases.length, 1);
  assert.equal(plan.cases[0]?.preconditions.length, 1);
  assert.equal(plan.cases[0]?.actions.length, 1);
  assert.equal(plan.cases[0]?.assertions.length, 1);
});

test("buildAiValidationSignals flags low-confidence ambiguous steps", () => {
  const plan = buildAiExecutionPlan({
    suiteName: "Settings",
    cases: [
      {
        title: "Vague flow",
        useCase: "settings",
        expectedResult: "saved",
        priority: "medium",
        steps: ["Do something", "Maybe verify stuff"],
      },
    ],
  });

  const validation = buildAiValidationSignals(plan, 0.7);
  assert.ok(validation.some((item) => item.belowThreshold));
});

test("createAiAutoTesterSkill returns artifacts for plan and validation", async () => {
  const skill = createAiAutoTesterSkill({ confidenceThreshold: 0.7, environments: ["dev", "stage"] });
  const result = await skill.executeAutoTest({
    suiteName: "Profile",
    environment: "dev",
    cases: [
      {
        title: "Profile save",
        useCase: "profile",
        expectedResult: "saved",
        priority: "high",
        steps: ["Enter name into field with data-testid=profile-name", "Verify success toast appears"],
      },
    ],
  });

  assert.equal(result.success, true);
  assert.ok((result.artifacts?.length ?? 0) >= 3);
});

test("createAiAutoTesterSkill shell mode reflects command exit status", async () => {
  const skill = createAiAutoTesterSkill({
    executionMode: "shell",
    playwrightCommand: "true",
  });
  const result = await skill.executeAutoTest({
    suiteName: "ShellRun",
    environment: "stage",
    cases: [
      {
        title: "Shell execution",
        useCase: "runtime",
        expectedResult: "ok",
        priority: "medium",
        steps: ["Click run", "Verify result"],
      },
    ],
  });

  assert.equal(result.success, true);
  assert.equal(result.execution?.mode, "shell");
  assert.equal(result.execution?.exitCode, 0);
});

test("createAiAutoTesterSkill mcp mode returns mcp execution metadata", async () => {
  const skill = createAiAutoTesterSkill({
    executionMode: "mcp",
  });
  const result = await skill.executeAutoTest({
    suiteName: "McpRun",
    environment: "stage",
    cases: [
      {
        title: "MCP execution",
        useCase: "runtime",
        expectedResult: "ok",
        priority: "medium",
        steps: ["Click run", "Verify result"],
      },
    ],
  });

  assert.equal(result.success, true);
  assert.equal(result.execution?.mode, "mcp");
});

test("createAiAutoTesterSkill uses model adapter output when provided", async () => {
  const skill = createAiAutoTesterSkill({
    modelAdapter: {
      generate: () => "import { test } from '@playwright/test';\n\ntest('llm generated', async () => {});",
    },
  });
  const result = await skill.executeAutoTest({
    suiteName: "ModelGenerated",
    cases: [
      {
        title: "Generated path",
        useCase: "ai",
        expectedResult: "generated",
        priority: "high",
        steps: ["Click start", "Verify output"],
      },
    ],
  });

  const generated = result.artifacts?.find((item) => item.path.endsWith(".ai-generated.spec.ts"))?.content ?? "";
  assert.ok(generated.includes("llm generated"));
});
