import type { PromptGeneratedCase } from "./prompt";
export type QaGeneratedTestArtifact<TTestType extends string = string> = {
    id: string;
    title: string;
    testType: TTestType;
    riskLevel: "low" | "medium" | "high";
    tags: string[];
    featureKey: string;
    filePath: string;
    testIdSelectors: string[];
};
export declare function normalizeSelectedTestTypes<T extends string>(input: {
    types: T[] | undefined;
    defaultType: T;
}): T[];
export declare function buildGeneratedTests<TCase extends PromptGeneratedCase, TTestType extends string>(input: {
    suiteName: string;
    cases: TCase[];
    selectedTestTypes: TTestType[];
    defaultTestType: TTestType;
    baseTagByType: Record<TTestType, string>;
    slugify: (input: string) => string;
    createId: () => string;
    filePathForFeature: (featureKey: string) => string;
    testIdSelectorsForFeature: (featureKey: string) => string[];
}): Array<QaGeneratedTestArtifact<TTestType>>;
//# sourceMappingURL=tests.d.ts.map