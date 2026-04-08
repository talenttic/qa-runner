export function normalizeSelectedTestTypes(input) {
    if (!input.types || input.types.length === 0) {
        return [input.defaultType];
    }
    const unique = [];
    for (const type of input.types) {
        if (!unique.includes(type)) {
            unique.push(type);
        }
    }
    return unique.length > 0 ? unique : [input.defaultType];
}
export function buildGeneratedTests(input) {
    const scopeSlug = input.slugify(input.suiteName) || "qa-generated";
    return input.cases.map((testCase, index) => {
        const selectedType = input.selectedTestTypes[index % input.selectedTestTypes.length] ?? input.defaultTestType;
        const caseSlug = input.slugify(testCase.title) || `case-${index + 1}`;
        const featureKey = `${scopeSlug}-${caseSlug}`;
        return {
            id: `gen_test_${input.createId()}`,
            title: `${testCase.title} (${selectedType})`,
            testType: selectedType,
            riskLevel: testCase.priority === "critical" || testCase.priority === "high" ? "high" : "medium",
            tags: [
                input.baseTagByType[selectedType],
                "@generated",
                ...((testCase.playwrightTags ?? []).map((tag) => tag.trim()).filter(Boolean)),
            ],
            featureKey,
            filePath: input.filePathForFeature(featureKey),
            testIdSelectors: input.testIdSelectorsForFeature(featureKey),
        };
    });
}
//# sourceMappingURL=tests.js.map