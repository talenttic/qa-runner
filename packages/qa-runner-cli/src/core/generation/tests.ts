import type { PromptGeneratedCase } from "./prompt.js";

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

export function normalizeSelectedTestTypes<T extends string>(input: {
  types: T[] | undefined;
  defaultType: T;
}): T[] {
  if (!input.types || input.types.length === 0) {
    return [input.defaultType];
  }
  const unique: T[] = [];
  for (const type of input.types) {
    if (!unique.includes(type)) {
      unique.push(type);
    }
  }
  return unique.length > 0 ? unique : [input.defaultType];
}

export function buildGeneratedTests<TCase extends PromptGeneratedCase, TTestType extends string>(input: {
  suiteName: string;
  cases: TCase[];
  selectedTestTypes: TTestType[];
  defaultTestType: TTestType;
  baseTagByType: Record<TTestType, string>;
  slugify: (input: string) => string;
  createId: () => string;
  filePathForFeature: (featureKey: string) => string;
  testIdSelectorsForFeature: (featureKey: string) => string[];
}): Array<QaGeneratedTestArtifact<TTestType>> {
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
