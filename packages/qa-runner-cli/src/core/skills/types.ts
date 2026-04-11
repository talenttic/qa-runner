import type { PromptGeneratedCase, PromptScope } from "../generation/prompt.js";
import type { QaGeneratedTestArtifact } from "../generation/tests.js";

export type GeneratedFile = {
  path: string;
  content: string;
};

export type ManualGuideInput = {
  prompt: string;
  scope: PromptScope;
  cases: PromptGeneratedCase[];
};

export type ManualGuideResult = {
  files: GeneratedFile[];
};

export type ManualGuideSkill = {
  name: string;
  generateManualGuides(input: ManualGuideInput): Promise<ManualGuideResult> | ManualGuideResult;
};

export type E2EGuideInput = {
  suiteName: string;
  cases: PromptGeneratedCase[];
  tests: QaGeneratedTestArtifact[];
};

export type E2EGuideResult = {
  files: GeneratedFile[];
};

export type E2EScaffoldSkill = {
  name: string;
  generatePlaywrightScaffold(input: E2EGuideInput): Promise<E2EGuideResult> | E2EGuideResult;
};

export type SkillToggle = {
  enabled?: boolean;
};

export type SelfHealingStrategy = "aggressive" | "moderate" | "conservative";

export type SelfHealingConfig = SkillToggle & {
  strategy?: SelfHealingStrategy;
  retryBudget?: number;
  priority?: string[];
  flakinessTolerance?: number;
  perSuite?: Record<string, Omit<SelfHealingConfig, "perSuite">>;
};

export type SkillsConfig = {
  manualGuide?: SkillToggle;
  e2eScaffold?: SkillToggle;
  selfHealing?: SelfHealingConfig;
  aiAutoTester?: SkillToggle & {
    confidenceThreshold?: number;
    environments?: string[];
    executionMode?: "simulated" | "shell" | "mcp";
    playwrightCommand?: string;
    workspaceRoot?: string;
    mcp?: {
      transport?: "http" | "stdio";
      url?: string;
      command?: string;
      args?: string[];
      timeoutMs?: number;
    };
  };
  flakinessDetector?: SkillToggle & {
    unstableThreshold?: number;
  };
};

export type SelfHealingCandidate = {
  strategy: string;
  selector: string;
  confidence?: number;
  notes?: string;
};

export type SelfHealingInput = {
  selector: string;
  testId?: string;
  attempt: number;
  candidates?: SelfHealingCandidate[];
  visualCandidates?: Array<{
    selector: string;
    visualHash: string;
    notes?: string;
  }>;
  context?: {
    dataTestId?: string;
    ariaLabel?: string;
    role?: string;
    text?: string;
    visualHash?: string;
  };
};

export type SelfHealingResult = {
  recovered: boolean;
  selector?: string;
  strategy?: string;
  notes?: string;
};

export type SelfHealingSkill = {
  name: string;
  attemptRecovery(input: SelfHealingInput): Promise<SelfHealingResult> | SelfHealingResult;
};

export type AiAutoTesterInput = {
  suiteName: string;
  cases: PromptGeneratedCase[];
  environment?: string;
};

export type AiStepKind = "precondition" | "action" | "assertion";

export type AiExecutionStep = {
  id: string;
  raw: string;
  kind: AiStepKind;
  confidence: number;
  normalized: string;
};

export type AiPreparedCase = {
  caseId: string;
  title: string;
  preconditions: AiExecutionStep[];
  actions: AiExecutionStep[];
  assertions: AiExecutionStep[];
};

export type AiExecutionPlan = {
  suiteName: string;
  cases: AiPreparedCase[];
};

export type AiValidationSignal = {
  caseId: string;
  stepId: string;
  confidence: number;
  belowThreshold: boolean;
  suggestion?: string;
  visualDiff?: {
    expected: string;
    actual: string;
    deltaRatio: number;
  };
};

export type AiExecutionStepResult = {
  stepId: string;
  status: "passed" | "failed";
  confidence: number;
  screenshotPath?: string;
  domInspection?: {
    selectorHint?: string;
    extractedText?: string;
  };
  fallbackApplied?: boolean;
};

export type AiExecutionCaseResult = {
  caseId: string;
  passed: boolean;
  steps: AiExecutionStepResult[];
};

export type AiAutoTesterResult = {
  success: boolean;
  plan?: AiExecutionPlan;
  execution?: {
    mode: "simulated" | "shell" | "mcp";
    command?: string;
    exitCode?: number;
    cases: AiExecutionCaseResult[];
  };
  validation?: AiValidationSignal[];
  lowConfidenceCount?: number;
  artifacts?: GeneratedFile[];
  notes?: string;
};

export type AiAutoTesterSkill = {
  name: string;
  executeAutoTest(input: AiAutoTesterInput): Promise<AiAutoTesterResult> | AiAutoTesterResult;
};

export type FlakinessSignal = {
  testId: string;
  outcome: "pass" | "fail";
  durationMs?: number;
  category?: "timing" | "selector" | "assertion";
};

export type FlakinessRecord = {
  recorded: boolean;
  flakeScore?: number;
  passRate?: number;
  totalRuns?: number;
  unstable?: boolean;
  categoryBreakdown?: {
    timing: number;
    selector: number;
    assertion: number;
  };
  dominantCategory?: "timing" | "selector" | "assertion" | "none";
};

export type FlakinessDetectorSkill = {
  name: string;
  recordSignal(input: FlakinessSignal): Promise<FlakinessRecord> | FlakinessRecord;
};
