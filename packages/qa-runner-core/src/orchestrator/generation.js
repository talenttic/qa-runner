import { buildGeneratedTests, generateCasesFromPrompt, normalizeSelectedTestTypes, } from "../index";
export async function runGeneration(input) {
    const generated = generateCasesFromPrompt({
        prompt: input.prompt,
        scope: input.scope,
    });
    const selectedTestTypes = normalizeSelectedTestTypes({
        types: input.selectedTestTypes,
        defaultType: input.defaultTestType,
    });
    const tests = buildGeneratedTests({
        suiteName: generated.suiteName,
        cases: generated.cases,
        selectedTestTypes,
        defaultTestType: input.defaultTestType,
        baseTagByType: input.baseTagByType,
        slugify: input.slugify,
        createId: input.createId,
        filePathForFeature: input.filePathForFeature,
        testIdSelectorsForFeature: input.testIdSelectorsForFeature,
    });
    const files = [];
    if (input.manualSkill) {
        const manualResult = await input.manualSkill.generateManualGuides({
            prompt: input.prompt,
            scope: input.scope,
            cases: generated.cases,
        });
        files.push(...manualResult.files);
    }
    if (input.e2eSkill) {
        const e2eResult = await input.e2eSkill.generatePlaywrightScaffold({
            suiteName: generated.suiteName,
            cases: generated.cases,
            tests,
        });
        files.push(...e2eResult.files);
    }
    const manifest = {
        version: "0.1.0",
        generatedAt: input.generatedAt ?? new Date().toISOString(),
        inputs: {
            files: input.event.files,
            summary: input.event.summary,
            diffPresent: Boolean(input.event.diff),
            tool: input.event.tool,
        },
        outputs: {
            manualGuides: files.filter((file) => file.path.endsWith(".md")).map((file) => file.path),
            e2eSpecs: files.filter((file) => file.path.endsWith(".spec.ts")).map((file) => file.path),
        },
    };
    return {
        suiteName: generated.suiteName,
        cases: generated.cases,
        tests,
        files,
        manifest,
    };
}
//# sourceMappingURL=generation.js.map