import type { E2EScaffoldSkill } from "../types";
import type { QaGeneratedTestArtifact } from "../../generation/tests";
export declare function createPlaywrightScaffoldTemplateSkill(input: {
    specPathForTest: (test: QaGeneratedTestArtifact) => string;
    pageObjectPathForTest: (test: QaGeneratedTestArtifact) => string;
    pageObjectImportPathForSpec: (test: QaGeneratedTestArtifact) => string;
    classNameForTest: (test: QaGeneratedTestArtifact) => string;
}): E2EScaffoldSkill;
//# sourceMappingURL=playwrightScaffold.d.ts.map