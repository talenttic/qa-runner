import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGeneratedTests, generateCasesFromPrompt, normalizeSelectedTestTypes } from "../index";
const slugify = (input) => input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
const createId = () => "fixed-id";
const filePathForFeature = (featureKey) => `e2e/generated/${featureKey}.spec.ts`;
const testIdSelectorsForFeature = (featureKey) => [
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
//# sourceMappingURL=generation.test.js.map