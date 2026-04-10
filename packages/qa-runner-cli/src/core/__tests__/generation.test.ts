import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGeneratedTests, generateCasesFromPrompt, normalizeSelectedTestTypes } from "../index.js";

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);

const createId = (): string => "fixed-id";

const filePathForFeature = (featureKey: string): string => `e2e/generated/${featureKey}.spec.ts`;

const testIdSelectorsForFeature = (featureKey: string): string[] => [
  `qa-${featureKey}-root`,
  `qa-${featureKey}-primary-action`,
  `qa-${featureKey}-result`,
];

test("generateCasesFromPrompt is deterministic", () => {
  const prompt = "Create a new settings form";
  const scope = { pluginIds: ["settings"], routes: ["/settings"] };
  const first = generateCasesFromPrompt({ prompt, scope });
  const second = generateCasesFromPrompt({ prompt, scope });
  assert.deepEqual(first, second);
});

test("normalizeSelectedTestTypes preserves order and uniqueness", () => {
  const types = normalizeSelectedTestTypes({ types: ["ui", "ui", "api"], defaultType: "ui" });
  assert.deepEqual(types, ["ui", "api"]);
});

test("buildGeneratedTests is deterministic with fixed id", () => {
  const prompt = "Create a new settings form";
  const scope = { pluginIds: ["settings"], routes: ["/settings"] };
  const generated = generateCasesFromPrompt({ prompt, scope });
  const tests = buildGeneratedTests({
    suiteName: generated.suiteName,
    cases: generated.cases,
    selectedTestTypes: ["ui"],
    defaultTestType: "ui",
    baseTagByType: { ui: "@ui" },
    slugify,
    createId,
    filePathForFeature,
    testIdSelectorsForFeature,
  });

  const testsAgain = buildGeneratedTests({
    suiteName: generated.suiteName,
    cases: generated.cases,
    selectedTestTypes: ["ui"],
    defaultTestType: "ui",
    baseTagByType: { ui: "@ui" },
    slugify,
    createId,
    filePathForFeature,
    testIdSelectorsForFeature,
  });

  assert.deepEqual(tests, testsAgain);
});
