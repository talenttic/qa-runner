export { validateConfig } from "./config";
export { validateChangeEvent } from "./validation";
export function buildManifest(event, outputs) {
    return {
        version: "0.1.0",
        generatedAt: new Date().toISOString(),
        inputs: {
            files: event.files,
            summary: event.summary,
            diffPresent: Boolean(event.diff),
            tool: event.tool,
        },
        outputs,
    };
}
export { generateCasesFromPrompt } from "./generation/prompt";
export { buildGeneratedTests, normalizeSelectedTestTypes } from "./generation/tests";
export { renderManualGuideMarkdown, createManualGuideTemplateSkill } from "./skills/templates/manualGuide";
export { createPlaywrightScaffoldTemplateSkill } from "./skills/templates/playwrightScaffold";
export { runGeneration } from "./orchestrator/generation";
//# sourceMappingURL=index.js.map